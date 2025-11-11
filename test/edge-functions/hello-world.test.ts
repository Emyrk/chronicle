/**
 * Node/Vitest integration test for hello-world Edge Function
 * Tests the deployed function via HTTP requests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321'
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/hello-world`

describe('hello-world Edge Function (Integration)', () => {
  beforeAll(() => {
    // Ensure Supabase is running locally for these tests
    console.log('Testing against:', FUNCTION_URL)
  })

  it('should return greeting with provided name', async () => {
    const response = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Vitest' }),
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')

    const data = await response.json()
    expect(data).toEqual({ message: 'Hello Vitest!' })
  })

  it('should handle different names', async () => {
    const response = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Integration Test' }),
    })

    const data = await response.json()
    expect(data.message).toBe('Hello Integration Test!')
  })

  it('should return 400 when name is missing', async () => {
    const response = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    })

    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.error).toBe('Name is required')
  })

  it('should return 400 when JSON is invalid', async () => {
    const response = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: 'invalid json',
    })

    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.error).toBe('Invalid JSON body')
  })

  it('should require authorization header', async () => {
    const response = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Test' }),
    })

    // Supabase returns 401 for missing auth
    expect(response.status).toBe(401)
  })
})
