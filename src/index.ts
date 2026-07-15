import Fastify from 'fastify'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import dotenv from 'dotenv'

import { paperRoutes } from './routes/papers.js'
import { chatRoutes } from './routes/chat.js'
import { notesRoutes } from './routes/notes.js'

dotenv.config()

const fastify = Fastify({ logger: true })

const start = async () => {
  await fastify.register(cors, {
    origin: ['http://localhost:5173'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })

  await fastify.register(multipart, {
    limits: {
      fileSize: 50 * 1024 * 1024,
    },
  })

  await fastify.register(paperRoutes, {
    prefix: '/api/papers',
  })

  await fastify.register(chatRoutes, {
    prefix: '/api/chat',
  })

  await fastify.register(notesRoutes, {
    prefix: '/api/notes',
  })

  fastify.get('/', async () => ({
    message: '🧠 Meridian API',
    status: 'running',
  }))

  await fastify.listen({
    port: Number(process.env.PORT) || 3000,
    host: '0.0.0.0',
  })

  console.log('✅ meridian-api running on http://localhost:3000')
}

start()