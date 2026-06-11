// src/middleware/auth.ts
// Verifies supabase token on every protected request

import type { FastifyRequest, FastifyReply } from 'fastify'
import { supabase } from '../lib/supabase'

export const authenticate = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const authHeader = request.headers.authorization

    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'No token provided' })
    }

    const token = authHeader.split(' ')[1]

    const { data: { user }, error } = await supabase.auth.getUser(token)

    if (error || !user) {
      return reply.status(401).send({ error: 'Invalid token' })
    }

    // Attach user to request
    // @ts-ignore
    request.user = user

  } catch {
    return reply.status(401).send({ error: 'Auth failed' })
  }
}