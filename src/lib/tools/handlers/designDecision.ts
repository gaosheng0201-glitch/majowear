import type { WorkflowContext, ToolExecutionResult, StreamCallbacks } from '@/lib/types/agent';

/**
 * Handles the present_design_decision terminal tool call.
 * Interrupts the Agent Loop and sends a design decision card to the frontend.
 * The user's selection will be resubmitted as a new request with decisionContext.
 */
export async function handleDesignDecision(
  args: any,
  ctx: WorkflowContext,
  callbacks: StreamCallbacks,
  validAgentMsgId: string | null,
  taskId: string
): Promise<ToolExecutionResult> {
  const { supabase, userId, projectId } = ctx;

  const decisionData = {
    type: 'design_decision',
    analysisMarkdown: args.analysis_markdown || '',
    question: args.decision_question || '',
    options: (args.options || []).map((opt: any) => ({
      id: opt.id,
      label: opt.label,
      summary: opt.summary || '',
      design_strategy: opt.design_strategy || '',
      prompt_addition: opt.prompt_addition || '',
      value: opt.value
    })),
    contextSnapshot: ctx.snapshot
  };

  // Save to DB
  await supabase.from('chat_messages').insert({
    ...(validAgentMsgId ? { id: validAgentMsgId } : {}),
    project_id: projectId || null,
    user_id: userId,
    role: 'agent',
    text: decisionData.question,
    grounding_metadata: {
      ...decisionData,
      resolved: false
    }
  });

  // Send to frontend via custom chunk
  callbacks.onCustomChunk('design_decision', decisionData);

  return {
    toolName: 'present_design_decision',
    success: true,
    asset: decisionData,
    summary: { question: decisionData.question, optionCount: decisionData.options.length },
    isTerminal: true,  // This interrupts the Agent Loop
  };
}
