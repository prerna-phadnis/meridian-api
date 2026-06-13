import type { FastifyInstance } from 'fastify'
import { authenticate } from '../middleware/auth'
import { supabase } from '../lib/supabase'
import axios from 'axios'

export const chatRoutes = async (fastify: FastifyInstance) => {
  fastify.post('/', {
    preHandler: authenticate
  }, async (request, reply) => {
    // @ts-ignore
    const userId = request.user.id

    const { question, paper_id } = request.body as {
      question: string
      paper_id: string
    }

    if (!question || !paper_id) {
      return reply.status(400).send({
        error: 'question and paper_id are required'
      })
    }

    const { data: paper } = await supabase
      .from('papers')
      .select('id, status')
      .eq('id', paper_id)
      .eq('user_id', userId)
      .single()

    if (!paper) {
      return reply.status(404).send({
        error: 'Paper not found'
      })
    }

    if (paper.status !== 'ready') {
      return reply.status(400).send({
        error: 'Paper is still processing. Please wait.'
      })
    }

    try {
      const authHeader = request.headers.authorization

      const aiResponse = await axios.post(
        `${process.env.PYTHON_AI_URL}/api/chat`,
        { question, paper_id },
        { headers: { Authorization: authHeader } }
      )

      const { answer, sources } = aiResponse.data

      await supabase.from('chat_messages').insert([
        {
          paper_id,
          user_id: userId,
          role: 'user',
          content: question
        },
        {
          paper_id,
          user_id: userId,
          role: 'assistant',
          content: answer,
          sources
        }
      ])

      return reply.send({ answer, sources })

    } catch (err: any) {
      console.error('Chat error:', err.message)

      return reply.status(500).send({
        error: 'Chat failed'
      })
    }
  })

  fastify.get('/:paper_id/history', {
    preHandler: authenticate
  }, async (request, reply) => {
    // @ts-ignore
    const userId = request.user.id

    const { paper_id } = request.params as {
      paper_id: string
    }

    const { data: messages } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('paper_id', paper_id)
      .eq('user_id', userId)
      .order('created_at', { ascending: true })

    return reply.send({
      messages: messages || []
    })
  })
}