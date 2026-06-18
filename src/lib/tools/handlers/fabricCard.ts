import type { WorkflowContext, ToolExecutionResult, StreamCallbacks } from '@/lib/types/agent';

function isUuid(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

/**
 * Handles the create_fabric_card tool call.
 * Creates or reuses a Fabric Card preset.
 */
export async function handleFabricCard(
  args: any,
  ctx: WorkflowContext,
  callbacks: StreamCallbacks,
  imageUrls: string[],
  taskId: string,
  conflictResolved: boolean
): Promise<ToolExecutionResult> {
  const { supabase, userId, projectId } = ctx;
  callbacks.onStatus('executing_tool:create_fabric_card', { target: 'fabric' });

  let fabricCard: any = null;

  if (conflictResolved && ctx.fabricCardId && isUuid(ctx.fabricCardId) && ctx.fabricCardData) {
    fabricCard = ctx.fabricCardData;
  } else {
    const { data: newFabric, error: fabricError } = await supabase
      .from('fabric_cards')
      .insert({
        user_id: userId,
        project_id: projectId || null,
        name: args.name,
        image: imageUrls?.length > 0 ? imageUrls[0] : null,
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
      return {
        toolName: 'create_fabric_card',
        success: false,
        error: fabricError.message,
        summary: { error: fabricError.message },
      };
    }
    fabricCard = newFabric;
  }

  callbacks.onStatus('saving_fabric_card', { target: 'fabric' });

  await supabase.from('generation_tasks')
    .update({ status: 'success', output: { createdFabricCardId: fabricCard.id } })
    .eq('id', taskId);

  return {
    toolName: 'create_fabric_card',
    success: true,
    asset: fabricCard,
    summary: {
      id: fabricCard.id,
      name: fabricCard.name,
      composition: fabricCard.composition,
    },
  };
}
