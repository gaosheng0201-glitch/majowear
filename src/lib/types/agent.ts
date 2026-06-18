// Agent orchestration shared types
// These types are used across the agent pipeline: route.ts, agentLoop, handlers, and frontend

export type WorkflowIntent = 'GENERATE' | 'CREATE_ASSET' | 'SEARCH' | 'CHAT';

/**
 * Preserves the full request context across pause-resume cycles
 * (conflict cards, design decision cards).
 * 
 * This is NOT a replacement for conversation history — it only ensures
 * that request parameters (prompt, @references, images, parent, etc.)
 * survive card resubmissions without data loss.
 */
export type AgentContextSnapshot = {
  originalPrompt: string;
  workflowIntent: WorkflowIntent;
  parentVersionId?: string;
  referencedGarmentIds: string[];
  imageUrls: string[];
  activeFabricCardId?: string;
  activeStyleDnaId?: string;
  decisionContext?: {
    analysisMarkdown: string;
    selectedOptionLabel: string;
    selectedPromptAddition: string;
  };
  conflictResolution?: {
    conflictType: 'fabric' | 'style_dna';
    selectedOptionLabel: string;
    selectedValue: string;
  };
};

/**
 * Result returned by each tool handler after execution.
 */
export type ToolExecutionResult = {
  toolName: string;
  success: boolean;
  error?: string;
  asset?: any;           // The created asset (garment card, style DNA, fabric card, or design decision)
  summary: object;       // Compact summary fed back to LLM as functionResponse
  isTerminal?: boolean;  // If true, interrupts Agent Loop (e.g., present_design_decision)
};

/**
 * Result returned by the Agent Loop after all rounds complete.
 */
export type AgentLoopResult = {
  replyText: string;
  toolResults: ToolExecutionResult[];
  groundingMetadata: any;
  interrupted?: boolean;  // True if loop was interrupted by a terminal tool
};

/**
 * Callbacks for streaming events from the Agent Loop to the SSE stream.
 */
export type StreamCallbacks = {
  onStatus: (status: string, extra?: Record<string, any>) => void;
  onCustomChunk: (type: string, data: any) => void;
};

/**
 * Context passed to tool handlers for DB access and state.
 */
export type WorkflowContext = {
  supabase: any;
  ai: any;
  userId: string;
  projectId: string;
  snapshot: AgentContextSnapshot;
  parentVersionId?: string;
  fabricCardData?: any;
  fabricCardId?: string;
  styleDnaData?: any;
  styleDnaId?: string;
  displayMode: 'white_background' | 'on_body';
  imageGenModel: string;
  enableSelfCritique?: boolean;
};
