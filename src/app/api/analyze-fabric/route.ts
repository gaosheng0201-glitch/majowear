import { NextResponse } from 'next/server';
import { ai } from '@/lib/gemini';
import { createClient } from '@/lib/supabase/server';
import { Schema, Type } from '@google/genai';
import { imageUrlToPart } from '@/lib/imageUtils';

const fabricSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    composition: { type: Type.STRING, description: 'Estimated or confirmed composition (e.g., 100% Organic Cotton, Nylon Cordura)' },
    texture: { type: Type.STRING, description: 'Detailed texture description (e.g. rough grain, knit ribbed, smooth satin)' },
    drape: { type: Type.STRING, description: 'How the fabric hangs or folds (e.g. structural stiff, heavy fold, fluid flow)' },
    stretch: { type: Type.STRING, description: 'Elasticity profile (e.g. non-stretch, 4-way elastic)' },
    sheen: { type: Type.STRING, description: 'Light reflection behavior (e.g. flat matte, subtle lustrous, glossy shine)' },
    transparency: { type: Type.STRING, description: 'Transparency level (e.g. completely opaque, sheer, translucent)' },
    prompt_description: { type: Type.STRING, description: 'A highly descriptive sentence or paragraph optimizing this fabric texture, weave, and weight to be fed into image generation prompts.' }
  },
  required: ['composition', 'texture', 'drape', 'stretch', 'sheen', 'transparency', 'prompt_description']
};

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { name, imageUrl, composition, weightGsm, projectId } = await request.json();
    if (!imageUrl || !name) {
      return NextResponse.json({ error: 'Name and Swatch Image URL are required' }, { status: 400 });
    }

    const imagePart = await imageUrlToPart(imageUrl);

    const prompt = `Analyze this fabric swatch image. We know the following user inputs:
Name: ${name}
${composition ? `User Specified Composition: ${composition}` : ''}
${weightGsm ? `User Specified Weight: ${weightGsm} GSM` : ''}

Extract the physical parameters of the fabric (composition, drape, texture, stretch, sheen, transparency) and write a detailed 'prompt_description' suitable for image generation pipelines to replicate this exact fabric quality on a 3D clothing model.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: [imagePart, prompt],
      config: {
        responseMimeType: 'application/json',
        responseSchema: fabricSchema,
      },
    });

    if (!response.text) {
      return NextResponse.json({ error: 'AI failed to analyze the fabric.' }, { status: 500 });
    }

    const fabricData = JSON.parse(response.text);

    // Save to fabric_cards table in Supabase
    const { data: insertedFabric, error: dbError } = await supabase
      .from('fabric_cards')
      .insert({
        user_id: user.id,
        project_id: projectId || null,
        name,
        image: imageUrl,
        composition: composition || fabricData.composition,
        weight_gsm: weightGsm ? parseInt(weightGsm) : null,
        texture: fabricData.texture,
        drape: fabricData.drape,
        stretch: fabricData.stretch,
        sheen: fabricData.sheen,
        transparency: fabricData.transparency,
        prompt_description: fabricData.prompt_description,
      })
      .select()
      .single();

    if (dbError) {
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: insertedFabric });
  } catch (err: any) {
    console.error('Error in analyze-fabric API:', err);
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}
