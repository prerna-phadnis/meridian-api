import type { FastifyInstance } from 'fastify'
import { authenticate } from '../middleware/auth'
import { supabase } from '../lib/supabase'
import { randomUUID } from 'crypto'
import axios from 'axios'

export const paperRoutes = async (fastify: FastifyInstance) => {
  // GET /api/papers
  fastify.get(
    '/',
    {
      preHandler: authenticate
    },
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
    {
      preHandler: authenticate
    },
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

        const { error: uploadError } = await supabase.storage
          .from('papers')
          .upload(filePath, fileBuffer, {
            contentType: 'application/pdf',
            upsert: false
          })

        if (uploadError) {
          console.error('Storage upload error:', uploadError)
          return reply.status(500).send({ error: 'Failed to upload file' })
        }

        const { data: urlData } = await supabase.storage
          .from('papers')
          .createSignedUrl(filePath, 60 * 60 * 24 * 7)

        const originalName = file.filename.replace('.pdf', '')

        const { data: paper, error: dbError } = await supabase
          .from('papers')
          .insert({
            id: paperId,
            user_id: userId,
            title: originalName,
            file_url: urlData?.signedUrl || '',
            file_path: filePath,
            status: 'pending'
          })
          .select()
          .single()

        if (dbError) {
          console.error('DB insert error:', dbError)
          return reply.status(500).send({ error: 'Failed to save paper' })
        }

        axios
          .post(`${process.env.PYTHON_AI_URL}/api/process`, {
            paper_id: paperId,
            file_path: filePath,
            user_id: userId
          })
          .catch((err) => {
            console.error('Failed to trigger AI processing:', err.message)
          })

        return reply.status(201).send({
          message: 'Paper uploaded successfully',
          paper
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
    {
      preHandler: authenticate
    },
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
    {
      preHandler: authenticate
    },
    async (request, reply) => {
      // @ts-ignore
      const userId = request.user.id
      const { id } = request.params as { id: string }

      const { data: paper } = await supabase
        .from('papers')
        .select('*')
        .eq('id', id)
        .eq('user_id', userId)
        .single()

      if (!paper) {
        return reply.status(404).send({ error: 'Paper not found' })
      }

      if (paper.file_path) {
        await supabase.storage.from('papers').remove([paper.file_path])
      }

      await supabase
        .from('papers')
        .delete()
        .eq('id', id)
        .eq('user_id', userId)

      return reply.send({ message: 'Paper deleted' })
    }
  )
}