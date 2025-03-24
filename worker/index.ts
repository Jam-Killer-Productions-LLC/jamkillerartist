/// <reference types="@cloudflare/workers-types" />

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';

// Interface for environment bindings
interface Env {
  AI: { run(model: string, options: { prompt: string }): Promise<Response> };
  ajamkillerartist: KVNamespace;
}

// Request body interface
interface GenerateRequest {
  prompt: string;
  userId: string;
}

const app = new Hono<{ Bindings: Env }>();

// Middleware: Logging
app.use('*', logger());

// Middleware: CORS with specific origin
app.use(
  '*',
  cors({
    origin: 'https://nftartist.producerprotocol.pro', // Lock to your domain
    allowMethods: ['POST', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
    maxAge: 86400,
  })
);

// Middleware: Security headers
app.use('*', async (c, next) => {
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'no-referrer');
  c.header("Content-Security-Policy", "default-src 'self'; img-src 'self' data:");
  await next();
});

// Convert ArrayBuffer to Base64
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// POST /generate - Generate and store an image
app.post('/generate', async (c) => {
  try {
    // Parse and validate request body
    const body = await c.req.json<GenerateRequest>();
    const { prompt, userId } = body;

    if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
      return c.json({ error: 'Prompt is required and must be a non-empty string' }, 400);
    }
    if (!userId || typeof userId !== 'string' || userId.trim() === '') {
      return c.json({ error: 'userId is required and must be a non-empty string' }, 400);
    }

    // Sanitize inputs (basic trimming)
    const sanitizedPrompt = prompt.trim();
    const sanitizedUserId = userId.trim();

    // Generate image with Workers AI
    console.log(`Generating image for user ${sanitizedUserId} with prompt: ${sanitizedPrompt}`);
    const aiResponse = await c.env.AI.run('@cf/stabilityai/stable-diffusion-xl-base-1.0', {
      prompt: sanitizedPrompt,
    });

    // Convert image to Base64
    const imageBuffer = await aiResponse.arrayBuffer();
    const base64Image = arrayBufferToBase64(imageBuffer);

    // Store in KV with a TTL of 30 days
    await c.env.ajamkillerartist.put(sanitizedUserId, base64Image, { expirationTtl: 2592000 });
    console.log(`Image stored for user ${sanitizedUserId}`);

    // Return success response
    return c.json({
      message: 'Image generated and stored successfully',
      userId: sanitizedUserId,
      imagePreview: base64Image.slice(0, 30) + '...', // Truncated for response size
    }, 200);
  } catch (error) {
    console.error('Error in /generate:', error);
    return c.json({ error: 'Failed to generate or store image' }, 500);
  }
});

// Error handling for unmatched routes
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json({ error: 'Internal server error' }, 500);
});

export default app;