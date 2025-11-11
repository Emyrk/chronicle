'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// Example server action template
export async function exampleAction(formData: FormData) {
  const supabase = await createClient()
  
  // Get the current user
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error('Unauthorized')

  // Extract and validate form data
  const exampleField = formData.get('example') as string

  if (!exampleField) {
    throw new Error('Example field is required')
  }

  // Example action implementation
  // Replace with your actual database operations:
  // const { data, error } = await supabase
  //   .from('your_table')
  //   .insert({
  //     field: exampleField,
  //     user_id: user.id,
  //   })
  //   .select()
  //   .single()

  // Revalidate the cache for affected pages
  revalidatePath('/')
  
  return { success: true, userId: user.id }
}