import { imageUrlToPart } from '@/lib/imageUtils';
import type { WorkflowContext, ToolExecutionResult, StreamCallbacks } from '@/lib/types/agent';

/**
 * Validates if a string is a valid UUID v4 format.
 */
function isUuid(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

/**
 * Handles the generate_garment_design tool call.
 * Generates an image, uploads it, creates a garment card in the DB.
 */
export async function handleGarmentDesign(
  args: any,
  ctx: WorkflowContext,
  callbacks: StreamCallbacks,
  imageParts: any[],
  taskId: string,
  imageResolution: string
): Promise<ToolExecutionResult> {
  const { supabase, ai, userId, projectId, displayMode, imageGenModel } = ctx;
  let finalPrompt = args.prompt;

  // Server-side fallback: infer is_new_design
  const wantsNewDesign = args.is_new_design === true;
  const hasParentContext = Boolean(ctx.parentVersionId || args.parent_id);
  const isNewDesign = wantsNewDesign || !hasParentContext;

  // 1. Load predecessor garment image
  let editBaseImagePart: any = null;
  let targetParentGarment: any = null;

  if (!isNewDesign) {
    try {
      // Default to the context parent garment
      if (ctx.parentVersionId) {
        const { data } = await supabase
          .from('garment_cards').select('*')
          .eq('id', ctx.parentVersionId).single();
        if (data) targetParentGarment = data;
      }
      // If agent specified a different parent_id, override
      if (args.parent_id && args.parent_id !== ctx.parentVersionId) {
        const { data } = await supabase
          .from('garment_cards').select('*')
          .eq('id', args.parent_id).single();
        if (data) targetParentGarment = data;
      }
      if (targetParentGarment?.images?.length > 0) {
        console.log('[Garment Handler] Loading predecessor image:', targetParentGarment.id);
        editBaseImagePart = await imageUrlToPart(targetParentGarment.images[0]);
      }
    } catch (err: any) {
      throw new Error(`Failed to load predecessor garment image: ${err.message}`);
    }
  }

  // Send status with parent details for skeleton preview
  if (!isNewDesign && editBaseImagePart && targetParentGarment) {
    const parentImageUrl = targetParentGarment.images?.[0] || '';
    callbacks.onStatus('executing_tool:generate_garment_design', { target: `garment_edit:${targetParentGarment.title}:${parentImageUrl}` });
  } else if (isNewDesign && ctx.snapshot.imageUrls?.length > 0) {
    callbacks.onStatus('executing_tool:generate_garment_design', { target: `garment_edit:参考图片:${ctx.snapshot.imageUrls[0]}` });
  } else {
    callbacks.onStatus('executing_tool:generate_garment_design', { target: 'garment' });
  }

  // 2. Adjust prompt prefix
  if (editBaseImagePart) {
    finalPrompt = `Using the provided base fashion design image as a reference, change only the details specified: ${finalPrompt}. Keep all other parts of the garment, background, and lighting completely unchanged.`;
  } else if (imageParts?.length > 0) {
    finalPrompt = `Turn the provided sketch/design image into a polished fashion product photography, strictly following the silhouette and lines: ${finalPrompt}`;
  }

  // 3. Display mode suffix
  if (displayMode === 'white_background') {
    finalPrompt += `, side-by-side double-view split-screen in 21:9 aspect ratio showing front view on the left and back view on the right of the same garment, professional studio fashion product photography, clean solid white background, flat lay composition, soft diffused ambient light, micro-texture details visible, high-end commercial aesthetic`;
  } else {
    finalPrompt += `, three-view split-screen in 4:1 aspect ratio showing front view, side view, and back view of the model wearing the garment, professional fashion editorial photoshoot, full body shot, natural light, soft focus background, organic texture, high-end fashion magazine look`;
  }

  // 4. Generate image
  let generatedImageBuffer: Buffer;
  let mimeType = 'image/png';
  let sizeVal: '1K' | '2K' | '4K' = '1K';
  if (imageResolution === '2048x2048' || imageResolution === '2K') sizeVal = '2K';
  else if (imageResolution === '4096x4096' || imageResolution === '4K') sizeVal = '4K';

  try {
    if (imageGenModel.startsWith('gemini-')) {
      const parts: any[] = [];
      if (editBaseImagePart) {
        parts.push(editBaseImagePart);
      } else if (imageParts?.length > 0) {
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
      if (!base64ImageBytes) throw new Error('No image bytes in Gemini response');
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
      const base64ImageBytes = imageGenResponse.generatedImages?.[0]?.image?.imageBytes;
      if (!base64ImageBytes) throw new Error('No image bytes in Gemini response');
      generatedImageBuffer = Buffer.from(base64ImageBytes, 'base64');
    }
  } catch (imgErr: any) {
    console.error('[Garment Handler] Image generation error:', imgErr);
    await supabase.from('generation_tasks')
      .update({ status: 'failed', error: imgErr.message || 'Image generation failed' })
      .eq('id', taskId);
    return {
      toolName: 'generate_garment_design',
      success: false,
      error: imgErr.message,
      summary: { error: imgErr.message },
    };
  }

  // 5. Upload to storage
  callbacks.onStatus('saving_garment');
  const filename = `${userId}/${taskId}_design.png`;
  const { error: uploadError } = await supabase.storage
    .from('design_assets')
    .upload(filename, generatedImageBuffer, { contentType: mimeType, upsert: true });

  if (uploadError) {
    await supabase.from('generation_tasks')
      .update({ status: 'failed', error: `Storage upload failed: ${uploadError.message}` })
      .eq('id', taskId);
    return {
      toolName: 'generate_garment_design',
      success: false,
      error: uploadError.message,
      summary: { error: uploadError.message },
    };
  }

  const { data: { publicUrl } } = supabase.storage
    .from('design_assets').getPublicUrl(filename);

  // 6. Create garment card
  const review = {
    style_match_score: args.review_style_match_score || 85,
    fabric_match_score: args.review_fabric_match_score || 85,
    structure_clarity_score: args.review_structure_clarity_score || 85,
    prompt_compliance_score: args.review_prompt_compliance_score || 85,
    issues: args.review_issues || [],
    suggested_revision: args.review_suggested_revision || ''
  };

  const { data: insertedGarment, error: garmentError } = await supabase
    .from('garment_cards')
    .insert({
      user_id: userId,
      project_id: projectId || null,
      style_dna_id: (ctx.styleDnaId && isUuid(ctx.styleDnaId)) ? ctx.styleDnaId : null,
      fabric_card_id: (ctx.fabricCardId && isUuid(ctx.fabricCardId)) ? ctx.fabricCardId : null,
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
        review,
        displayMode
      },
      prompt: finalPrompt,
      negative_prompt: args.negative_prompt,
      design_rationale: args.design_rationale,
      parent_version_id: isNewDesign ? null : (args.parent_id || ctx.parentVersionId || null)
    })
    .select()
    .single();

  if (garmentError) {
    await supabase.from('generation_tasks')
      .update({ status: 'failed', error: `Garment card creation failed: ${garmentError.message}` })
      .eq('id', taskId);
    return {
      toolName: 'generate_garment_design',
      success: false,
      error: garmentError.message,
      summary: { error: garmentError.message },
    };
  }

  await supabase.from('generation_tasks')
    .update({ status: 'success', output: { garmentCardId: insertedGarment.id, imageUrl: publicUrl } })
    .eq('id', taskId);

  return {
    toolName: 'generate_garment_design',
    success: true,
    asset: insertedGarment,
    summary: {
      id: insertedGarment.id,
      title: insertedGarment.title,
      category: insertedGarment.category,
      imageUrl: publicUrl,
    },
  };
}
