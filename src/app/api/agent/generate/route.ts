import { NextResponse } from 'next/server';
import { ai } from '@/lib/gemini';
import { createClient } from '@/lib/supabase/server';
import { imageUrlToPart } from '@/lib/imageUtils';
import { generateFabricCardSpecs } from '@/lib/agents/fabricAgent';
import { generateStyleDnaSpecs } from '@/lib/agents/styleAgent';
import { detectAndResolveConflict, loadFabricCandidates, loadStyleDnaCandidates } from '@/lib/agents/conflictDetector';
import { buildSystemPrompt } from '@/lib/prompts/systemPrompt';
import { runAgentLoop } from '@/lib/agents/agentLoop';

// All helper functions and tool declarations have been extracted to:
// - @/lib/imageUtils (imageUrlToPart)
// - @/lib/agents/fabricAgent (generateFabricCardSpecs)
// - @/lib/agents/styleAgent (generateStyleDnaSpecs)
// - @/lib/agents/conflictDetector (detectAndResolveConflict, loadFabricCandidates, loadStyleDnaCandidates)
// - @/lib/tools/declarations (generateGarmentTool, createStyleDnaTool, createFabricCardTool)
// - @/lib/prompts/systemPrompt (buildSystemPrompt)


export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const isUuid = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
    
    // 1. Auth Check
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    let { 
      prompt: userPrompt, 
      styleDnaId, 
      fabricCardId, 
      projectId, 
      parentVersionId,
      referencedGarmentIds = [],
      imageUrls = [], // Multimodal attachments
      displayMode = 'white_background', 
      imageGenModel = 'gemini-3.1-flash-image',
      stream = false,
      agentModel = 'auto',
      agentStyle = 'default',
      imageResolution = '1024x1024',
      conflictResolved = false,
      agentMessageId,
      decisionContext
    } = body;

    const validAgentMsgId = (agentMessageId && isUuid(agentMessageId)) ? agentMessageId : undefined;

    if (!userPrompt) {
      return NextResponse.json({ error: 'User prompt is required' }, { status: 400 });
    }

    const isChinese = /[\u4e00-\u9fa5]/.test(userPrompt);

    const runWorkflow = async (
      onStatus: (status: string, target?: string) => void,
      onResult: (data: any) => void,
      onCustomChunk?: (type: string, data: any) => void
    ) => {
      onStatus('understanding');

      let createdFabricCard: any = null;
      let createdStyleDna: any = null;

      // Save user's message to chat_messages first, skipping on resubmission to avoid duplication
      if (!conflictResolved) {
        await supabase.from('chat_messages').insert({
          project_id: projectId || null,
          user_id: user.id,
          role: 'user',
          text: userPrompt,
          image_urls: imageUrls || []
        });
      }

      let styleDnaData: any = null;
      let fabricCardData: any = null;

      // 1.5 Sub-agent dynamic asset generation pipeline (v1.6.6)
      // Handle Fabric Card pre-generation
      if (fabricCardId && !isUuid(fabricCardId)) {
        onStatus('waiting_subagent_fabric', fabricCardId);
        onStatus('subagent_generating_fabric', fabricCardId);
        const specs = await generateFabricCardSpecs(fabricCardId, userPrompt);
        
        onStatus('subagent_saving_fabric', fabricCardId);
        const { data: newFabric, error: insertErr } = await supabase
          .from('fabric_cards')
          .insert({
            ...specs,
            user_id: user.id,
            project_id: projectId || null
          })
          .select()
          .single();

        if (insertErr) {
          throw new Error(`Failed to save dynamic fabric card: ${insertErr.message}`);
        }

        if (newFabric) {
          fabricCardId = newFabric.id;
          fabricCardData = newFabric;
          createdFabricCard = newFabric;
          if (onCustomChunk) {
            onCustomChunk('created_fabric', newFabric);
          }
        }
      }

      // Handle Style DNA pre-generation
      if (styleDnaId && !isUuid(styleDnaId)) {
        onStatus('waiting_subagent_style', styleDnaId);
        onStatus('subagent_generating_style', styleDnaId);
        const specs = await generateStyleDnaSpecs(styleDnaId, userPrompt);
        
        onStatus('subagent_saving_style', styleDnaId);
        const { data: newDna, error: insertErr } = await supabase
          .from('style_dnas')
          .insert({
            ...specs,
            user_id: user.id,
            project_id: projectId || null
          })
          .select()
          .single();

        if (insertErr) {
          throw new Error(`Failed to save dynamic style DNA: ${insertErr.message}`);
        }

        if (newDna) {
          styleDnaId = newDna.id;
          styleDnaData = newDna;
          createdStyleDna = newDna;
          if (onCustomChunk) {
            onCustomChunk('created_style', newDna);
          }
        }
      }

      // 2. Fetch Constraints Style DNA & Fabric parameters if provided
      if (styleDnaId && isUuid(styleDnaId) && !styleDnaData) {
        const { data } = await supabase
          .from('style_dnas')
          .select('*')
          .eq('id', styleDnaId)
          .single();
        styleDnaData = data;
      }

      if (fabricCardId && isUuid(fabricCardId) && !fabricCardData) {
        const { data } = await supabase
          .from('fabric_cards')
          .select('*')
          .eq('id', fabricCardId)
          .single();
        fabricCardData = data;
      }

      let parentGarmentData: any = null;
      if (parentVersionId && isUuid(parentVersionId)) {
        const { data } = await supabase
          .from('garment_cards')
          .select('*')
          .eq('id', parentVersionId)
          .single();
        parentGarmentData = data;
      }

      let referencedGarmentsData: any[] = [];
      if (referencedGarmentIds && referencedGarmentIds.length > 0) {
        const validIds = referencedGarmentIds.filter(isUuid);
        if (validIds.length > 0) {
          const { data } = await supabase
            .from('garment_cards')
            .select('*')
            .in('id', validIds);
          if (data) {
            referencedGarmentsData = data;
          }
        }
      }

      // 2.5 Perform conflict detection if not already resolved by user
      if (!conflictResolved) {
        // Tiered candidate query: project-first, user-global fallback, cap 10
        const [projectFabricCards, projectStyleDnas] = await Promise.all([
          loadFabricCandidates(supabase, user.id, projectId),
          loadStyleDnaCandidates(supabase, user.id, projectId)
        ]);

        const conflictResult = await detectAndResolveConflict({
          userPrompt,
          activeFabricCard: fabricCardData,
          activeStyleDna: styleDnaData,
          projectFabricCards,
          projectStyleDnas
        });

        if (conflictResult.hasConflict) {
          const conflictData = {
            type: 'conflict_resolution',
            conflictType: conflictResult.conflictType,
            question: conflictResult.question || '您希望如何展现这款设计？',
            options: conflictResult.options || []
          };

          // Save agent's conflict message to chat_messages DB
          await supabase.from('chat_messages').insert({
            ...(validAgentMsgId ? { id: validAgentMsgId } : {}),
            project_id: projectId || null,
            user_id: user.id,
            role: 'agent',
            text: conflictData.question,
            grounding_metadata: {
              ...conflictData,
              resolved: false
            }
          });

          // Return result early and terminate workflow execution
          onResult(conflictData);
          return;
        } else if (conflictResult.matchedEntityId) {
          // Silent match: re-fetch complete record (candidates are trimmed)
          if (conflictResult.conflictType === 'fabric') {
            const { data } = await supabase
              .from('fabric_cards').select('*')
              .eq('id', conflictResult.matchedEntityId).single();
            if (data) {
              fabricCardData = data;
              fabricCardId = data.id;
              console.log('[Conflict Interceptor] Silent match applied fabric card:', data.name);
            }
          } else if (conflictResult.conflictType === 'style_dna') {
            const { data } = await supabase
              .from('style_dnas').select('*')
              .eq('id', conflictResult.matchedEntityId).single();
            if (data) {
              styleDnaData = data;
              styleDnaId = data.id;
              console.log('[Conflict Interceptor] Silent match applied style DNA:', data.name);
            }
          }
        }
      }

      // 3. Create Generation Task (Pending)
      const { data: task, error: taskError } = await supabase
        .from('generation_tasks')
        .insert({
          user_id: user.id,
          project_id: projectId || null,
          status: 'pending',
          input: { userPrompt, styleDnaId, fabricCardId, parentVersionId, referencedGarmentIds, displayMode, imageGenModel }
        })
        .select()
        .single();

      if (taskError) {
        throw new Error(taskError.message);
      }

      // Update status to running
      await supabase.from('generation_tasks').update({ status: 'running' }).eq('id', task.id);

      // Convert new URLs to Gemini inline parts
      let imageParts: any[] = [];
      if (imageUrls && Array.isArray(imageUrls) && imageUrls.length > 0) {
        imageParts = await Promise.all(
          imageUrls.map(url => imageUrlToPart(url))
        );
      }

      // 4. Fetch last 15 historical messages for context
      const { data: dbMessages } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(15);

      const contents: any[] = [];
      if (dbMessages && dbMessages.length > 0) {
        const sortedMessages = [...dbMessages].reverse();
        for (const msg of sortedMessages) {
          const role = msg.role === 'user' ? 'user' : 'model';
          const parts: any[] = [];
          
          if (msg.image_urls && msg.image_urls.length > 0) {
            try {
              const histParts = await Promise.all(
                msg.image_urls.map((url: string) => imageUrlToPart(url))
              );
              parts.push(...histParts);
            } catch (err) {
              console.error("Failed to parse historical image URL", err);
            }
          }
          parts.push({ text: msg.text || '' });
          contents.push({ role, parts });
        }
      }

      // Append the new message
      const newParts: any[] = [...imageParts];
      newParts.push({ text: userPrompt });
      contents.push({ role: 'user', parts: newParts });

      // 5. Construct Gemini system Instruction (extracted to module)
      const systemPrompt = buildSystemPrompt({
        agentStyle,
        styleDnaData,
        fabricCardData,
        parentGarmentData,
        referencedGarmentsData,
        decisionContext: decisionContext || undefined,
      });

      // 6. Run Agent Loop (multi-round tool execution)
      const loopResult = await runAgentLoop({
        ctx: {
          supabase,
          ai,
          userId: user.id,
          projectId,
          snapshot: {
            originalPrompt: userPrompt,
            workflowIntent: 'GENERATE', // Will be overridden by classifier
            parentVersionId,
            referencedGarmentIds: referencedGarmentIds || [],
            imageUrls: imageUrls || [],
            activeFabricCardId: fabricCardId,
            activeStyleDnaId: styleDnaId,
            decisionContext: decisionContext || undefined,
          },
          parentVersionId,
          fabricCardData,
          fabricCardId,
          styleDnaData,
          styleDnaId,
          displayMode,
          imageGenModel,
        },
        systemPrompt,
        contents,
        imageParts,
        imageUrls: imageUrls || [],
        callbacks: {
          onStatus: (status, extra) => onStatus(status, extra?.target),
          onCustomChunk: onCustomChunk || (() => {}),
        },
        taskId: task.id,
        validAgentMsgId: validAgentMsgId || null,
        conflictResolved,
        isChinese,
        imageResolution,
        agentModel,
      });

      // Handle interrupted loop (design decision card sent)
      if (loopResult.interrupted) {
        onResult({ type: 'design_decision', interrupted: true });
        return;
      }

      // Extract results for streaming response
      const garmentResult = loopResult.toolResults.find(r => r.toolName === 'generate_garment_design' && r.success);
      const styleDnaResult = loopResult.toolResults.find(r => r.toolName === 'create_style_dna' && r.success);
      const fabricCardResult = loopResult.toolResults.find(r => r.toolName === 'create_fabric_card' && r.success);

      const garmentCard = garmentResult?.asset || null;
      const loopCreatedStyleDna = styleDnaResult?.asset || createdStyleDna;
      const loopCreatedFabricCard = fabricCardResult?.asset || createdFabricCard;
      const replyText = loopResult.replyText;

      // Save chat message if not already saved by a handler
      if (!garmentCard && !loopResult.interrupted) {
        onStatus('saving_chat_message');
        await supabase.from('chat_messages').insert({
          ...(validAgentMsgId ? { id: validAgentMsgId } : {}),
          project_id: projectId || null,
          user_id: user.id,
          role: 'agent',
          text: replyText,
          grounding_metadata: loopResult.groundingMetadata
        });

        await supabase.from('generation_tasks')
          .update({ status: 'success', output: { textReply: replyText } })
          .eq('id', task.id);
      } else if (garmentCard) {
        // Garment handler already saved the task status, save chat message
        await supabase.from('chat_messages').insert({
          ...(validAgentMsgId ? { id: validAgentMsgId } : {}),
          project_id: projectId || null,
          user_id: user.id,
          role: 'agent',
          text: replyText,
          garment_card_id: garmentCard.id
        });
      } else if (loopCreatedStyleDna) {
        await supabase.from('chat_messages').insert({
          ...(validAgentMsgId ? { id: validAgentMsgId } : {}),
          project_id: projectId || null,
          user_id: user.id,
          role: 'agent',
          text: replyText,
          grounding_metadata: { createdStyleDnaId: loopCreatedStyleDna.id }
        });
      } else if (loopCreatedFabricCard) {
        await supabase.from('chat_messages').insert({
          ...(validAgentMsgId ? { id: validAgentMsgId } : {}),
          project_id: projectId || null,
          user_id: user.id,
          role: 'agent',
          text: replyText,
          grounding_metadata: { createdFabricCardId: loopCreatedFabricCard.id }
        });
      }

      onResult({
        isToolCalled: loopResult.toolResults.length > 0,
        replyText,
        garmentCard,
        createdStyleDna: loopCreatedStyleDna,
        createdFabricCard: loopCreatedFabricCard,
        groundingMetadata: loopResult.groundingMetadata
      });
    };

    if (stream) {
      const encoder = new TextEncoder();
      const customStream = new ReadableStream({
        async start(controller) {
          const sendStatus = (status: string, target?: string) => {
            const data = JSON.stringify({ type: 'status', status, target });
            controller.enqueue(encoder.encode(data + '\n'));
          };
          
          const sendError = (message: string) => {
            const data = JSON.stringify({ type: 'error', message });
            controller.enqueue(encoder.encode(data + '\n'));
          };

          const sendResult = (resultData: any) => {
            const data = JSON.stringify({ type: 'result', data: resultData });
            controller.enqueue(encoder.encode(data + '\n'));
          };

          const sendCustomChunk = (type: string, data: any) => {
            const payload = JSON.stringify({ type, data });
            controller.enqueue(encoder.encode(payload + '\n'));
          };

          try {
            await runWorkflow(sendStatus, sendResult, sendCustomChunk);
          } catch (err: any) {
            console.error('Error in workflow streaming:', err);
            sendError(err?.message || 'Server execution error');
          } finally {
            controller.close();
          }
        }
      });

      return new Response(customStream, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-Content-Type-Options': 'nosniff'
        }
      });
    } else {
      // Non-streaming fallback
      let finalResultData: any = null;
      await runWorkflow(
        () => {}, // no-op
        (res) => { finalResultData = res; },
        () => {} // no-op
      );

      return NextResponse.json({
        success: true,
        data: finalResultData
      });
    }

  } catch (err: any) {
    console.error('Error in agent generate API:', err);
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}
