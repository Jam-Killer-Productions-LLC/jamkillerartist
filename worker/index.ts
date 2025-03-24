/// <reference types="@cloudflare/workers-types" />

import { Hono } from 'hono'
import { cors } from 'hono/cors'

interface Ai {
  run(model: string, options: { prompt: string }): Promise<Response>
}

interface Env {
  AI: Ai
  ajamkillerartist: KVNamespace
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

const app = new Hono<{ Bindings: Env }>()

app.use('*', cors())
app.use('*', async (c, next) => {
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('X-Frame-Options', 'DENY')
  c.header('Referrer-Policy', 'no-referrer')
  c.header('Content-Security-Policy', "default-src 'self'")
  await next()
})

app.post('/generate', async (c) => {
  try {
    const { prompt, userId } = await c.req.json<{ prompt: string; userId: string }>()
    if (!prompt || !userId) {
      return c.json({ error: 'Missing prompt or userId' }, 400)
    }

    const aiResponse = await c.env.AI.run('@cf/stabilityai/stable-diffusion-xl-base-1.0', { prompt })
    const imageBuffer = await aiResponse.arrayBuffer()
    const base64Image = arrayBufferToBase64(imageBuffer)

    await c.env.ajamkillerartist.put(userId, base64Image)

    return c.json({
      message: 'Image generated and stored successfully',
      userId,
      imagePreview: base64Image.slice(0, 30) + '...'
    })
  } catch (error) {
    console.error('Error generating image:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

export default app