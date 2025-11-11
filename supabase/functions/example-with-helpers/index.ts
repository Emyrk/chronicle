// Example Edge Function demonstrating testable patterns
import "jsr:@supabase/functions-js/edge-runtime.d.ts"

interface CreateUserRequest {
  email: string
  name: string
}

interface CreateUserResponse {
  id: string
  email: string
  name: string
  createdAt: string
}

interface ErrorResponse {
  error: string
  details?: string
}

/**
 * Validate email format
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

/**
 * Handler for creating users
 * Demonstrates various testable patterns
 */
export const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' } as ErrorResponse),
      { 
        status: 405, 
        headers: { 'Content-Type': 'application/json' } 
      }
    )
  }

  try {
    // Parse request body
    const body = await req.json() as CreateUserRequest

    // Validate required fields
    if (!body.email || !body.name) {
      return new Response(
        JSON.stringify({ 
          error: 'Validation failed',
          details: 'Email and name are required'
        } as ErrorResponse),
        { 
          status: 400, 
          headers: { 'Content-Type': 'application/json' } 
        }
      )
    }

    // Validate email format
    if (!isValidEmail(body.email)) {
      return new Response(
        JSON.stringify({ 
          error: 'Validation failed',
          details: 'Invalid email format'
        } as ErrorResponse),
        { 
          status: 400, 
          headers: { 'Content-Type': 'application/json' } 
        }
      )
    }

    // Validate name length
    if (body.name.length < 2 || body.name.length > 100) {
      return new Response(
        JSON.stringify({ 
          error: 'Validation failed',
          details: 'Name must be between 2 and 100 characters'
        } as ErrorResponse),
        { 
          status: 400, 
          headers: { 'Content-Type': 'application/json' } 
        }
      )
    }

    // Check for authorization header (example of auth check)
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ 
          error: 'Unauthorized',
          details: 'Authorization header required'
        } as ErrorResponse),
        { 
          status: 401, 
          headers: { 'Content-Type': 'application/json' } 
        }
      )
    }

    // Simulate user creation (in real app, this would be a database call)
    const user: CreateUserResponse = {
      id: crypto.randomUUID(),
      email: body.email,
      name: body.name,
      createdAt: new Date().toISOString(),
    }

    // Return success response
    return new Response(
      JSON.stringify(user),
      { 
        status: 201,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        } 
      }
    )

  } catch (error) {
    // Handle JSON parsing errors
    return new Response(
      JSON.stringify({ 
        error: 'Invalid request',
        details: 'Could not parse request body as JSON'
      } as ErrorResponse),
      { 
        status: 400, 
        headers: { 'Content-Type': 'application/json' } 
      }
    )
  }
}

Deno.serve(handler)
