import { NextResponse } from 'next/server';
import { ai } from '@/lib/gemini';
import { createClient } from '@/lib/supabase/server';
import { Schema, Type } from '@google/genai';

async function imageUrlToPart(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch image from URL: ${url}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const mimeType = response.headers.get('content-type') || 'image/jpeg';
  return {
    inlineData: {
      data: Buffer.from(arrayBuffer).toString('base64'),
      mimeType,
    },
  };
}


// Helper function to generate detailed specifications for a concept fabric card using Gemini 3.5-Flash
async function generateFabricCardSpecs(conceptId: string, userPrompt: string) {
  const prompt = `You are a professional textile expert and fashion studio assistant.
The user is designing a garment with the request: "${userPrompt}".
The selected concept fabric/material is identified as: "${conceptId}".

Please define the detailed physical specifications of this fabric:
1. Determine a clean, professional, and elegant name for this fabric (e.g., if the concept is "custom_neoprene", name it "Neoprene" or "专业潜水料"; match the user prompt's language or use a standard name).
2. Estimate a realistic fiber composition (e.g. "85% Neoprene, 15% Nylon").
3. Choose a realistic weight in GSM (grams per square meter, an integer like 320).
4. Describe its texture (e.g. "smooth synthetic matte"), drape (e.g. "crisp structural"), stretch (e.g. "2-way stretch"), sheen (e.g. "matte"), and transparency (e.g. "opaque").
5. Write an optimized English texturing prompt description for rendering this exact fabric in image generation models (e.g. "thick matte neoprene texture, smooth synthetic surface, structural drape, clean edges").

Output MUST follow the requested JSON schema.`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.5-flash',
    contents: prompt,
    config: {
      temperature: 0.2,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          composition: { type: Type.STRING },
          weight_gsm: { type: Type.INTEGER },
          texture: { type: Type.STRING },
          drape: { type: Type.STRING },
          stretch: { type: Type.STRING },
          sheen: { type: Type.STRING },
          transparency: { type: Type.STRING },
          prompt_description: { type: Type.STRING }
        },
        required: ['name', 'composition', 'weight_gsm', 'texture', 'drape', 'stretch', 'sheen', 'transparency', 'prompt_description']
      }
    }
  });

  const parsed = JSON.parse(response.text || '{}');
  return parsed;
}

// Helper function to generate detailed specifications for a style DNA card using Gemini 3.5-Flash
async function generateStyleDnaSpecs(conceptId: string, userPrompt: string) {
  const prompt = `You are a professional fashion director.
The user is designing a garment with the request: "${userPrompt}".
The selected style concept is identified as: "${conceptId}".

Please define the detailed style DNA parameters:
1. Determine a clean, professional, and elegant name for this style (e.g. "Urban Techwear" or "运动高街风"; match the user prompt's language or use a standard name).
2. Define key elements of this style DNA: keywords, colors, silhouettes, materials, details, and elements to avoid.

Output MUST follow the requested JSON schema.`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.5-flash',
    contents: prompt,
    config: {
      temperature: 0.2,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
          colors: { type: Type.ARRAY, items: { type: Type.STRING } },
          silhouettes: { type: Type.ARRAY, items: { type: Type.STRING } },
          materials: { type: Type.ARRAY, items: { type: Type.STRING } },
          details: { type: Type.ARRAY, items: { type: Type.STRING } },
          avoid: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ['name', 'keywords', 'colors', 'silhouettes', 'materials', 'details', 'avoid']
      }
    }
  });

  const parsed = JSON.parse(response.text || '{}');
  return parsed;
}

