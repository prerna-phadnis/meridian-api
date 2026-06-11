// src/routes/papers.ts

import type { FastifyInstance } from 'fastify'
import { authenticate } from '../middleware/auth'
import { supabase } from '../lib/supabase'

export const paperRoutes = async (fastify: FastifyInstance) => {

  // GET /api/papers
  // Returns all papers for logged in user
  fastify.get('/', {
    preHandler: authenticate
  }, async (request, reply) => {
    // @ts-ignore
    const userId = request.user.id

    const { data: papers, error } = await supabase
      .from('papers')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) {
      return reply.status(500).send({ error: 'Failed to fetch papers' })
    }

    return reply.send({ papers })
  })

  // Health check
  fastify.get('/health', async (request, reply) => {
    return reply.send({
      status: 'ok',
      service: 'meridian-api'
    })
  })
}