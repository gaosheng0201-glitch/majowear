import { NextResponse } from 'next/server';
import { ai } from '@/lib/gemini';
import { createClient } from '@/lib/supabase/server';
import { Schema, Type } from '@google/genai';

async function imageUrlToPart(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch image from URL: ${url}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const mimeType = response.headers.get('content-type') || 'image/jpeg';
  return {
    inlineData: {
      data: Buffer.from(arrayBuffer).toString('base64'),
      mimeType,
    },
  };
}

// Define the response schema matching our Style DNA properties
const styleSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING, description: 'A concise descriptive name for this style vibe' },
    keywords: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Aesthetic tags, moods, vibes (e.g. techwear, minimalist, vintage)' },
    colors: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Key colors and color palettes' },
    silhouettes: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Cuts, fit, shapes, and structural outlines' },
    materials: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Typical fabrics or textures associated with this visual style' },
    details: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Specific hardware, trims, closures, stitching, or pocket details' },
    avoid: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Items, styles, shapes, or details to strictly avoid' },
  },
  required: ['name', 'keywords', 'colors', 'silhouettes', 'materials', 'details', 'avoid'],
};

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { imageUrls, projectId } = await request.json();
    if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) {
      return NextResponse.json({ error: 'At least one image URL is required' }, { status: 400 });
    }

    // Convert URLs to Gemini inline parts
    const imageParts = await Promise.all(
      imageUrls.map(url => imageUrlToPart(url))
    );

    const prompt = `Analyze these fashion reference images. Extract and compile their shared aesthetic DNA.
Detail the key colors, shapes/silhouettes, typical materials, design details, general vibe keywords, and anything to strictly avoid.
Return a structured output following the schema.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash', // Flash is great and cost-effective for analysis
      contents: [...imageParts, prompt],
      config: {
        responseMimeType: 'application/json',
        responseSchema: styleSchema,
      },
    });

    if (!response.text) {
      return NextResponse.json({ error: 'AI failed to analyze the images.' }, { status: 500 });
    }

    const styleData = JSON.parse(response.text);

    // Save to the style_dnas table in Supabase
    const { data: insertedStyle, error: dbError } = await supabase
      .from('style_dnas')
      .insert({
        user_id: user.id,
        project_id: projectId || null,
        name: styleData.name,
        reference_images: imageUrls,
        keywords: styleData.keywords,
        colors: styleData.colors,
        silhouettes: styleData.silhouettes,
        materials: styleData.materials,
        details: styleData.details,
        avoid: styleData.avoid,
      })
      .select()
      .single();

    if (dbError) {
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: insertedStyle });
  } catch (err: any) {
    console.error('Error in analyze-style API:', err);
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}