// Helper function to detect parameter conflicts using Gemini 3.5-Flash NLP matching
async function detectAndResolveConflict({
  userPrompt,
  activeFabricCard,
  activeStyleDna,
  projectFabricCards,
  projectStyleDnas,
}: {
  userPrompt: string;
  activeFabricCard: any;
  activeStyleDna: any;
  projectFabricCards: any[];
  projectStyleDnas: any[];
}) {
  try {
    const nlpAnalysisPrompt = `
You are a professional fashion designer. Your task is to analyze the user's design request and identify any semantic references to fabrics or style DNAs. Then, compare them with the active and available presets in the studio workspace to determine if there is a conflict or suitability trade-off.

---
ACTIVE WORKSPACE CONTEXT:
- Active Fabric Card: ${activeFabricCard ? `"${activeFabricCard.name}" (ID: ${activeFabricCard.id})` : "None"}
- Active Style DNA: ${activeStyleDna ? `"${activeStyleDna.name}" (ID: ${activeStyleDna.id})` : "None"}

AVAILABLE FABRIC CARDS IN PROJECT:
${projectFabricCards.map(f => `- "${f.name}" (ID: ${f.id}), Composition: ${f.composition}, Texture: ${f.texture}`).join('\n')}

AVAILABLE STYLE DNAS IN PROJECT:
${projectStyleDnas.map(s => `- "${s.name}" (ID: ${s.id}), Keywords: ${s.keywords.join(', ')}`).join('\n')}

---
USER REQUEST:
"${userPrompt}"

---
INSTRUCTIONS & CRITICAL RULES:
1. Parse the user request to find references to fabrics or style DNAs.
2. Check if the mentioned material/style differs from the Active Fabric Card or Active Style DNA.
3. SILENT EXECUTION RULE: If the user explicitly asks to use or switch to a fabric/style by name and it can be matched with high confidence (95%+) to a single available card in the project, set "hasConflict" to false, and set "matchedEntityId" to that card's ID. We will apply it silently without popping options.
4. AMBIGUITY & CONFLICT RULE: If the user request implies a different material/style than the active card, or if there is a clear suitability conflict (such as using a fabric or style that does not align with the requested garment item, requiring a design trade-off), set "hasConflict" to true.
5. DESIGNER DECISION PURPOSE: The purpose of raising a conflict is to respect the designer's creative intent when a design trade-off or suitability conflict is detected, letting them make a deliberate choice.
6. If "hasConflict" is true:
   - Identify "conflictType" ("fabric", "style_dna").
   - Generate a brief, natural, professional question in the designer's own tone (under 50 characters) pointing out the suitability conflict or design trade-off and asking for confirmation. Do NOT list the options or alternatives in the question text. Match the language of the user's prompt (e.g., write in Chinese if prompt is in Chinese, English if in English).
   - Generate 3-5 dynamic options. For each option, set both "id" and "value" to the same string.
   - The options list must consist of:
     a) Option to retain the active preset (value and id set to the UUID of the active card, label expressing retention of the active card).
     b) Options to switch to existing project cards if they are relevant alternatives (value and id set to their UUIDs).
     c) Optional recommended concept (LLM decides whether to recommend a new concept): If you recommend a new fabric or style concept not currently in the project cards, set the value and id to "custom_" followed by the lowercase English/slugified name of the concept (e.g. "custom_neoprene"). The label should be a professional choice indicating the new recommended material/style name.
     d) Universal manual input option (MUST always be the last option in the list): set value and id strictly to "custom". The label must be "自定义其他面料" (if fabric) or "自定义其他风格" (if style) in Chinese, or "Custom other fabric" / "Custom other style" in English.
7. If there is no mismatch or the request aligns with the active state, set "hasConflict" to false. If "hasConflict" is false, set "question" to "" and "options" to [].
`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: nlpAnalysisPrompt,
      config: {
        temperature: 0.0,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            hasConflict: { type: Type.BOOLEAN },
            conflictType: { type: Type.STRING },
            question: { type: Type.STRING },
            matchedEntityId: { type: Type.STRING },
            options: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  label: { type: Type.STRING },
                  value: { type: Type.STRING }
                },
                required: ['id', 'label', 'value']
              }
            }
          },
          required: ['hasConflict', 'conflictType', 'question', 'options']
        }
      }
    });

    const resultText = response.text || '';
    const parsed = JSON.parse(resultText);
    return parsed;
  } catch (err) {
    console.error('[Conflict Detector] NLP analysis failed:', err);
    return { hasConflict: false, conflictType: 'none', question: '', options: [] };
  }
}

// 1. Tool Declaration: Generate Garment Design
const generateGarmentTool = {
  name: 'generate_garment_design',
  description: 'Generate a new clothing garment design or modify an existing garment to create a variant, using style DNA and fabric cards as constraints.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING, description: 'Descriptive title of the garment' },
      category: { type: Type.STRING, description: 'Category of the clothing (e.g., Jacket, Pants, Shirt, Dress, Knitwear)' },
      design_rationale: { type: Type.STRING, description: 'Explanation of design choices, matching style DNA and fabric properties' },
      prompt: { type: Type.STRING, description: 'Optimized English prompt for the image generation model. Describe styling, fit, collar, sleeves, closure, pockets, details.' },
      negative_prompt: { type: Type.STRING, description: 'English negative prompt' },
      fit: { type: Type.STRING, description: 'e.g. Oversized, Slim, Cropped, Regular' },
      collar: { type: Type.STRING, description: 'e.g. Hooded, Band collar, Notch lapel' },
      sleeves: { type: Type.STRING, description: 'e.g. Raglan long sleeves, Sleeveless' },
      pockets: { type: Type.STRING, description: 'e.g. Patch pockets, Zip pockets' },
      closures: { type: Type.STRING, description: 'e.g. Front zipper, Buttons' },
      details: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Design highlights' },
      is_new_design: { type: Type.BOOLEAN, description: 'Set to true if the user explicitly wants to generate a brand new garment/design from scratch, ignoring the active/parent garment card. Set to false if they are modifying, editing, making a variant of, or referencing the active/parent garment.' },
      parent_id: { type: Type.STRING, description: 'If the design is a variant or iteration of a specific @-referenced garment card, provide its ID here to override the default active parent garment.' },
      review_style_match_score: { type: Type.INTEGER, description: 'Score out of 100 for style matching' },
      review_fabric_match_score: { type: Type.INTEGER, description: 'Score out of 100 for fabric compatibility' },
      review_structure_clarity_score: { type: Type.INTEGER, description: 'Score out of 100 for design structure clarity' },
      review_prompt_compliance_score: { type: Type.INTEGER, description: 'Score out of 100 for prompt compliance' },
      review_issues: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Issues identified (e.g., fabric properties conflict with details, colors outside DNA range)' },
      review_suggested_revision: { type: Type.STRING, description: 'A refinement prompt suggestion (e.g., Increase ripstop texturing, add waterproof zippers)' }
    },
    required: [
      'title', 'category', 'design_rationale', 'prompt', 'fit', 'collar', 
      'sleeves', 'pockets', 'closures', 'details',
      'review_style_match_score', 'review_fabric_match_score', 
      'review_structure_clarity_score', 'review_prompt_compliance_score', 
      'review_issues', 'review_suggested_revision'
    ]
  }
};

