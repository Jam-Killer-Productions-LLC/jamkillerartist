/// <reference types="@cloudflare/workers-types" />

import { Hono } from 'hono';
import { cors } from 'hono/cors';

// Define the environment interface with the AI binding and the correct KV binding name.
interface Env {
  AI: Ai;
  ajamkillerartist: KVNamespace;
}

// Helper function to convert an ArrayBuffer to a Base64 string.
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Create a Hono app instance.
const app = new Hono<{ Bindings: Env }>();

// Apply CORS and security headers.
app.use('*', cors());
app.use('*', async (c, next) => {
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'no-referrer');
  c.header('Content-Security-Policy', "default-src 'self'");
  await next();
});

/**
 * POST /generate
 *
 * Expects a JSON payload with:
 *  - prompt: string (the image generation prompt)
 *  - userId: string (a unique identifier for the user)
 *
 * This worker:
 *   - Calls the Stability AI model via the Cloudflare AI binding.
 *   - Converts the returned binary image data to a Base64 string.
 *   - Stores the Base64 string in the KV namespace "ajamkillerartist".
 *   - Returns a JSON response with a snippet of the Base64 image.
 */
app.post('/generate', async (c) => {
  try {
    const { prompt, userId } = await c.req.json<{ prompt: string; userId: string }>();
    if (!prompt || !userId) {
      return c.json({ error: 'Missing prompt or userId' }, 400);
    }

    // Call the Stability AI model.
    const aiResponse = await c.env.AI.run("@cf/stabilityai/stable-diffusion-xl-base-1.0", { prompt });
    
    // Cast aiResponse to a Response so that arrayBuffer() is available.
    const imageBuffer = await (aiResponse as unknown as Response).arrayBuffer();
    const base64Image = arrayBufferToBase64(imageBuffer);

    // Store the generated image in KV under the key "userId".
    await c.env.ajamkillerartist.put(userId, base64Image);

    return c.json({
      message: 'Image generated and stored successfully',
      userId,
      imagePreview: base64Image.substring(0, 30) + '...'
    });
  } catch (error) {
    console.error('Error generating image:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default app;