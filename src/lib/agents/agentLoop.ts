import { ai } from '@/lib/gemini';
import { classifyIntent, selectModel } from '@/lib/agents/intentClassifier';
import { getToolsForIntent } from '@/lib/tools/declarations';
import { handleGarmentDesign } from '@/lib/tools/handlers/garmentDesign';
import { handleStyleDna } from '@/lib/tools/handlers/styleDna';
import { handleFabricCard } from '@/lib/tools/handlers/fabricCard';
import { handleDesignDecision } from '@/lib/tools/handlers/designDecision';
import type {
  WorkflowContext,
  ToolExecutionResult,
  AgentLoopResult,
  StreamCallbacks,
  WorkflowIntent
} from '@/lib/types/agent';

const MAX_ROUNDS = 3;

interface AgentLoopParams {
  ctx: WorkflowContext;
  systemPrompt: string;
  contents: any[];          // Gemini conversation history
  imageParts: any[];        // User-attached image parts
  imageUrls: string[];      // Original image URLs
  callbacks: StreamCallbacks;
  taskId: string;
  validAgentMsgId: string | null;
  conflictResolved: boolean;
  isChinese: boolean;
  imageResolution: string;
  agentModel: string;       // User's agent model preference
}

/**
 * Multi-round Agent Loop.
 * 
 * Flow:
 *   1. Classify intent → select model + mount tools
 *   2. Call LLM
 *   3. If tool call → dispatch to handler → feed result back as functionResponse
 *   4. If terminal tool (design_decision) → interrupt and return
 *   5. If no tool call → return text reply
 *   6. Loop up to MAX_ROUNDS
 */
