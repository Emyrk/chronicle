import { createClient } from '@/lib/supabase/server'

export async function getUserUploads() {
  const supabase = await createClient()
  
  const { data: uploads, error } = await supabase
    .from('battle_log_uploads')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching uploads:', error)
    return []
  }

  return uploads
}

export async function getUploadById(id: string) {
  const supabase = await createClient()
  
  const { data: upload, error } = await supabase
    .from('battle_log_uploads')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    console.error('Error fetching upload:', error)
    return null
  }

  return upload
}
