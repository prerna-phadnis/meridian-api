// meridian-api/src/routes/notes.ts

import type { FastifyInstance } from 'fastify'
import { authenticate } from '../middleware/auth'
import axios from 'axios'

export const notesRoutes = async (fastify: FastifyInstance) => {
  // POST /api/notes/generate
  fastify.post(
    '/generate',
    {
      preHandler: authenticate
    },
    async (request, reply) => {
      const { paper_id } = request.body as { paper_id: string }
      const authHeader = request.headers.authorization

      if (!paper_id) {
        return reply.status(400).send({ error: 'paper_id required' })
      }

      try {
        const response = await axios.post(
          `${process.env.PYTHON_AI_URL}/api/notes/generate`,
          { paper_id },
          {
            headers: { Authorization: authHeader },
            timeout: 60000
          }
        )

        return reply.send(response.data)
      } catch (err: any) {
        console.error('Notes error:', err.response?.data || err.message)

        return reply.status(500).send({
          error: err.response?.data?.detail || 'Failed to generate notes'
        })
      }
    }
  )

  // POST /api/notes/citations
  fastify.post(
    '/citations',
    {
      preHandler: authenticate
    },
    async (request, reply) => {
      const { paper_id } = request.body as { paper_id: string }
      const authHeader = request.headers.authorization

      if (!paper_id) {
        return reply.status(400).send({ error: 'paper_id required' })
      }

      try {
        const response = await axios.post(
          `${process.env.PYTHON_AI_URL}/api/notes/citations`,
          { paper_id },
          {
            headers: { Authorization: authHeader },
            timeout: 60000
          }
        )

        return reply.send(response.data)
      } catch (err: any) {
        console.error('Citations error:', err.response?.data || err.message)

        return reply.status(500).send({
          error: err.response?.data?.detail || 'Failed to extract citations'
        })
      }
    }
  )
}