// 2. Tool Declaration: Create Style DNA
const createStyleDnaTool = {
  name: 'create_style_dna',
  description: 'Extract and analyze fashion/aesthetic styles from reference descriptions or images, and save it as a new Style DNA preset.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING, description: 'A descriptive name for this style DNA' },
      keywords: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Keywords, vibes, mood (e.g. techwear, minimalist)' },
      colors: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Colors and palettes' },
      silhouettes: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Outlines, fit, shapes' },
      materials: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Associated fabrics/materials' },
      details: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Design elements, pockets, closures' },
      avoid: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Elements to strictly avoid' }
    },
    required: ['name', 'keywords', 'colors', 'silhouettes', 'materials', 'details', 'avoid']
  }
};

// 3. Tool Declaration: Create Fabric Card
const createFabricCardTool = {
  name: 'create_fabric_card',
  description: 'Extract and analyze fabric parameters from description or swatch image, and save it as a new Fabric Card preset.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING, description: 'A descriptive name for the fabric card' },
      composition: { type: Type.STRING, description: 'Estimated or confirmed fiber composition' },
      weight_gsm: { type: Type.INTEGER, description: 'Fabric weight in GSM (grams per square meter)' },
      texture: { type: Type.STRING, description: 'e.g. Ribbed knit, smooth satin, matte ripstop' },
      drape: { type: Type.STRING, description: 'e.g. Crisp stiff, fluid flow' },
      stretch: { type: Type.STRING, description: 'e.g. Non-stretch, 4-way stretch' },
      sheen: { type: Type.STRING, description: 'e.g. Matte, glossy, lustrous' },
      transparency: { type: Type.STRING, description: 'e.g. Opaque, translucent, sheer' },
      prompt_description: { type: Type.STRING, description: 'Optimized texture description to feed into image gen prompts to render this exact fabric texture.' }
    },
    required: ['name', 'composition', 'weight_gsm', 'texture', 'drape', 'stretch', 'sheen', 'transparency', 'prompt_description']
  }
};

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
      agentMessageId
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
        // Fetch project candidate lists to match
        let projectFabricCards: any[] = [];
        let projectStyleDnas: any[] = [];
        if (projectId) {
          const [fabricsRes, dnasRes] = await Promise.all([
            supabase.from('fabric_cards').select('id, name, composition, texture, prompt_description').eq('project_id', projectId),
            supabase.from('style_dnas').select('id, name, keywords, materials').eq('project_id', projectId)
          ]);
          projectFabricCards = fabricsRes.data || [];
          projectStyleDnas = dnasRes.data || [];
        }

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
          // If Gemini silently mapped a fabric/style, use it to override the active selection
          if (conflictResult.conflictType === 'fabric') {
            const matchedFabric = projectFabricCards.find(f => f.id === conflictResult.matchedEntityId);
            if (matchedFabric) {
              fabricCardData = matchedFabric;
              fabricCardId = matchedFabric.id; // Override local ID variable for downstream DB inserts
              console.log('[Conflict Interceptor] Silent match applied fabric card:', matchedFabric.name);
            }
          } else if (conflictResult.conflictType === 'style_dna') {
            const matchedDna = projectStyleDnas.find(s => s.id === conflictResult.matchedEntityId);
            if (matchedDna) {
              styleDnaData = matchedDna;
              styleDnaId = matchedDna.id; // Override local ID variable for downstream DB inserts
              console.log('[Conflict Interceptor] Silent match applied style DNA:', matchedDna.name);
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

      // 5. Construct Gemini system Instruction
      let styleInstruction = "";
      if (agentStyle === 'professional') {
        styleInstruction = `
Tone of Voice: You are highly professional, technical, direct, and task-oriented. Keep your explanations concise, focusing on material specifications, technical fit, and design details. Avoid unnecessary conversational fluff, exclamation marks, or overly enthusiastic remarks. Speak like an experienced, focused technical designer.`;
      } else if (agentStyle === 'friendly') {
        styleInstruction = `
Tone of Voice: You are warm, encouraging, creative, and collaborative. Use natural conversational expressions, friendly remarks, and fashion-inspiring descriptions. Speak like a friendly creative co-director and design partner.`;
      }

      const systemPrompt = `You are an expert fashion design AI assistant in a professional fashion studio.
Your role is to collaborate with designers. You have access to tools for creating designs, saving style DNA presets, and saving fabric presets.
When appropriate, use the tools. Otherwise, answer questions directly using your knowledge and Google Search grounding.
${styleInstruction}

Context & Rules:
${styleDnaData ? `
Style DNA:
- Aesthetics: ${styleDnaData.keywords.join(', ')}
- Colors: ${styleDnaData.colors.join(', ')}
- Silhouettes: ${styleDnaData.silhouettes.join(', ')}
- Materials: ${styleDnaData.materials.join(', ')}
- Details: ${styleDnaData.details.join(', ')}
- Avoid: ${styleDnaData.avoid.join(', ')}
` : 'No active Style DNA selected.'}

${fabricCardData ? `
Fabric Properties:
- Composition: ${fabricCardData.composition}
- Weight: ${fabricCardData.weight_gsm ? `${fabricCardData.weight_gsm} GSM` : 'Not specified'}
- Texture: ${fabricCardData.texture}
- Drape: ${fabricCardData.drape}
- Stretch: ${fabricCardData.stretch}
- Sheen: ${fabricCardData.sheen}
- Transparency: ${fabricCardData.transparency}
- Prompt description for rendering: ${fabricCardData.prompt_description}
` : 'No active Fabric Card selected.'}

${parentGarmentData ? `
Parent Garment Card to base this variant on:
- Title: ${parentGarmentData.title}
- Category: ${parentGarmentData.category}
- Fit: ${parentGarmentData.schema?.fit}
- Collar: ${parentGarmentData.schema?.collar}
- Sleeves: ${parentGarmentData.schema?.sleeves}
- Pockets: ${parentGarmentData.schema?.pockets}
- Closures: ${parentGarmentData.schema?.closures}
- Details: ${parentGarmentData.schema?.details?.join(', ')}
- Rationale: ${parentGarmentData.design_rationale}
` : ''}

${referencedGarmentsData.length > 0 ? `
Referenced Garment Cards (explicitly tagged by the user with @):
${referencedGarmentsData.map(rg => `- Title: ${rg.title} (ID: ${rg.id})
  - Category: ${rg.category}
  - Fit: ${rg.schema?.fit}
  - Collar: ${rg.schema?.collar}
  - Sleeves: ${rg.schema?.sleeves}
  - Pockets: ${rg.schema?.pockets}
  - Closures: ${rg.schema?.closures}
  - Details: ${rg.schema?.details?.join(', ')}
  - Rationale: ${rg.design_rationale}`).join('\n')}
` : ''}

Constraint Alignment Guidelines:
- You MUST strictly align the designed garment's prompt, details, and design_rationale with the active Fabric Properties (composition, texture, prompt description) and active Style DNA (keywords, colors, silhouettes) provided above.
- If a Parent Garment Card is provided, you must completely replace its fabric, texture, weight, and composition references with the active Fabric Properties. For example, if the active Fabric Card is "Baby Cashmere", do not mention "Merino-Cotton" or "2x2 Ribbed Knit" in the prompt, details, or design rationale, even if the parent garment used them. Overwrite them completely with the active fabric card's properties (e.g., describe it as "luxury Baby Cashmere" and use the fabric's prompt description).
- Do not let the parent garment's description override the active fabric card's composition or texture.

Intent Guidelines:
- If the user wants to design a garment, modify a design, or create a variant: you MUST call the 'generate_garment_design' tool. Do not write a plain text reply in the chat questioning, refusing, or discussing the fabric/style DNA compatibility. You must proceed with the tool call. Any compatibility issues must be recorded inside the 'review_issues' and 'review_fabric_match_score' / 'review_style_match_score' arguments of the tool call, rather than written in text.
  - If a Parent Garment Card is provided, and the user prompt is about modifying, tweaking, creating a variant, or iterating on it: set 'is_new_design' to false.
  - If the user explicitly @-references a specific garment card (from the Referenced Garment Cards list) and wants to iterate on or modify it, you must treat that garment card as the parent (set 'is_new_design' to false and specify its ID as the 'parent_id' argument). This overrides any default active parent garment.
  - If the user explicitly wants a brand new design or clothing item that does not iterate on any Parent or @-referenced Garments: set 'is_new_design' to true.
  - Make sure to translate and expand their casual prompt into a detailed English prompt.
- If the user wants to save or record a Style DNA (e.g. "save this style", "create style DNA"): call the 'create_style_dna' tool.
- If the user wants to save or record a Fabric Card (e.g. "save this fabric", "create fabric card"): call the 'create_fabric_card' tool.
- For fashion history, fabric queries, greetings, or explanations: answer with plain text, using Google Search grounding to retrieve real citations where appropriate.

Semantic Mentions & Comparison Guidelines:
1. The user's prompt may reference specific garments in their message text using the prefix @ (e.g. "@简约宽松卫衣" or "@经典牛仔裤"). Match these names against the 'Referenced Garment Cards' list provided above.
2. If the user asks you to compare, differentiate, contrast, or analyze the differences between two or more @-referenced garments:
   - Provide a beautifully structured markdown comparison table comparing their characteristics side-by-side (including Fit, Collar, Sleeves, Pockets, Closures, Key Details, and Design Rationale).
   - Below the table, write a professional fashion studio analysis detailing their aesthetic differences, fabric compatibility, and styling synergies (how they can be styled together or which scenarios suit each garment best).
3. If they ask you to combine or merge elements from different @-referenced garments, analyze their features and use the 'generate_garment_design' tool to output a synthesized design spec.`;

      // Intent Classification using a fast model (gemini-3.5-flash) to avoid API tool clashes
      let intent = 'SEARCH';
      try {
        onStatus('classifying_intent');
        const classificationResponse = await ai.models.generateContent({
          model: 'gemini-3.5-flash',
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: `Classify the user prompt into one of three categories:
- 'DEEP_THINK': The user is asking for deep analysis, comparison of garments, resolving material/style conflicts, aesthetic reasoning, or explicitly requested "thinking" or "reasoning" (e.g., using words like "思考", "分析", "为什么", "推导").
- 'TOOL': The user wants to design a garment, modify a design, create a variant, or save/create/record a Style DNA or Fabric Card (excluding complex comparisons/analyses).
- 'SEARCH': General quick Q&A, fashion facts, greeting, simple questions.

User Prompt: "${userPrompt}"

Output only the category name ('DEEP_THINK', 'TOOL' or 'SEARCH') without any other text.`
                }
              ]
            }
          ]
        });
        const clsText = classificationResponse.text?.trim().toUpperCase() || 'SEARCH';
        if (clsText.includes('DEEP_THINK')) {
          intent = 'DEEP_THINK';
        } else if (clsText.includes('TOOL')) {
          intent = 'TOOL';
        }
      } catch (e: any) {
        console.warn('[Agent Chat] Intent classification failed, defaulting to SEARCH:', e.message);
      }

      console.log('[Agent Chat] Classified intent:', intent);

      let modelName = 'gemini-3.5-flash';
      let thinkingConfigVal: any = { thinkingLevel: 'MEDIUM' };
      let useProReasoning = false;

      if (agentModel === 'gemini-3.1-pro-preview') {
        useProReasoning = true;
      } else if (agentModel === 'gemini-3.5-flash') {
        useProReasoning = false;
      } else {
        // auto
        const hasThinkingKeywords = /思考|分析|为什么|推导|对比|think|reason|analyze|compare/i.test(userPrompt);
        useProReasoning = (intent === 'DEEP_THINK') || hasThinkingKeywords;
      }

      if (useProReasoning) {
        modelName = 'gemini-3.1-pro-preview';
        thinkingConfigVal = { thinkingLevel: 'HIGH' };
        onStatus('thinking');
      } else if (intent === 'TOOL') {
        onStatus('generating_tool_call');
      } else {
        const hasSearchKeywords = /搜索|检索|趋势|新闻|查找|查询|最新|推荐|search|find|news|trend|latest/i.test(userPrompt);
        const hasImages = imageUrls && imageUrls.length > 0;
        if (hasImages || !hasSearchKeywords) {
          onStatus('understanding');
        } else {
          onStatus('preparing_response');
        }
      }

      const isToolBranch = intent === 'TOOL';
      const tools = isToolBranch 
        ? [{ functionDeclarations: [generateGarmentTool, createStyleDnaTool, createFabricCardTool] }]
        : [{ googleSearch: {} }];

      console.log(`[Agent Chat] Routing to: ${modelName} with intent: ${intent}`);

      const geminiResponse = await ai.models.generateContent({
        model: modelName,
        contents: contents,
        config: {
          systemInstruction: systemPrompt,
          thinkingConfig: thinkingConfigVal,
          tools: tools
        }
      });

      let isToolCalled = false;
      let garmentCard = null;
      createdStyleDna = createdStyleDna || null;
      createdFabricCard = createdFabricCard || null;
      let replyText = "";
      const groundingMetadata = geminiResponse.candidates?.[0]?.groundingMetadata || null;

      const functionCalls = geminiResponse.functionCalls;
      if (functionCalls && functionCalls.length > 0) {
        const call = functionCalls[0];
        isToolCalled = true;

        if (call.name === 'generate_garment_design') {
          const args = call.args as any;
          
          let finalPrompt = args.prompt;

          const isNewDesign = args.is_new_design === true;

          // 1. Identify and load the predecessor garment image (Immediate Predecessor Principle)
          let editBaseImagePart: any = null;
          let targetParentGarment = null;

          if (!isNewDesign) {
            try {
              targetParentGarment = parentGarmentData;
              // If the agent explicitly passed a parent_id, fetch its data to get the correct version
              if (args.parent_id && args.parent_id !== parentVersionId) {
                const { data } = await supabase
                  .from('garment_cards')
                  .select('*')
                  .eq('id', args.parent_id)
                  .single();
                if (data) {
                  targetParentGarment = data;
                }
              }

              if (targetParentGarment && targetParentGarment.images && targetParentGarment.images.length > 0) {
                console.log('[Agent Image Edit] Loading predecessor image (ID:', targetParentGarment.id, ') for conversational semantic editing:', targetParentGarment.images[0]);
                editBaseImagePart = await imageUrlToPart(targetParentGarment.images[0]);
              }
            } catch (err: any) {
              // Throw a highly informative error to notify about network/proxy blocking issues
              throw new Error(`Failed to load predecessor garment image for editing: ${err.message}. If running locally, please ensure your proxy (e.g. Clash) is not blocking loopback requests to localhost/127.0.0.1.`);
            }
          }

          // Trigger rendering status with parent details if editing, enabling high-fidelity ghost skeleton card
          if (!isNewDesign && editBaseImagePart && targetParentGarment) {
            const parentImageUrl = targetParentGarment.images?.[0] || '';
            onStatus('executing_tool:generate_garment_design', `garment_edit:${targetParentGarment.title}:${parentImageUrl}`);
          } else if (isNewDesign && imageUrls && imageUrls.length > 0) {
            // New design but has uploaded reference images
            onStatus('executing_tool:generate_garment_design', `garment_edit:参考图片:${imageUrls[0]}`);
          } else {
            onStatus('executing_tool:generate_garment_design', 'garment');
          }

          // 2. Adjust prompt semantic prefix based on inputs
          if (editBaseImagePart) {
            finalPrompt = `Using the provided base fashion design image as a reference, change only the details specified: ${finalPrompt}. Keep all other parts of the garment, background, and lighting completely unchanged.`;
          } else if (imageParts && imageParts.length > 0) {
            finalPrompt = `Turn the provided sketch/design image into a polished fashion product photography, strictly following the silhouette and lines: ${finalPrompt}`;
          }

          if (displayMode === 'white_background') {
            finalPrompt += `, side-by-side double-view split-screen in 21:9 aspect ratio showing front view on the left and back view on the right of the same garment, professional studio fashion product photography, clean solid white background, flat lay composition, soft diffused ambient light, micro-texture details visible, high-end commercial aesthetic`;
          } else {
            finalPrompt += `, three-view split-screen in 4:1 aspect ratio showing front view, side view, and back view of the model wearing the garment, professional fashion editorial photoshoot, full body shot, natural light, soft focus background, organic texture, high-end fashion magazine look`;
          }

          let generatedImageBuffer: Buffer;
          let mimeType = 'image/png';

          let sizeVal: '1K' | '2K' | '4K' = '1K';
          if (imageResolution === '2048x2048' || imageResolution === '2K') {
            sizeVal = '2K';
          } else if (imageResolution === '4096x4096' || imageResolution === '4K') {
            sizeVal = '4K';
          }

          try {
            if (imageGenModel.startsWith('gemini-')) {
              // 3. Construct multimodal parts list
              const parts: any[] = [];
              if (editBaseImagePart) {
                parts.push(editBaseImagePart);
              } else if (imageParts && imageParts.length > 0) {
                parts.push(...imageParts);
              }
              parts.push({ text: finalPrompt });

              const imageGenResponse = await ai.models.generateContent({
                model: imageGenModel,
                contents: [{ role: 'user', parts }],
                config: {
                  responseModalities: ['IMAGE'],
                  imageConfig: { 
                    aspectRatio: displayMode === 'white_background' ? '21:9' : '4:1',
                    imageSize: sizeVal
                  }
                }
              });

              const part = imageGenResponse.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
              const base64ImageBytes = part?.inlineData?.data;
              if (!base64ImageBytes) {
                throw new Error('No image bytes returned in Gemini response');
              }
              mimeType = part?.inlineData?.mimeType || 'image/png';
              generatedImageBuffer = Buffer.from(base64ImageBytes, 'base64');
            } else {
              const imageGenResponse = await ai.models.generateImages({
                model: imageGenModel,
                prompt: finalPrompt,
                config: {
                  numberOfImages: 1,
                  outputMimeType: 'image/png',
                  aspectRatio: displayMode === 'white_background' ? '21:9' : '4:1',
                },
              });
              const generatedImage = imageGenResponse.generatedImages?.[0];
              const base64ImageBytes = generatedImage?.image?.imageBytes;
              if (!base64ImageBytes) {
                throw new Error('No image bytes returned in Gemini response');
              }
              generatedImageBuffer = Buffer.from(base64ImageBytes, 'base64');
            }
          } catch (imgErr: any) {
            console.error('Image Generation Error:', imgErr);
            await supabase.from('generation_tasks')
              .update({ status: 'failed', error: imgErr.message || 'Image generation failed' })
              .eq('id', task.id);
            throw imgErr;
          }

          onStatus('saving_garment');

          const filename = `${user.id}/${task.id}_design.png`;
          const { error: uploadError } = await supabase.storage
            .from('design_assets')
            .upload(filename, generatedImageBuffer, {
              contentType: mimeType,
              upsert: true
            });

          if (uploadError) {
            await supabase.from('generation_tasks')
              .update({ status: 'failed', error: `Storage upload failed: ${uploadError.message}` })
              .eq('id', task.id);
            throw new Error(`Storage upload failed: ${uploadError.message}`);
          }

          const { data: { publicUrl } } = supabase.storage
            .from('design_assets')
            .getPublicUrl(filename);

          const review = {
            style_match_score: args.review_style_match_score || 85,
            fabric_match_score: args.review_fabric_match_score || 85,
            structure_clarity_score: args.review_structure_clarity_score || 85,
            prompt_compliance_score: args.review_prompt_compliance_score || 85,
            issues: args.review_issues || [],
            suggested_revision: args.review_suggested_revision || ""
          };

          const { data: insertedGarment, error: garmentError } = await supabase
            .from('garment_cards')
            .insert({
              user_id: user.id,
              project_id: projectId || null,
              style_dna_id: (styleDnaId && isUuid(styleDnaId)) ? styleDnaId : null,
              fabric_card_id: (fabricCardId && isUuid(fabricCardId)) ? fabricCardId : null,
              title: args.title,
              category: args.category,
              images: [publicUrl],
              schema: {
                fit: args.fit,
                collar: args.collar,
                sleeves: args.sleeves,
                pockets: args.pockets,
                closures: args.closures,
                details: args.details || [],
                review: review,
                displayMode: displayMode
              },
              prompt: finalPrompt,
              negative_prompt: args.negative_prompt,
              design_rationale: args.design_rationale,
              parent_version_id: args.is_new_design === true ? null : (args.parent_id || parentVersionId || null)
            })
            .select()
            .single();

          if (garmentError) {
            await supabase.from('generation_tasks')
              .update({ status: 'failed', error: `Garment card creation failed: ${garmentError.message}` })
              .eq('id', task.id);
            throw garmentError;
          }

          garmentCard = insertedGarment;
          replyText = isChinese
            ? `我已为您生成了 "${garmentCard.title}" 的设计款式卡。以下是设计原理：\n\n${garmentCard.design_rationale}`
            : `I have generated the design card for "${garmentCard.title}". Here is the design rationale:\n\n${garmentCard.design_rationale}`;

          await supabase.from('chat_messages').insert({
            ...(validAgentMsgId ? { id: validAgentMsgId } : {}),
            project_id: projectId || null,
            user_id: user.id,
            role: 'agent',
            text: replyText,
            garment_card_id: garmentCard.id
          });

          await supabase.from('generation_tasks')
            .update({ 
              status: 'success', 
              output: { garmentCardId: garmentCard.id, imageUrl: publicUrl } 
            })
            .eq('id', task.id);

        } else if (call.name === 'create_style_dna') {
          onStatus('executing_tool:create_style_dna', 'style');
          const args = call.args as any;
          
          let styleDna = createdStyleDna;
          if (!styleDna) {
            if (conflictResolved && styleDnaId && isUuid(styleDnaId) && styleDnaData) {
              styleDna = styleDnaData;
              replyText = isChinese
                ? `已根据您的选择，激活并使用已有的风格基因："${styleDna.name}"。`
                : `Based on your selection, active Style DNA has been set to the existing preset: "${styleDna.name}".`;
            } else {
              const { data: newDna, error: styleError } = await supabase
                .from('style_dnas')
                .insert({
                  user_id: user.id,
                  project_id: projectId || null,
                  name: args.name,
                  reference_images: imageUrls || [],
                  keywords: args.keywords || [],
                  colors: args.colors || [],
                  silhouettes: args.silhouettes || [],
                  materials: args.materials || [],
                  details: args.details || [],
                  avoid: args.avoid || []
                })
                .select()
                .single();

              if (styleError) {
                throw styleError;
              }
              styleDna = newDna;
              replyText = isChinese
                ? `我已为您成功录入风格基因预设："${styleDna.name}"。\n\n**关键词**: ${styleDna.keywords.join(', ')}\n**色彩**: ${styleDna.colors.join(', ')}\n**廓形**: ${styleDna.silhouettes.join(', ')}`
                : `I have successfully recorded the Style DNA preset: "${styleDna.name}".\n\n**Keywords**: ${styleDna.keywords.join(', ')}\n**Colors**: ${styleDna.colors.join(', ')}\n**Silhouettes**: ${styleDna.silhouettes.join(', ')}`;
            }
          } else {
            replyText = isChinese
              ? `我已为您成功录入风格基因预设："${styleDna.name}"。\n\n**关键词**: ${styleDna.keywords.join(', ')}\n**色彩**: ${styleDna.colors.join(', ')}\n**廓形**: ${styleDna.silhouettes.join(', ')}`
              : `I have successfully recorded the Style DNA preset: "${styleDna.name}".\n\n**Keywords**: ${styleDna.keywords.join(', ')}\n**Colors**: ${styleDna.colors.join(', ')}\n**Silhouettes**: ${styleDna.silhouettes.join(', ')}`;
          }

          onStatus('saving_style_dna', 'style');

          createdStyleDna = styleDna;

          await supabase.from('chat_messages').insert({
            ...(validAgentMsgId ? { id: validAgentMsgId } : {}),
            project_id: projectId || null,
            user_id: user.id,
            role: 'agent',
            text: replyText,
            grounding_metadata: { createdStyleDnaId: createdStyleDna.id }
          });

          await supabase.from('generation_tasks')
            .update({ status: 'success', output: { createdStyleDnaId: createdStyleDna.id } })
            .eq('id', task.id);

        } else if (call.name === 'create_fabric_card') {
          onStatus('executing_tool:create_fabric_card', 'fabric');
          const args = call.args as any;

          let fabricCard = createdFabricCard;
          if (!fabricCard) {
            if (conflictResolved && fabricCardId && isUuid(fabricCardId) && fabricCardData) {
              fabricCard = fabricCardData;
              replyText = isChinese
                ? `已根据您的选择，激活并使用已有的面料样卡："${fabricCard.name}"。`
                : `Based on your selection, active Fabric Card has been set to the existing preset: "${fabricCard.name}".`;
            } else {
              const { data: newFabric, error: fabricError } = await supabase
                .from('fabric_cards')
                .insert({
                  user_id: user.id,
                  project_id: projectId || null,
                  name: args.name,
                  image: imageUrls && imageUrls.length > 0 ? imageUrls[0] : null,
                  composition: args.composition,
                  weight_gsm: args.weight_gsm,
                  texture: args.texture,
                  drape: args.drape,
                  stretch: args.stretch,
                  sheen: args.sheen,
                  transparency: args.transparency,
                  prompt_description: args.prompt_description
                })
                .select()
                .single();

              if (fabricError) {
                throw fabricError;
              }
              fabricCard = newFabric;
              replyText = isChinese
                ? `我已为您成功录入面料样卡预设："${fabricCard.name}"。\n\n**成分**: ${fabricCard.composition}\n**厚度/克重**: ${fabricCard.weight_gsm ? `${fabricCard.weight_gsm} GSM` : '未指定'}\n**纹理**: ${fabricCard.texture}\n**生图描述**: ${fabricCard.prompt_description}`
                : `I have successfully recorded the Fabric Card preset: "${fabricCard.name}".\n\n**Composition**: ${fabricCard.composition}\n**Weight**: ${fabricCard.weight_gsm ? `${fabricCard.weight_gsm} GSM` : 'Not specified'}\n**Texture**: ${fabricCard.texture}\n**Rendering Prompt**: ${fabricCard.prompt_description}`;
            }
          } else {
            replyText = isChinese
              ? `我已为您成功录入面料样卡预设："${fabricCard.name}"。\n\n**成分**: ${fabricCard.composition}\n**厚度/克重**: ${fabricCard.weight_gsm ? `${fabricCard.weight_gsm} GSM` : '未指定'}\n**纹理**: ${fabricCard.texture}\n**生图描述**: ${fabricCard.prompt_description}`
              : `I have successfully recorded the Fabric Card preset: "${fabricCard.name}".\n\n**Composition**: ${fabricCard.composition}\n**Weight**: ${fabricCard.weight_gsm ? `${fabricCard.weight_gsm} GSM` : 'Not specified'}\n**Texture**: ${fabricCard.texture}\n**Rendering Prompt**: ${fabricCard.prompt_description}`;
          }

          onStatus('saving_fabric_card', 'fabric');

          createdFabricCard = fabricCard;

          await supabase.from('chat_messages').insert({
            ...(validAgentMsgId ? { id: validAgentMsgId } : {}),
            project_id: projectId || null,
            user_id: user.id,
            role: 'agent',
            text: replyText,
            grounding_metadata: { createdFabricCardId: createdFabricCard.id }
          });

          await supabase.from('generation_tasks')
            .update({ status: 'success', output: { createdFabricCardId: createdFabricCard.id } })
            .eq('id', task.id);
        }
      } else {
        onStatus('saving_chat_message');
        replyText = geminiResponse.text || '';

        await supabase.from('chat_messages').insert({
          ...(validAgentMsgId ? { id: validAgentMsgId } : {}),
          project_id: projectId || null,
          user_id: user.id,
          role: 'agent',
          text: replyText,
          grounding_metadata: groundingMetadata
        });

        await supabase.from('generation_tasks')
          .update({ status: 'success', output: { textReply: replyText } })
          .eq('id', task.id);
      }

      onResult({
        isToolCalled,
        replyText,
        garmentCard,
        createdStyleDna,
        createdFabricCard,
        groundingMetadata
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
