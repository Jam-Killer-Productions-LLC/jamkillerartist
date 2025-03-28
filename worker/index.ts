/// <reference types="@cloudflare/workers-types" />

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import type { Context } from 'hono';

interface Env {
  AI: {
    run: (
      model: string,
      options: { prompt: string; steps?: number }
    ) => Promise<{ image: string }>;
  };
  ajamkillerartist: KVNamespace;
}

const app = new Hono<{ Bindings: Env }>();

// Apply middleware
app.use('*', logger());
app.use('*', prettyJSON());
app.use(
  '*',
  cors({
    origin: [
      'https://mojohand.producerprotocol.pro',
      'https://ajamkillerstory.pages.dev',
      'https://producerprotocol.pro',
      'https://narratives.producerprotocol.pro',
    ],
    allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'Accept'],
    credentials: true,
    maxAge: 86400,
  })
);

// Security headers
app.use('*', async (c: Context<{ Bindings: Env }>, next) => {
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('X-XSS-Protection', '1; mode=block');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header(
    'Content-Security-Policy',
    "default-src 'self'; connect-src 'self' https://nftartist.producerprotocol.pro https://mojohand.producerprotocol.pro https://producerprotocol.pro https://c.thirdweb.com; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';"
  );
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  await next();
});

// Health check
app.get('/', (c) => c.json({ status: 'ok', message: 'Artistic Worker is running' }));

// Check existing image
app.get('/image/:userId', async (c) => {
  const userId = c.req.param('userId');
  if (!userId) {
    return c.json({ error: 'User ID is required' }, 400);
  }

  try {
    // Check if KV binding exists
    if (!c.env.ajamkillerartist) {
      console.error('KV binding is not defined');
      return c.json({ error: 'Service configuration error' }, 500);
    }
    
    const image = await c.env.ajamkillerartist.get(userId);
    if (!image) {
      return c.json({ error: 'No image found' }, 404);
    }
    return c.json({ image });
  } catch (error) {
    console.error('Error fetching image:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Delete existing image
app.delete('/image/:userId', async (c) => {
  const userId = c.req.param('userId');
  if (!userId) {
    return c.json({ error: 'User ID is required' }, 400);
  }

  try {
    // Check if KV binding exists
    if (!c.env.ajamkillerartist) {
      console.error('KV binding is not defined');
      return c.json({ error: 'Service configuration error' }, 500);
    }
    
    await c.env.ajamkillerartist.delete(userId);
    return c.json({ message: 'Image deleted successfully' });
  } catch (error) {
    console.error('Error deleting image:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Generate new image
app.post('/generate', async (c) => {
  try {
    const { prompt, userId } = await c.req.json();

    if (!prompt || !userId) {
      return c.json({ error: 'Prompt and user ID are required' }, 400);
    }

    // Format the prompt for the AI
    const formattedPrompt = `${prompt}
Style: Ultra-detailed digital art, 8K resolution, professional lighting, cinematic composition.
Technical specifications:
- Sharp, clear details with high contrast
- Rich, vibrant colors with professional color grading
- Dramatic lighting with perfect exposure
- Professional composition following rule of thirds
- Photorealistic textures and materials

Negative prompt: blurry, low resolution, pixelated, watermarks, text overlays, distorted proportions, amateur composition, noise, grain, out of focus, poorly lit, oversaturated, washed out.`;

    // Check if AI binding exists
    if (!c.env.AI) {
      console.error('AI binding is not defined');
      return c.json({ error: 'Service configuration error' }, 500);
    }

    // Generate the image using AI
    const aiResponse = await c.env.AI.run('@cf/black-forest-labs/flux-1-schnell', {
      prompt: formattedPrompt,
      steps: 8, // Maximum steps for highest quality
    });

    if (!aiResponse || !aiResponse.image) {
      throw new Error('Invalid AI response');
    }

    const imageData = aiResponse.image;

    // Check if KV binding exists
    if (!c.env.ajamkillerartist) {
      console.error('KV binding is not defined');
      return c.json({ error: 'Service configuration error' }, 500);
    }

    // Store the image in KV
    await c.env.ajamkillerartist.put(userId, imageData);

    return c.json({
      message: 'Image generated successfully',
      userId,
      image: imageData,
    });
  } catch (error) {
    console.error('Error generating image:', error);
    return c.json({ error: 'Failed to generate image' }, 500);
  }
});

export default {
  fetch: (request: Request, env: Env, ctx: ExecutionContext) => {
    // Make bindings available to the app
    return app.fetch(request, env, ctx);
  }
};