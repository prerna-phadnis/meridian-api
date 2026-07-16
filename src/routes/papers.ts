// meridian-api/src/routes/papers.ts

import type { FastifyInstance } from 'fastify'
import { authenticate } from '../middleware/auth.js'
import { supabase } from '../lib/supabase.js'
import { randomUUID } from 'crypto'
import axios from 'axios'

export const paperRoutes = async (fastify: FastifyInstance) => {
  // GET /api/papers
  fastify.get(
    '/',
    { preHandler: authenticate },
    async (request, reply) => {
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
    }
  )

  // POST /api/papers/upload
  fastify.post(
    '/upload',
    { preHandler: authenticate },
    async (request, reply) => {
      // @ts-ignore
      const userId = request.user.id

      try {
        const file = await request.file()

        if (!file) {
          return reply.status(400).send({ error: 'No file provided' })
        }

        if (file.mimetype !== 'application/pdf') {
          return reply.status(400).send({ error: 'Only PDF files are allowed' })
        }

        const fileBuffer = await file.toBuffer()

        const maxSize = 20 * 1024 * 1024
        if (fileBuffer.length > maxSize) {
          return reply.status(400).send({ error: 'File too large. Max 20MB.' })
        }

        const paperId = randomUUID()
        const filePath = `${userId}/${paperId}.pdf`
        const originalName = file.filename.replace(/\.pdf$/i, '')

        const { error: uploadError } = await supabase.storage
          .from('papers')
          .upload(filePath, fileBuffer, {
            contentType: 'application/pdf',
            upsert: false,
          })

        if (uploadError) {
          console.error('Storage upload error:', uploadError)
          return reply.status(500).send({ error: 'Failed to upload file' })
        }

        const { data: urlData } = await supabase.storage
          .from('papers')
          .createSignedUrl(filePath, 60 * 60 * 24 * 7)

        const { data: paper, error: dbError } = await supabase
          .from('papers')
          .insert({
            id: paperId,
            user_id: userId,
            title: originalName,
            file_url: urlData?.signedUrl || '',
            file_path: filePath,
            status: 'pending',
          })
          .select()
          .single()

        if (dbError) {
          console.error('DB insert error:', dbError)

          await supabase.storage.from('papers').remove([filePath])

          return reply.status(500).send({ error: 'Failed to save paper' })
        }

        axios
          .post(`${process.env.PYTHON_AI_URL}/api/process`, {
            paper_id: paperId,
            file_path: filePath,
            user_id: userId,
          })
          .catch((err) => {
            console.error('Failed to trigger AI processing:', err.message)
          })

        return reply.status(201).send({
          message: 'Paper uploaded successfully',
          paper,
        })
      } catch (err: any) {
        console.error('Upload error:', err)
        return reply.status(500).send({ error: 'Upload failed' })
      }
    }
  )

  // GET /api/papers/:id
  fastify.get(
    '/:id',
    { preHandler: authenticate },
    async (request, reply) => {
      // @ts-ignore
      const userId = request.user.id
      const { id } = request.params as { id: string }

      const { data: paper, error } = await supabase
        .from('papers')
        .select('*')
        .eq('id', id)
        .eq('user_id', userId)
        .single()

      if (error || !paper) {
        return reply.status(404).send({ error: 'Paper not found' })
      }

      if (paper.file_path) {
        const { data: urlData } = await supabase.storage
          .from('papers')
          .createSignedUrl(paper.file_path, 60 * 60)

        paper.file_url = urlData?.signedUrl || ''
      }

      return reply.send({ paper })
    }
  )

  // DELETE /api/papers/:id
  fastify.delete(
    '/:id',
    { preHandler: authenticate },
    async (request, reply) => {
      // @ts-ignore
      const userId = request.user.id
      const { id: paperId } = request.params as { id: string }
      const errors: string[] = []

      console.log(`🗑️ Delete request - paper: ${paperId} user: ${userId}`)

      const { data: paper, error: findError } = await supabase
        .from('papers')
        .select('id, file_path, title, status')
        .eq('id', paperId)
        .eq('user_id', userId)
        .single()

      if (findError || !paper) {
        return reply.status(404).send({
          error: 'Paper not found or access denied',
        })
      }

      if (paper.file_path) {
        const { error: storageError } = await supabase.storage
          .from('papers')
          .remove([paper.file_path])

        if (storageError) {
          console.error('Storage delete error:', storageError.message)
          errors.push(`Storage: ${storageError.message}`)
        }
      }

      if (paper.status === 'ready' || paper.status === 'processing') {
        try {
          const authHeader = request.headers.authorization

          await axios.delete(
            `${process.env.PYTHON_AI_URL}/api/vectors/${paperId}`,
            {
              headers: authHeader
                ? { Authorization: authHeader }
                : undefined,
              timeout: 15000,
            }
          )
        } catch (err: any) {
          console.error('Qdrant delete error:', err.message)
          errors.push(`Vectors: ${err.message}`)
        }
      }

      const { error: dbError } = await supabase
        .from('papers')
        .delete()
        .eq('id', paperId)
        .eq('user_id', userId)

      if (dbError) {
        console.error('DB delete error:', dbError.message)
        return reply.status(500).send({
          error: 'Failed to delete paper from database',
          detail: dbError.message,
        })
      }

      return reply.send({
        message: 'Paper deleted successfully',
        paper_id: paperId,
        warnings: errors.length > 0 ? errors : undefined,
      })
    }
  )
}