/// <reference types="@cloudflare/workers-types" />

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';

interface Env {
  AI: { run(model: string, options: { prompt: string }): Promise<any> };
  ajamkillerartist: KVNamespace;
}

interface GenerateRequest {
  prompt: string;
  userId: string;
}

const app = new Hono<{ Bindings: Env }>();

app.use('*', logger());
app.use('*', cors({
  origin: 'https://mojohand.producerprotocol.pro',
  allowMethods: ['POST', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
  maxAge: 86400,
}));
app.use('*', async (c, next) => {
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'no-referrer');
  c.header("Content-Security-Policy", "default-src 'self'; img-src 'self' data:");
  await next();
});

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

app.post('/generate', async (c) => {
  try {
    const body = await c.req.json<GenerateRequest>();
    const { prompt, userId } = body;

    if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
      return c.json({ error: 'Prompt is required and must be a non-empty string' }, 400);
    }
    if (!userId || typeof userId !== 'string' || userId.trim() === '') {
      return c.json({ error: 'userId is required and must be a non-empty string' }, 400);
    }

    const sanitizedPrompt = prompt.trim();
    const sanitizedUserId = userId.trim();

    console.log(`Generating image for ${sanitizedUserId} with prompt: ${sanitizedPrompt}`);
    const aiResponse = await c.env.AI.run('@cf/stabilityai/stable-diffusion-xl-base-1.0', { prompt: sanitizedPrompt });
    console.log('Raw AI response:', aiResponse);

    // Check if aiResponse is a Response object with arrayBuffer
    if (!(aiResponse instanceof Response) || typeof aiResponse.arrayBuffer !== 'function') {
      let errorDetail = 'Unknown response type';
      try {
        errorDetail = JSON.stringify(await aiResponse.json());
      } catch (e) {
        errorDetail = String(aiResponse);
      }
      console.error(`AI response invalid: ${errorDetail}`);
      return c.json({ error: 'AI service returned invalid response', detail: errorDetail }, 500);
    }

    const imageBuffer = await aiResponse.arrayBuffer();
    const base64Image = arrayBufferToBase64(imageBuffer);

    await c.env.ajamkillerartist.put(sanitizedUserId, base64Image, { expirationTtl: 2592000 });
    console.log(`Image stored for ${sanitizedUserId}`);

    return c.json({
      data: {
        image: `data:image/png;base64,${base64Image}`
      }
    }, 200);
  } catch (error) {
    console.error('Image generation failed:', error);
    return c.json({ error: 'Failed to generate image', detail: error.message }, 500);
  }
});

app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json({ error: 'Internal server error', detail: err.message }, 500);
});

export default app;