export async function runAgentLoop(params: AgentLoopParams): Promise<AgentLoopResult> {
  const {
    ctx, systemPrompt, contents, imageParts, imageUrls,
    callbacks, taskId, validAgentMsgId, conflictResolved,
    isChinese, imageResolution, agentModel
  } = params;

  // 1. Classify intent
  callbacks.onStatus('classifying_intent');
  const userPrompt = ctx.snapshot.originalPrompt;
  const intent: WorkflowIntent = await classifyIntent(userPrompt);
  console.log('[Agent Loop] Classified intent:', intent);

  // 2. Select model
  const { modelName, thinkingConfig } = selectModel(intent, userPrompt, agentModel);

  // Emit status based on intent
  if (modelName.includes('pro')) {
    callbacks.onStatus('thinking');
  } else if (intent === 'GENERATE' || intent === 'CREATE_ASSET') {
    callbacks.onStatus('generating_tool_call');
  } else if (intent === 'SEARCH') {
    callbacks.onStatus('preparing_response');
  } else {
    callbacks.onStatus('understanding');
  }

  // 3. Mount tools
  const tools = getToolsForIntent(intent);
  console.log(`[Agent Loop] Routing to: ${modelName} with tools: ${tools.length > 0 ? 'yes' : 'none'}`);

  // 4. Multi-round loop
  const toolResults: ToolExecutionResult[] = [];
  let currentContents = [...contents];
  let replyText = '';
  let groundingMetadata: any = null;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    console.log(`[Agent Loop] Round ${round + 1}/${MAX_ROUNDS}`);

    const geminiResponse = await ai.models.generateContent({
      model: modelName,
      contents: currentContents,
      config: {
        systemInstruction: systemPrompt,
        thinkingConfig: thinkingConfig,
        tools: tools.length > 0 ? tools : undefined
      }
    });

    groundingMetadata = geminiResponse.candidates?.[0]?.groundingMetadata || null;
    const functionCalls = geminiResponse.functionCalls;

    // No tool calls → extract text and finish
    if (!functionCalls || functionCalls.length === 0) {
      replyText = geminiResponse.text || '';
      break;
    }

    // Process tool calls (currently handles one at a time for safety)
    const call = functionCalls[0];
    const args = call.args as any;
    let result: ToolExecutionResult;

    // Push tool_call_preview for frontend skeleton rendering
    if (call.name === 'generate_garment_design') {
      callbacks.onCustomChunk('tool_call_preview', {
        toolName: call.name,
        title: args.title,
        category: args.category,
        fit: args.fit,
        collar: args.collar,
        sleeves: args.sleeves,
        designRationale: args.design_rationale,
        review: {
          style_match_score: args.review_style_match_score,
          fabric_match_score: args.review_fabric_match_score,
          structure_clarity_score: args.review_structure_clarity_score,
          prompt_compliance_score: args.review_prompt_compliance_score,
        }
      });
    } else if (call.name !== 'present_design_decision') {
      callbacks.onCustomChunk('tool_call_preview', {
        toolName: call.name,
        name: args.name,
      });
    }

    switch (call.name) {
      case 'generate_garment_design':
        result = await handleGarmentDesign(
          args, ctx, callbacks, imageParts, taskId, imageResolution
        );
        break;

      case 'create_style_dna':
        result = await handleStyleDna(
          args, ctx, callbacks, imageUrls, taskId, conflictResolved
        );
        break;

      case 'create_fabric_card':
        result = await handleFabricCard(
          args, ctx, callbacks, imageUrls, taskId, conflictResolved
        );
        break;

      case 'present_design_decision':
        result = await handleDesignDecision(
          args, ctx, callbacks, validAgentMsgId, taskId
        );
        break;

      default:
        console.warn(`[Agent Loop] Unknown tool call: ${call.name}`);
        result = {
          toolName: call.name || 'unknown',
          success: false,
          error: `Unknown tool: ${call.name}`,
          summary: { error: `Unknown tool: ${call.name}` },
        };
    }

    toolResults.push(result);

    // Terminal tool → interrupt loop
    if (result.isTerminal) {
      return {
        replyText: '',
        toolResults,
        groundingMetadata,
        interrupted: true,
      };
    }

    // Tool failed → don't retry, surface error
    if (!result.success) {
      replyText = result.error || 'Tool execution failed.';
      break;
    }

    // Feed result back as functionResponse for next round
    currentContents.push({
      role: 'model',
      parts: [{ functionCall: { name: call.name, args } }]
    });
    currentContents.push({
      role: 'user',
      parts: [{ functionResponse: { name: call.name, response: result.summary } }]
    });
  }

  // Generate reply text from tool results if not already set
  if (!replyText && toolResults.length > 0) {
    const lastResult = toolResults[toolResults.length - 1];
    if (lastResult.toolName === 'generate_garment_design' && lastResult.success) {
      const garment = lastResult.asset;
      replyText = isChinese
        ? `我已为您生成了 "${garment.title}" 的设计款式卡。以下是设计原理：\n\n${garment.design_rationale}`
        : `I have generated the design card for "${garment.title}". Here is the design rationale:\n\n${garment.design_rationale}`;
    } else if (lastResult.toolName === 'create_style_dna' && lastResult.success) {
      const dna = lastResult.asset;
      replyText = isChinese
        ? `我已为您成功录入风格基因预设："${dna.name}"。\n\n**关键词**: ${dna.keywords.join(', ')}\n**色彩**: ${dna.colors.join(', ')}\n**廓形**: ${dna.silhouettes.join(', ')}`
        : `I have successfully recorded the Style DNA preset: "${dna.name}".\n\n**Keywords**: ${dna.keywords.join(', ')}\n**Colors**: ${dna.colors.join(', ')}\n**Silhouettes**: ${dna.silhouettes.join(', ')}`;
    } else if (lastResult.toolName === 'create_fabric_card' && lastResult.success) {
      const fabric = lastResult.asset;
      replyText = isChinese
        ? `我已为您成功录入面料样卡预设："${fabric.name}"。\n\n**成分**: ${fabric.composition}\n**厚度/克重**: ${fabric.weight_gsm ? `${fabric.weight_gsm} GSM` : '未指定'}\n**纹理**: ${fabric.texture}\n**生图描述**: ${fabric.prompt_description}`
        : `I have successfully recorded the Fabric Card preset: "${fabric.name}".\n\n**Composition**: ${fabric.composition}\n**Weight**: ${fabric.weight_gsm ? `${fabric.weight_gsm} GSM` : 'Not specified'}\n**Texture**: ${fabric.texture}\n**Rendering Prompt**: ${fabric.prompt_description}`;
    }
  }

  return {
    replyText,
    toolResults,
    groundingMetadata,
    interrupted: false,
  };
}
