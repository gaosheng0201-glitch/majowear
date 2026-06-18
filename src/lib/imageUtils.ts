// Shared image utility for Gemini API

/**
 * Converts an image URL to a Gemini-compatible InlineDataPart.
 * Shared across route.ts, analyze-fabric/route.ts, and analyze-style/route.ts.
 */
export async function imageUrlToPart(url: string): Promise<{ inlineData: { data: string; mimeType: string } }> {
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
