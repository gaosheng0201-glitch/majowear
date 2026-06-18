/**
 * SSE streaming utilities for the agent pipeline.
 * Encapsulates the ReadableStream + TextEncoder pattern used by route.ts.
 */

const encoder = new TextEncoder();

/**
 * Encodes a chunk object as an SSE-compatible string for streaming.
 */
export function encodeStreamChunk(data: { type: string; data?: any }): Uint8Array {
  return encoder.encode(JSON.stringify(data) + '\n');
}

/**
 * Creates the standard SSE Response with CORS headers.
 */
export function createStreamResponse(stream: ReadableStream): Response {
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
