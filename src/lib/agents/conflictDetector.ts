import { ai } from '@/lib/gemini';
import { Type } from '@google/genai';

const MAX_CANDIDATES = 10;

/**
 * Loads candidate fabric cards using tiered query: project-first, user-global fallback.
 * Transitional approach — will be replaced by vector search.
 */
export async function loadFabricCandidates(
  supabase: any,
  userId: string,
  projectId: string
): Promise<any[]> {
  // Tier 1: Current project assets (most relevant)
  const { data: projectFabrics } = await supabase
    .from('fabric_cards')
    .select('id, name, composition, texture, weight_gsm')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  // Tier 2: User's other projects (fallback)
  const remaining = MAX_CANDIDATES - (projectFabrics?.length || 0);
  let globalFabrics: any[] = [];
  if (remaining > 0) {
    const existingIds = (projectFabrics || []).map((f: any) => f.id);
    if (existingIds.length > 0) {
      const { data } = await supabase
        .from('fabric_cards')
        .select('id, name, composition, texture, weight_gsm')
        .eq('user_id', userId)
        .not('id', 'in', `(${existingIds.join(',')})`)
        .order('updated_at', { ascending: false })
        .limit(remaining);
      globalFabrics = data || [];
    } else {
      const { data } = await supabase
        .from('fabric_cards')
        .select('id, name, composition, texture, weight_gsm')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(remaining);
      globalFabrics = data || [];
    }
  }

  return [...(projectFabrics || []), ...globalFabrics];
}

/**
 * Loads candidate style DNAs using tiered query: project-first, user-global fallback.
 * Transitional approach — will be replaced by vector search.
 */
export async function loadStyleDnaCandidates(
  supabase: any,
  userId: string,
  projectId: string
): Promise<any[]> {
  // Tier 1: Current project assets
  const { data: projectDnas } = await supabase
    .from('style_dnas')
    .select('id, name, keywords')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  // Tier 2: User's other projects
  const remaining = MAX_CANDIDATES - (projectDnas?.length || 0);
  let globalDnas: any[] = [];
  if (remaining > 0) {
    const existingIds = (projectDnas || []).map((d: any) => d.id);
    if (existingIds.length > 0) {
      const { data } = await supabase
        .from('style_dnas')
        .select('id, name, keywords')
        .eq('user_id', userId)
        .not('id', 'in', `(${existingIds.join(',')})`)
        .order('updated_at', { ascending: false })
        .limit(remaining);
      globalDnas = data || [];
    } else {
      const { data } = await supabase
        .from('style_dnas')
        .select('id, name, keywords')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(remaining);
      globalDnas = data || [];
    }
  }

  return [...(projectDnas || []), ...globalDnas];
}

/**
 * Detects parameter conflicts between user's design request and active presets.
 * Uses Gemini Flash for NLP-based semantic matching.
 * 
 * Two behaviors:
 * - SILENT MATCH: If user names an exact preset with 95%+ confidence, applies it without popup
 * - CONFLICT: If user implies a different material/style, shows conflict resolution card
 */
export async function detectAndResolveConflict({
  userPrompt,
  activeFabricCard,
  activeStyleDna,
  projectFabricCards,
  projectStyleDnas,
  fabricSource,
}: {
  userPrompt: string;
  activeFabricCard: any;
  activeStyleDna: any;
  projectFabricCards: any[];
  projectStyleDnas: any[];
  fabricSource?: 'direct' | 'garment';
}) {
  try {
    // Build source context explanation
    let fabricSourceExplanation = '';
    if (activeFabricCard) {
      if (fabricSource === 'garment') {
        fabricSourceExplanation = `(This fabric is inherited from the currently active garment card, not directly selected by the designer. Mention this in the question so the designer understands where the conflict comes from, e.g. "当前激活款式使用的XX面料...")`;
      } else {
        fabricSourceExplanation = `(This fabric was directly selected by the designer in the sidebar.)`;
      }
    }

    const nlpAnalysisPrompt = `
You are a professional fashion designer. Your task is to analyze the user's design request and identify any semantic references to fabrics or style DNAs. Then, compare them with the active and available presets in the studio workspace to determine if there is a conflict or suitability trade-off.

---
ACTIVE WORKSPACE CONTEXT:
- Active Fabric Card: ${activeFabricCard ? `"${activeFabricCard.name}" (ID: ${activeFabricCard.id}), Composition: ${activeFabricCard.composition}, Texture: ${activeFabricCard.texture}, Weight: ${activeFabricCard.weight_gsm ? `${activeFabricCard.weight_gsm} GSM` : 'N/A'} ${fabricSourceExplanation}` : "None"}
- Active Style DNA: ${activeStyleDna ? `"${activeStyleDna.name}" (ID: ${activeStyleDna.id}), Keywords: ${(activeStyleDna.keywords || []).join(', ')}` : "None"}

AVAILABLE FABRIC CARDS IN PROJECT:
${projectFabricCards.map(f => `- "${f.name}" (ID: ${f.id}), Composition: ${f.composition}, Texture: ${f.texture}, Weight: ${f.weight_gsm ? `${f.weight_gsm} GSM` : 'N/A'}`).join('\n')}

AVAILABLE STYLE DNAS IN PROJECT:
${projectStyleDnas.map(s => `- "${s.name}" (ID: ${s.id}), Keywords: ${(s.keywords || []).join(', ')}`).join('\n')}

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
   - Generate a brief, natural, professional question in the designer's own tone (under 50 characters) pointing out the suitability conflict or design trade-off and asking for confirmation.
     - The question MUST briefly explain WHY there is a conflict. For example: "当前面料真丝质地偏软，做廓形夹克需调整" or "激活款式的棉麻面料偏休闲，与正装风格不匹配".
     - If the fabric is inherited from the active garment (not directly selected), mention it: e.g. "当前激活款式用的真丝面料偏软，需要切换吗？"
     - Do NOT list the options or alternatives in the question text.
     - Match the language of the user's prompt.
   - Generate 3-5 dynamic options. For each option, set both "id" and "value" to the same string.
   - CRITICAL: Every recommended option MUST be suitable for the user's design request. Do NOT recommend fabrics/styles that would create a NEW suitability conflict with the requested garment. For example, if the user asks for a structured jacket, do NOT recommend wetsuit neoprene fabric.
   - The options list must consist of:
     a) Option to retain the active preset (value and id set to the UUID of the active card). The label should acknowledge the trade-off.
     b) Options to switch to existing project cards ONLY if they are genuinely suitable alternatives for the requested design.
     c) Optional recommended concept: set value/id to "custom_" followed by lowercase slug. Only recommend if it genuinely fits the design request.
     d) Universal manual input option (MUST always be last): value/id = "custom".
7. If there is no mismatch, set "hasConflict" to false, "question" to "" and "options" to [].
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
