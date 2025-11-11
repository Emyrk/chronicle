import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/types/supabase'

// Type helper for table rows
type Tables<T extends keyof Database['public']['Tables']> = 
  Database['public']['Tables'][T]['Row']

// Example query function template
// Replace 'your_table' with actual table name from your schema
export async function getExampleData() {
  const supabase = await createClient()
  
  // Example: Fetch user profile
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return null
  }

  // This is a template - implement your actual queries here
  // Example patterns:
  // const { data, error } = await supabase
  //   .from('posts')
  //   .select('*, profiles!inner(username)')
  //   .order('created_at', { ascending: false })
  
  return { userId: user.id }
}