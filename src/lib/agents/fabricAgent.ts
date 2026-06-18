import { ai } from '@/lib/gemini';
import { Type } from '@google/genai';

/**
 * Generates detailed physical specifications for a concept fabric card.
 * Used as a Sub-Agent when conflict detection creates a new concept fabric.
 */
export async function generateFabricCardSpecs(conceptId: string, userPrompt: string) {
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
