import { ai } from '@/lib/gemini';
import { Type } from '@google/genai';

/**
 * Generates detailed style DNA parameters for a concept style.
 * Used as a Sub-Agent when conflict detection creates a new concept style.
 */
export async function generateStyleDnaSpecs(conceptId: string, userPrompt: string) {
  const prompt = `You are a professional fashion director.
The user is designing a garment with the request: "${userPrompt}".
The selected style concept is identified as: "${conceptId}".

Please define the detailed style DNA parameters:
1. Determine a clean, professional, and elegant name for this style (e.g. "Urban Techwear" or "运动高街风"; match the user prompt's language or use a standard name).
2. Define key elements of this style DNA: keywords, colors, silhouettes, materials, details, and elements to avoid.

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
          keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
          colors: { type: Type.ARRAY, items: { type: Type.STRING } },
          silhouettes: { type: Type.ARRAY, items: { type: Type.STRING } },
          materials: { type: Type.ARRAY, items: { type: Type.STRING } },
          details: { type: Type.ARRAY, items: { type: Type.STRING } },
          avoid: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ['name', 'keywords', 'colors', 'silhouettes', 'materials', 'details', 'avoid']
      }
    }
  });

  const parsed = JSON.parse(response.text || '{}');
  return parsed;
}
