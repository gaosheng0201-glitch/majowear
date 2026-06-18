import type { WorkflowContext, ToolExecutionResult, StreamCallbacks } from '@/lib/types/agent';

function isUuid(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

/**
 * Handles the create_style_dna tool call.
 * Creates or reuses a Style DNA preset.
 */
export async function handleStyleDna(
  args: any,
  ctx: WorkflowContext,
  callbacks: StreamCallbacks,
  imageUrls: string[],
  taskId: string,
  conflictResolved: boolean
): Promise<ToolExecutionResult> {
  const { supabase, userId, projectId } = ctx;
  callbacks.onStatus('executing_tool:create_style_dna', { target: 'style' });

  let styleDna: any = null;

  // If conflict was resolved and we already have the style DNA, reuse it
  if (conflictResolved && ctx.styleDnaId && isUuid(ctx.styleDnaId) && ctx.styleDnaData) {
    styleDna = ctx.styleDnaData;
  } else {
    const { data: newDna, error: styleError } = await supabase
      .from('style_dnas')
      .insert({
        user_id: userId,
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
      return {
        toolName: 'create_style_dna',
        success: false,
        error: styleError.message,
        summary: { error: styleError.message },
      };
    }
    styleDna = newDna;
  }

  callbacks.onStatus('saving_style_dna', { target: 'style' });

  await supabase.from('generation_tasks')
    .update({ status: 'success', output: { createdStyleDnaId: styleDna.id } })
    .eq('id', taskId);

  return {
    toolName: 'create_style_dna',
    success: true,
    asset: styleDna,
    summary: {
      id: styleDna.id,
      name: styleDna.name,
      keywords: styleDna.keywords,
    },
  };
}
