import { ai } from '@/lib/gemini';

/**
 * Intent classification: 4 categories.
 * Only selects the model + tool mounting strategy.
 * The actual tool usage is decided by the LLM within the Agent Loop.
 */
export type WorkflowIntent = 'GENERATE' | 'CREATE_ASSET' | 'SEARCH' | 'CHAT';

/**
 * Classifies user prompt into one of 4 workflow intents.
 * Replaces the previous 3-class (DEEP_THINK/TOOL/SEARCH) classifier.
 */
export async function classifyIntent(userPrompt: string): Promise<WorkflowIntent> {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Classify the user prompt into one category:
- 'GENERATE': Design, generate, modify, tweak, create variant, combine garments, analyze then design, iterate on a garment, or any request that should eventually produce a garment image. This includes complex requests that need search/analysis before designing.
- 'CREATE_ASSET': Save, create, or record a Style DNA or Fabric Card as a reusable preset (without generating a garment).
- 'SEARCH': Needs Google Search for real-time fashion information, trends, news, or external facts. Pure information retrieval with no downstream design intent.
- 'CHAT': Greetings, general fashion knowledge, style explanation, comparison discussion, or non-actionable conversation.

User Prompt: "${userPrompt}"

Output only the category name.`
            }
          ]
        }
      ]
    });

    const text = response.text?.trim().toUpperCase() || 'CHAT';
    if (text.includes('GENERATE')) return 'GENERATE';
    if (text.includes('CREATE_ASSET')) return 'CREATE_ASSET';
    if (text.includes('SEARCH')) return 'SEARCH';
    return 'CHAT';
  } catch (e: any) {
    console.warn('[Intent Classifier] Classification failed, defaulting to CHAT:', e.message);
    return 'CHAT';
  }
}

/**
 * Determines the model and thinking configuration based on intent + user settings.
 */
export function selectModel(
  intent: WorkflowIntent,
  userPrompt: string,
  agentModel: string
): { modelName: string; thinkingConfig: any } {
  let useProReasoning = false;

  if (agentModel === 'gemini-3.1-pro-preview') {
    useProReasoning = true;
  } else if (agentModel === 'gemini-3.5-flash') {
    useProReasoning = false;
  } else {
    // auto: use Pro for complex analysis requests
    const hasThinkingKeywords = /思考|分析|为什么|推导|对比|think|reason|analyze|compare/i.test(userPrompt);
    useProReasoning = (intent === 'GENERATE' && hasThinkingKeywords);
  }

  if (useProReasoning) {
    return {
      modelName: 'gemini-3.1-pro-preview',
      thinkingConfig: { thinkingLevel: 'HIGH' },
    };
  }

  return {
    modelName: 'gemini-3.5-flash',
    thinkingConfig: { thinkingLevel: 'MEDIUM' },
  };
}
