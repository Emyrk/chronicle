import { createClient } from '@/lib/supabase/server'
import { DashboardContent } from './DashboardContent'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return <DashboardContent user={user} />
}