// meridian-api/src/routes/papers.ts
// Add delete endpoint at the bottom
// This handles the full deletion cascade:
// Storage → Qdrant → Database

import type { FastifyInstance } from 'fastify'
import { authenticate } from '../middleware/auth'
import { supabase } from '../lib/supabase'
import { randomUUID } from 'crypto'
import axios from 'axios'

export const paperRoutes = async (fastify: FastifyInstance) => {
  fastify.delete('/:id', {
    preHandler: authenticate
  }, async (request, reply) => {
    // @ts-ignore
    const userId = request.user.id
    const { id: paperId } = request.params as { id: string }

    console.log(`🗑️ Delete request - paper: ${paperId} user: ${userId}`)

    // Step 1: Find paper + verify ownership
    const { data: paper, error: findError } = await supabase
      .from('papers')
      .select('id, file_path, title, status')
      .eq('id', paperId)
      .eq('user_id', userId)
      .single()

    if (findError || !paper) {
      return reply.status(404).send({
        error: 'Paper not found or access denied'
      })
    }

    console.log(`📄 Found paper: ${paper.title}`)

    const errors: string[] = []

    // Step 2: Delete from Supabase Storage
    if (paper.file_path) {
      console.log(`🗑️ Deleting file: ${paper.file_path}`)

      const { error: storageError } = await supabase
        .storage
        .from('papers')
        .remove([paper.file_path])

      if (storageError) {
        console.error('Storage delete error:', storageError.message)
        errors.push(`Storage: ${storageError.message}`)
        // Continue anyway, do not stop deletion
      } else {
        console.log('✅ File deleted from storage')
      }
    }

    // Step 3: Delete vectors from Qdrant
    // Only if paper was processed has vectors
    if (paper.status === 'ready' || paper.status === 'processing') {
      try {
        const authHeader = request.headers.authorization

        await axios.delete(
          `${process.env.PYTHON_AI_URL}/api/vectors/${paperId}`,
          {
            headers: { Authorization: authHeader },
            timeout: 15000
          }
        )

        console.log('✅ Vectors deleted from Qdrant')

      } catch (err: any) {
        console.error('Qdrant delete error:', err.message)
        errors.push(`Vectors: ${err.message}`)
        // Continue anyway
      }
    }

    // Step 4: Delete from Database
    // This cascades to chat_messages too
    const { error: dbError } = await supabase
      .from('papers')
      .delete()
      .eq('id', paperId)
      .eq('user_id', userId)

    if (dbError) {
      console.error('DB delete error:', dbError.message)
      return reply.status(500).send({
        error: 'Failed to delete paper from database',
        detail: dbError.message
      })
    }

    console.log(`✅ Paper deleted: ${paperId}`)

    return reply.send({
      message: 'Paper deleted successfully',
      paper_id: paperId,
      warnings: errors.length > 0 ? errors : undefined
    })
  })
}