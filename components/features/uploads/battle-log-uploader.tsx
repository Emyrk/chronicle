'use client'

import { useEffect, useState } from 'react'
import Uppy from '@uppy/core'
import Tus from '@uppy/tus'
import { Dashboard } from '@uppy/react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'

// Import Uppy styles
import '@uppy/core/dist/style.min.css'
import '@uppy/dashboard/dist/style.min.css'

interface BattleLogUploaderProps {
  onUploadComplete?: (fileData: {
    id: string
    fileName: string
    filePath: string
    fileSize: number
  }) => void
}

export function BattleLogUploader({ onUploadComplete }: BattleLogUploaderProps) {
  const [uppy] = useState(() =>
    new Uppy({
      restrictions: {
        maxFileSize: 50 * 1024 * 1024, // 50MB
        allowedFileTypes: ['.txt', 'text/plain'],
      },
      autoProceed: false,
    })
  )
  const { toast } = useToast()
  const supabase = createClient()

  useEffect(() => {
    // Configure Tus for resumable uploads to Supabase
    uppy.use(Tus, {
      endpoint: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/upload/resumable`,
      headers: async () => {
        const {
          data: { session },
        } = await supabase.auth.getSession()

        return {
          authorization: `Bearer ${session?.access_token}`,
        }
      },
      uploadDataDuringCreation: true,
      chunkSize: 6 * 1024 * 1024, // 6MB chunks
      allowedMetaFields: [
        'bucketName',
        'objectName',
        'contentType',
        'cacheControl',
      ],
    })

    // Handle file added event
    uppy.on('file-added', (file) => {
      const supabaseMetadata = {
        bucketName: 'battle-logs',
        objectName: `${Date.now()}-${file.name}`,
        contentType: file.type || 'text/plain',
      }

      uppy.setFileMeta(file.id, supabaseMetadata)
    })

    // Handle successful upload
    uppy.on('upload-success', async (file, _response) => {
      if (!file) return

      try {
        const filePath = file.meta.objectName as string
        
        // Get current user
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (!user) {
          throw new Error('User not authenticated')
        }

        // Insert record into database
        const { data, error } = await supabase
          .from('battle_log_uploads')
          .insert({
            user_id: user.id,
            file_name: file.name,
            file_path: filePath,
            file_size: file.size,
            content_type: file.type || 'text/plain',
            status: 'uploaded',
          })
          .select()
          .single()

        if (error) throw error

        toast({
          title: 'Upload successful!',
          description: `${file.name} has been uploaded.`,
        })

        if (onUploadComplete && data) {
          onUploadComplete({
            id: data.id,
            fileName: data.file_name,
            filePath: data.file_path,
            fileSize: data.file_size,
          })
        }
      } catch (error) {
        console.error('Error saving upload record:', error)
        toast({
          title: 'Upload error',
          description: 'File uploaded but failed to save record.',
          variant: 'destructive',
        })
      }
    })

    // Handle upload error
    uppy.on('upload-error', (file, error) => {
      console.error('Upload error:', error)
      toast({
        title: 'Upload failed',
        description: file ? `Failed to upload ${file.name}` : 'Upload failed',
        variant: 'destructive',
      })
    })

    // Cleanup
    return () => {
      uppy.close()
    }
  }, [uppy, supabase, toast, onUploadComplete])

  return (
    <Dashboard
      uppy={uppy}
      proudlyDisplayPoweredByUppy={false}
      note="Only .txt files up to 50MB"
      height={350}
    />
  )
}
