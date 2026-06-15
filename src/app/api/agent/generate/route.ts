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
    
    // 1. Auth Check
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { 
      prompt: userPrompt, 
      styleDnaId, 
      fabricCardId, 
      projectId, 
      parentVersionId,
      referencedGarmentIds = [],
      imageUrls = [], // Multimodal attachments
      displayMode = 'white_background', 
      imageGenModel = 'gemini-3.1-flash-image' 
    } = await request.json();

    if (!userPrompt) {
      return NextResponse.json({ error: 'User prompt is required' }, { status: 400 });
    }

    // Save user's message to chat_messages first
    await supabase.from('chat_messages').insert({
      project_id: projectId || null,
      user_id: user.id,
      role: 'user',
      text: userPrompt,
      image_urls: imageUrls || []
    });

    // 2. Fetch Constraints Style DNA & Fabric parameters if provided
    let styleDnaData: any = null;
    if (styleDnaId) {
      const { data } = await supabase
        .from('style_dnas')
        .select('*')
        .eq('id', styleDnaId)
        .single();
      styleDnaData = data;
    }

    let fabricCardData: any = null;
    if (fabricCardId) {
      const { data } = await supabase
        .from('fabric_cards')
        .select('*')
        .eq('id', fabricCardId)
        .single();
      fabricCardData = data;
    }

    let parentGarmentData: any = null;
    if (parentVersionId) {
      const { data } = await supabase
        .from('garment_cards')
        .select('*')
        .eq('id', parentVersionId)
        .single();
      parentGarmentData = data;
    }

    let referencedGarmentsData: any[] = [];
    if (referencedGarmentIds && referencedGarmentIds.length > 0) {
      const { data } = await supabase
        .from('garment_cards')
        .select('*')
        .in('id', referencedGarmentIds);
      if (data) {
        referencedGarmentsData = data;
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
      return NextResponse.json({ error: taskError.message }, { status: 500 });
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
    const systemPrompt = `You are an expert fashion design AI assistant in a professional fashion studio.
Your role is to collaborate with designers. You have access to tools for creating designs, saving style DNA presets, and saving fabric presets.
When appropriate, use the tools. Otherwise, answer questions directly using your knowledge and Google Search grounding.

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

Intent Guidelines:
- If the user wants to design a garment, modify a design, or create a variant: call the 'generate_garment_design' tool.
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
      const classificationResponse = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `Classify the user prompt into one of two categories:
- 'TOOL': The user wants to design a garment, modify a design, create a variant, or save/create/record a Style DNA or Fabric Card.
- 'SEARCH': The user is asking general questions, fashion history, fabric queries, greetings, or looking for information.

User Prompt: "${userPrompt}"

Output only the category name ('TOOL' or 'SEARCH') without any other text.`
              }
            ]
          }
        ]
      });
      const clsText = classificationResponse.text?.trim().toUpperCase() || 'SEARCH';
      if (clsText.includes('TOOL')) {
        intent = 'TOOL';
      }
    } catch (e: any) {
      console.warn('[Agent Chat] Intent classification failed, defaulting to SEARCH:', e.message);
    }

    console.log('[Agent Chat] Classified intent:', intent);

    let geminiResponse;
    if (intent === 'TOOL') {
      geminiResponse = await ai.models.generateContent({
        model: 'gemini-2.5-pro',
        contents: contents,
        config: {
          systemInstruction: systemPrompt,
          tools: [
            {
              functionDeclarations: [
                generateGarmentTool,
                createStyleDnaTool,
                createFabricCardTool
              ]
            }
          ]
        }
      });
    } else {
      geminiResponse = await ai.models.generateContent({
        model: 'gemini-2.5-pro',
        contents: contents,
        config: {
          systemInstruction: systemPrompt,
          tools: [
            { googleSearch: {} }
          ]
        }
      });
    }

    let isToolCalled = false;
    let garmentCard = null;
    let createdStyleDna = null;
    let createdFabricCard = null;
    let replyText = "";

    const functionCalls = geminiResponse.functionCalls;
    if (functionCalls && functionCalls.length > 0) {
      const call = functionCalls[0];
      isToolCalled = true;

      if (call.name === 'generate_garment_design') {
        const args = call.args as any;
        
        let finalPrompt = args.prompt;
        if (displayMode === 'white_background') {
          finalPrompt += `, professional studio fashion product photography, clean solid white background, flat lay or ghost mannequin style, high resolution detail, 8k, photorealistic`;
        } else {
          finalPrompt += `, professional fashion editorial photoshoot, model wearing the garment, full body shot, outdoor city street style or studio lighting, realistic skin textures, 8k, cinematic lighting, photorealistic`;
        }

        let generatedImageBuffer: Buffer;
        let mimeType = 'image/png';

        try {
          if (imageGenModel.startsWith('gemini-')) {
            const imageGenResponse = await ai.models.generateContent({
              model: imageGenModel,
              contents: [{ role: 'user', parts: [{ text: finalPrompt }] }],
              config: {
                responseModalities: ['IMAGE'],
                imageConfig: { aspectRatio: '1:1' }
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
                aspectRatio: '1:1',
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
          return NextResponse.json({ error: imgErr.message || 'Image generation failed' }, { status: 500 });
        }

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
          return NextResponse.json({ error: `Storage upload failed: ${uploadError.message}` }, { status: 500 });
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
            style_dna_id: styleDnaId || null,
            fabric_card_id: fabricCardId || null,
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
              review: review
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
          return NextResponse.json({ error: garmentError.message }, { status: 500 });
        }

        garmentCard = insertedGarment;
        replyText = `我已为您生成了 "${garmentCard.title}" 的设计款式卡。以下是设计原理：\n\n${garmentCard.design_rationale}`;

        await supabase.from('chat_messages').insert({
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
        const args = call.args as any;
        
        const { data: styleDna, error: styleError } = await supabase
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

        createdStyleDna = styleDna;
        replyText = `我已为您成功录入风格基因预设："${createdStyleDna.name}"。\n\n**关键词**: ${createdStyleDna.keywords.join(', ')}\n**色彩**: ${createdStyleDna.colors.join(', ')}\n**廓形**: ${createdStyleDna.silhouettes.join(', ')}`;

        await supabase.from('chat_messages').insert({
          project_id: projectId || null,
          user_id: user.id,
          role: 'agent',
          text: replyText
        });

        await supabase.from('generation_tasks')
          .update({ status: 'success', output: { createdStyleDnaId: createdStyleDna.id } })
          .eq('id', task.id);

      } else if (call.name === 'create_fabric_card') {
        const args = call.args as any;

        const { data: fabricCard, error: fabricError } = await supabase
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

        createdFabricCard = fabricCard;
        replyText = `我已为您成功录入面料样卡预设："${createdFabricCard.name}"。\n\n**成分**: ${createdFabricCard.composition}\n**厚度/克重**: ${createdFabricCard.weight_gsm ? `${createdFabricCard.weight_gsm} GSM` : '未指定'}\n**纹理**: ${createdFabricCard.texture}\n**生图描述**: ${createdFabricCard.prompt_description}`;

        await supabase.from('chat_messages').insert({
          project_id: projectId || null,
          user_id: user.id,
          role: 'agent',
          text: replyText
        });

        await supabase.from('generation_tasks')
          .update({ status: 'success', output: { createdFabricCardId: createdFabricCard.id } })
          .eq('id', task.id);
      }
    } else {
      replyText = geminiResponse.text || '';
      const groundingMetadata = geminiResponse.candidates?.[0]?.groundingMetadata || null;

      await supabase.from('chat_messages').insert({
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

    return NextResponse.json({
      success: true,
      data: {
        isToolCalled,
        replyText,
        garmentCard,
        createdStyleDna,
        createdFabricCard,
        groundingMetadata: geminiResponse.candidates?.[0]?.groundingMetadata || null
      }
    });

  } catch (err: any) {
    console.error('Error in agent generate API:', err);
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}
