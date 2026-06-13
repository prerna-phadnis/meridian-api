import Fastify from 'fastify'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import dotenv from 'dotenv'
import { paperRoutes } from './routes/papers'
import { chatRoutes } from './routes/chat'

dotenv.config()

const fastify = Fastify({ logger: true })

const start = async () => {

  await fastify.register(cors, {
    origin: ['http://localhost:5173'],
    credentials: true
  })

  await fastify.register(multipart, {
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB
  })

  fastify.register(paperRoutes, { prefix: '/api/papers' })
  fastify.register(chatRoutes, {
  prefix: '/api/chat'
})

  fastify.get('/', async () => ({
    message: '🧠 Meridian API',
    status: 'running'
  }))

  await fastify.listen({
    port: Number(process.env.PORT) || 3000,
    host: '0.0.0.0'
  })

  console.log('✅ meridian-api running on http://localhost:3000')
}

start()