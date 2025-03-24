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
  origin: ['https://mojohand.producerprotocol.pro', 'http://localhost:5173'], // Add localhost for development
  allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
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

async function streamToArrayBuffer(stream: ReadableStream): Promise<ArrayBuffer> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let totalLength = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    totalLength += value.length;
  }

  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result.buffer;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Add GET endpoint to check for existing image
app.get('/image/:userId', async (c) => {
  try {
    const userId = c.req.param('userId');
    
    if (!userId || typeof userId !== 'string' || userId.trim() === '') {
      return c.json({ error: 'userId is required and must be a non-empty string' }, 400);
    }
    
    const sanitizedUserId = userId.trim();
    console.log(`Checking for existing image for ${sanitizedUserId}`);
    
    const existingImage = await c.env.ajamkillerartist.get(sanitizedUserId);
    
    if (!existingImage) {
      return c.json({ error: 'No image found for this user' }, 404);
    }
    
    return c.json({
      message: 'Image found',
      userId: sanitizedUserId,
      image: `data:image/png;base64,${existingImage}`
    }, 200);
  } catch (error) {
    console.error('Error retrieving image:', error);
    return c.json({ error: 'Failed to retrieve image', detail: error.message }, 500);
  }
});

// Add DELETE endpoint to remove existing image
app.delete('/image/:userId', async (c) => {
  try {
    const userId = c.req.param('userId');
    
    if (!userId || typeof userId !== 'string' || userId.trim() === '') {
      return c.json({ error: 'userId is required and must be a non-empty string' }, 400);
    }
    
    const sanitizedUserId = userId.trim();
    console.log(`Deleting image for ${sanitizedUserId}`);
    
    await c.env.ajamkillerartist.delete(sanitizedUserId);
    
    return c.json({
      message: 'Image deleted successfully',
      userId: sanitizedUserId
    }, 200);
  } catch (error) {
    console.error('Error deleting image:', error);
    return c.json({ error: 'Failed to delete image', detail: error.message }, 500);
  }
});

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
    console.log('Raw AI response type:', Object.prototype.toString.call(aiResponse));

    let imageBuffer: ArrayBuffer;
    if (aiResponse instanceof ReadableStream) {
      console.log('Processing ReadableStream response');
      imageBuffer = await streamToArrayBuffer(aiResponse);
    } else if (aiResponse instanceof Response && typeof aiResponse.arrayBuffer === 'function') {
      console.log('Processing Response object');
      imageBuffer = await aiResponse.arrayBuffer();
    } else {
      let errorDetail = 'Unknown response type';
      try {
        errorDetail = JSON.stringify(await aiResponse.json());
      } catch (e) {
        errorDetail = String(aiResponse);
      }
      console.error(`AI response invalid: ${errorDetail}`);
      return c.json({ error: 'AI service returned invalid response', detail: errorDetail }, 500);
    }

    console.log('Image buffer length:', imageBuffer.byteLength);
    const base64Image = arrayBufferToBase64(imageBuffer);

    await c.env.ajamkillerartist.put(sanitizedUserId, base64Image, { expirationTtl: 2592000 });
    console.log(`Image stored for ${sanitizedUserId}`);

    return c.json({
      message: 'Image generated successfully',
      userId: sanitizedUserId,
      image: `data:image/png;base64,${base64Image}`
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
