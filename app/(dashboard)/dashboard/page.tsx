import { createClient } from '@/lib/supabase/server'
import { DashboardContent } from './DashboardContent'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Fetch user's uploads
  const { data: uploads } = await supabase
    .from('battle_log_uploads')
    .select('*')
    .order('created_at', { ascending: false })

  return <DashboardContent user={user} uploads={uploads || []} />
}