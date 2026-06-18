import { Type } from '@google/genai';

// Tool Declaration: Generate Garment Design
export const generateGarmentTool = {
  name: 'generate_garment_design',
  description: 'Generate a new clothing garment design or modify an existing garment to create a variant, using style DNA and fabric cards as constraints.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING, description: 'Descriptive title of the garment' },
      category: { type: Type.STRING, description: 'Category of the clothing (e.g., Jacket, Pants, Shirt, Dress, Knitwear)' },
      design_rationale: { type: Type.STRING, description: 'Explanation of the design concept, style choices (silhouettes, cuts, aesthetic details), and how they harmonize with the style DNA and fabric properties' },
      prompt: { type: Type.STRING, description: 'Optimized English prompt for the image generation model. For flat_lay: focus on garment materials, textures, and construction details only — no models, poses, or backgrounds. For on_body: freely describe model styling, scene atmosphere, lighting, and background to convey the design language. For sketch: use technical drawing language describing structure and pattern — no photorealistic descriptions.' },
      negative_prompt: { type: Type.STRING, description: 'English negative prompt' },
      display_mode: { type: Type.STRING, description: 'Rendering style. "flat_lay" (default): professional product photography on white background, front+back dual view. "on_body": editorial photoshoot with model, front+side+back triple view. "sketch": technical fashion illustration on white background, front+back dual view.' },
      fit: { type: Type.STRING, description: 'e.g. Oversized, Slim, Cropped, Regular' },
      collar: { type: Type.STRING, description: 'e.g. Hooded, Band collar, Notch lapel' },
      sleeves: { type: Type.STRING, description: 'e.g. Raglan long sleeves, Sleeveless' },
      pockets: { type: Type.STRING, description: 'e.g. Patch pockets, Zip pockets' },
      closures: { type: Type.STRING, description: 'e.g. Front zipper, Buttons' },
      details: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Design highlights' },
      is_new_design: { type: Type.BOOLEAN, description: 'Set to true if the user explicitly wants to generate a brand new garment/design from scratch, ignoring the active/parent garment card. Set to false if they are modifying, editing, making a variant of, or referencing the active/parent garment.' },
      parent_id: { type: Type.STRING, description: 'If the design is a variant or iteration of a specific @-referenced garment card, provide its ID here to override the default active parent garment.' },
      review_style_match_score: { type: Type.INTEGER, description: 'Score out of 100 for style matching' },
      review_fabric_match_score: { type: Type.INTEGER, description: 'Score out of 100 for fabric compatibility' },
      review_structure_clarity_score: { type: Type.INTEGER, description: 'Score out of 100 for design structure clarity' },
      review_prompt_compliance_score: { type: Type.INTEGER, description: 'Score out of 100 for prompt compliance' },
      review_issues: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Issues identified' },
      review_suggested_revision: { type: Type.STRING, description: 'A refinement prompt suggestion' }
    },
    required: [
      'title', 'category', 'design_rationale', 'prompt', 'display_mode', 'fit', 'collar',
      'sleeves', 'pockets', 'closures', 'details',
      'is_new_design',
      'review_style_match_score', 'review_fabric_match_score',
      'review_structure_clarity_score', 'review_prompt_compliance_score',
      'review_issues', 'review_suggested_revision'
    ]
  }
};

// Tool Declaration: Create Style DNA
export const createStyleDnaTool = {
  name: 'create_style_dna',
  description: 'Extract and analyze fashion/aesthetic styles from reference descriptions or images, and save it as a new Style DNA preset.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING, description: 'A descriptive name for this style DNA' },
      keywords: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Keywords, vibes, mood (e.g. techwear, minimalist)' },
      colors: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Colors and palettes' },
      silhouettes: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Outlines, fit, shapes' },
      materials: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Associated fabrics/materials' },
      details: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Design elements, pockets, closures' },
      avoid: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Elements to strictly avoid' }
    },
    required: ['name', 'keywords', 'colors', 'silhouettes', 'materials', 'details', 'avoid']
  }
};

// Tool Declaration: Create Fabric Card
export const createFabricCardTool = {
  name: 'create_fabric_card',
  description: 'Extract and analyze fabric parameters from description or swatch image, and save it as a new Fabric Card preset.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING, description: 'A descriptive name for the fabric card' },
      composition: { type: Type.STRING, description: 'Estimated or confirmed fiber composition' },
      weight_gsm: { type: Type.INTEGER, description: 'Fabric weight in GSM (grams per square meter)' },
      texture: { type: Type.STRING, description: 'e.g. Ribbed knit, smooth satin, matte ripstop' },
      drape: { type: Type.STRING, description: 'e.g. Crisp stiff, fluid flow' },
      stretch: { type: Type.STRING, description: 'e.g. Non-stretch, 4-way stretch' },
      sheen: { type: Type.STRING, description: 'e.g. Matte, glossy, lustrous' },
      transparency: { type: Type.STRING, description: 'e.g. Opaque, translucent, sheer' },
      prompt_description: { type: Type.STRING, description: 'Optimized texture description to feed into image gen prompts to render this exact fabric texture.' }
    },
    required: ['name', 'composition', 'weight_gsm', 'texture', 'drape', 'stretch', 'sheen', 'transparency', 'prompt_description']
  }
};

// Tool Declaration: Present Design Decision
// Terminal tool — interrupts Agent Loop and waits for user selection
export const presentDesignDecisionTool = {
  name: 'present_design_decision',
  description: 'Present professional design analysis and actionable direction options to the designer. Use ONLY after performing a search or deep analysis that produced substantial information, when presenting structured options will meaningfully reduce cognitive load. Do NOT use for direct, unambiguous design instructions.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      analysis_markdown: { type: Type.STRING, description: 'Concise professional design analysis in markdown.' },
      decision_question: { type: Type.STRING, description: 'A clear question for the designer (< 50 chars).' },
      options: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            label: { type: Type.STRING },
            summary: { type: Type.STRING },
            design_strategy: { type: Type.STRING },
            prompt_addition: { type: Type.STRING },
            value: { type: Type.STRING }
          },
          required: ['id', 'label', 'summary', 'design_strategy', 'prompt_addition', 'value']
        }
      }
    },
    required: ['analysis_markdown', 'decision_question', 'options']
  }
};

/**
 * Returns tool configurations grouped by workflow intent.
 */
export function getToolsForIntent(intent: string) {
  switch (intent) {
    case 'GENERATE':
      return [
        { functionDeclarations: [generateGarmentTool, createStyleDnaTool, createFabricCardTool, presentDesignDecisionTool] },
        { googleSearch: {} }
      ];
    case 'CREATE_ASSET':
      return [
        { functionDeclarations: [createStyleDnaTool, createFabricCardTool] }
      ];
    case 'SEARCH':
      return [{ googleSearch: {} }];
    case 'CHAT':
    default:
      return [];
  }
}
