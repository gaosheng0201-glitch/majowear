import { NextResponse } from 'next/server';
import { ai } from '@/lib/gemini';
import { createClient } from '@/lib/supabase/server';
import { Schema, Type } from '@google/genai';

const garmentResponseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING, description: 'A stylish name for this specific garment design' },
    category: { type: Type.STRING, description: 'Clothing category (e.g., Jacket, Pants, Dress, Shirt, Knitwear)' },
    design_rationale: { type: Type.STRING, description: 'Explanation of design choices, combining the style DNA and fabric properties (written in bilingual Chinese/English)' },
    prompt: { type: Type.STRING, description: 'Optimized English prompt for the image generation model. Describe ONLY the clothing styling, cut, and material, avoiding background details.' },
    negative_prompt: { type: Type.STRING, description: 'Optimized English negative prompt if applicable' },
    schema: { 
      type: Type.OBJECT, 
      description: 'Structured garment specifications',
      properties: {
        fit: { type: Type.STRING, description: 'e.g. Oversized, Slim fit, Cropped, Regular' },
        collar: { type: Type.STRING, description: 'e.g. Hooded, Band collar, Notch lapel, Crewneck' },
        sleeves: { type: Type.STRING, description: 'e.g. Raglan long sleeves, Sleeveless, Ribbed cuffs' },
        pockets: { type: Type.STRING, description: 'e.g. Dual utility patch pockets, Hidden zippered seams' },
        closures: { type: Type.STRING, description: 'e.g. Asymmetric front metal zipper, Matte resin buttons' },
        details: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Specific design highlights like contrast topstitching, adjustable hem drawstrings, modular zippers.' },
        review: {
          type: Type.OBJECT,
          description: 'AI review scoring based on constraints',
          properties: {
            style_match_score: { type: Type.INTEGER, description: 'Score out of 100 for style matching' },
            fabric_match_score: { type: Type.INTEGER, description: 'Score out of 100 for fabric compatibility' },
            structure_clarity_score: { type: Type.INTEGER, description: 'Score out of 100 for design structure clarity' },
            prompt_compliance_score: { type: Type.INTEGER, description: 'Score out of 100 for prompt compliance' },
            issues: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Issues identified (e.g., fabric properties conflict with details, colors outside DNA range)' },
            suggested_revision: { type: Type.STRING, description: 'A refinement prompt suggestion (e.g., Increase ripstop texturing, add waterproof zippers)' }
          },
          required: ['style_match_score', 'fabric_match_score', 'structure_clarity_score', 'prompt_compliance_score', 'issues', 'suggested_revision']
        }
      },
      required: ['fit', 'collar', 'sleeves', 'pockets', 'closures', 'details', 'review']
    }
  },
  required: ['title', 'category', 'design_rationale', 'prompt', 'negative_prompt', 'schema']
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
      displayMode = 'white_background', // 'white_background' or 'on_body'
      imageGenModel = 'gemini-3.1-flash-image' // Default model
    } = await request.json();

    if (!userPrompt) {
      return NextResponse.json({ error: 'User prompt is required' }, { status: 400 });
    }

    // 2. Fetch Style DNA & Fabric parameters if provided
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

    // 3. Create Generation Task (Pending)
    const { data: task, error: taskError } = await supabase
      .from('generation_tasks')
      .insert({
        user_id: user.id,
        project_id: projectId || null,
        status: 'pending',
        input: { userPrompt, styleDnaId, fabricCardId, parentVersionId, displayMode, imageGenModel }
      })
      .select()
      .single();

    if (taskError) {
      return NextResponse.json({ error: taskError.message }, { status: 500 });
    }

    // Update status to running
    await supabase.from('generation_tasks').update({ status: 'running' }).eq('id', task.id);

    // 4. Construct Gemini instruction incorporating constraints
    const systemPrompt = `You are a professional fashion design agent. Your task is to design a garment based on a user prompt, adhering strictly to the provided Style DNA and Fabric constraints.
${styleDnaData ? `
Style DNA:
- Aesthetics / Keywords: ${styleDnaData.keywords.join(', ')}
- Colors: ${styleDnaData.colors.join(', ')}
- Silhouettes: ${styleDnaData.silhouettes.join(', ')}
- Materials: ${styleDnaData.materials.join(', ')}
- Details: ${styleDnaData.details.join(', ')}
- Avoid: ${styleDnaData.avoid.join(', ')}
` : ''}

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
` : ''}

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

