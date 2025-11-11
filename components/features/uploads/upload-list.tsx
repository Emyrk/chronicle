'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { Trash2, Download } from 'lucide-react'

type Upload = {
  id: string
  file_name: string
  file_path: string
  file_size: number
  status: string
  created_at: string
}

interface UploadListProps {
  uploads: Upload[]
  onDelete?: () => void
}

export function UploadList({ uploads: initialUploads, onDelete }: UploadListProps) {
  const [uploads, setUploads] = useState<Upload[]>(initialUploads)
  const [deleting, setDeleting] = useState<string | null>(null)
  const supabase = createClient()
  const { toast } = useToast()

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const handleDownload = async (upload: Upload) => {
    try {
      const { data, error } = await supabase.storage
        .from('battle-logs')
        .download(upload.file_path)

      if (error) throw error

      // Create download link
      const url = window.URL.createObjectURL(data)
      const a = document.createElement('a')
      a.href = url
      a.download = upload.file_name
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      toast({
        title: 'Download started',
        description: `Downloading ${upload.file_name}`,
      })
    } catch (error) {
      console.error('Download error:', error)
      toast({
        title: 'Download failed',
        description: 'Failed to download the file.',
        variant: 'destructive',
      })
    }
  }

  const handleDelete = async (upload: Upload) => {
    if (!confirm(`Are you sure you want to delete ${upload.file_name}?`)) {
      return
    }

    setDeleting(upload.id)

    try {
      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('battle-logs')
        .remove([upload.file_path])

      if (storageError) throw storageError

      // Delete from database
      const { error: dbError } = await supabase
        .from('battle_log_uploads')
        .delete()
        .eq('id', upload.id)

      if (dbError) throw dbError

      setUploads((prev) => prev.filter((u) => u.id !== upload.id))

      toast({
        title: 'File deleted',
        description: `${upload.file_name} has been deleted.`,
      })

      onDelete?.()
    } catch (error) {
      console.error('Delete error:', error)
      toast({
        title: 'Delete failed',
        description: 'Failed to delete the file.',
        variant: 'destructive',
      })
    } finally {
      setDeleting(null)
    }
  }

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive'> = {
      uploaded: 'default',
      processing: 'secondary',
      parsed: 'default',
      error: 'destructive',
    }

    return (
      <Badge variant={variants[status] || 'default'}>
        {status}
      </Badge>
    )
  }

  if (uploads.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No uploads yet. Upload your first battle log above!
      </div>
    )
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>File Name</TableHead>
            <TableHead>Size</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Uploaded</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {uploads.map((upload) => (
            <TableRow key={upload.id}>
              <TableCell className="font-medium">{upload.file_name}</TableCell>
              <TableCell>{formatFileSize(upload.file_size)}</TableCell>
              <TableCell>{getStatusBadge(upload.status)}</TableCell>
              <TableCell>{formatDate(upload.created_at)}</TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDownload(upload)}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(upload)}
                    disabled={deleting === upload.id}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