Instruction: Based on this parent design, modify it to create a new variant as requested by the user. You must keep the layout and core characteristics similar, but change the specific attributes requested by the user.
` : ''}

Reflect the physical reality of the fabric. Generate:
1. A descriptive title and category.
2. A design rationale (why these sleeves, collars, fit match this fabric and style).
3. A structural design schema.
4. An AI review assessment with scores out of 100 for Style DNA Match, Fabric Compliance, Structural Clarity, and Prompt Compliance, listing any specific issues and a suggested refinement command/revision.
5. An English rendering prompt for image models.`;

    const geminiResponse = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview', // Pro is recommended for complex reasoning/synthesis
      contents: [
        { role: 'user', parts: [{ text: `${systemPrompt}\n\nUser Design Request: "${userPrompt}"` }] }
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: garmentResponseSchema,
      }
    });

    if (!geminiResponse.text) {
      await supabase.from('generation_tasks')
        .update({ status: 'failed', error: 'Gemini synthesis failed' })
        .eq('id', task.id);
      return NextResponse.json({ error: 'AI synthesis failed' }, { status: 500 });
    }

    const designResult = JSON.parse(geminiResponse.text);

    // 5. Append Display Mode configurations to prompt
    let finalPrompt = designResult.prompt;
    if (displayMode === 'white_background') {
      finalPrompt += `, professional studio fashion product photography, clean solid white background, flat lay or ghost mannequin style, high resolution detail, 8k, photorealistic`;
    } else {
      finalPrompt += `, professional fashion editorial photoshoot, model wearing the garment, full body shot, outdoor city street style or studio lighting, realistic skin textures, 8k, cinematic lighting, photorealistic`;
    }

    // 6. Call Image Generation Provider (Google Gemini Image Model)
    let generatedImageBuffer: Buffer;
    let mimeType = 'image/png';

    try {
      if (imageGenModel.startsWith('gemini-')) {
        const imageGenResponse = await ai.models.generateContent({
          model: imageGenModel,
          contents: [
            { role: 'user', parts: [{ text: finalPrompt }] }
          ],
          config: {
            responseModalities: ['IMAGE'],
            imageConfig: {
              aspectRatio: '1:1',
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

    // 7. Upload generated image to local Supabase Storage
    const filename = `${user.id}/${task.id}_design.png`;
    const { data: uploadData, error: uploadError } = await supabase.storage
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

    // Retrieve public URL
    const { data: { publicUrl } } = supabase.storage
      .from('design_assets')
      .getPublicUrl(filename);

    // 8. Create Garment Card
    const { data: garmentCard, error: garmentError } = await supabase
      .from('garment_cards')
      .insert({
        user_id: user.id,
        project_id: projectId || null,
        style_dna_id: styleDnaId || null,
        fabric_card_id: fabricCardId || null,
        title: designResult.title,
        category: designResult.category,
        images: [publicUrl],
        schema: designResult.schema,
        prompt: finalPrompt,
        negative_prompt: designResult.negative_prompt,
        design_rationale: designResult.design_rationale,
        parent_version_id: parentVersionId || null
      })
      .select()
      .single();

    if (garmentError) {
      await supabase.from('generation_tasks')
        .update({ status: 'failed', error: `Garment card creation failed: ${garmentError.message}` })
        .eq('id', task.id);
      return NextResponse.json({ error: garmentError.message }, { status: 500 });
    }

    // 9. Update Task to Success
    await supabase.from('generation_tasks')
      .update({ 
        status: 'success', 
        output: { garmentCardId: garmentCard.id, imageUrl: publicUrl } 
      })
      .eq('id', task.id);

    return NextResponse.json({ success: true, data: garmentCard });

  } catch (err: any) {
    console.error('Error in agent generate API:', err);
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}
