/**
 * Shared test utilities for Edge Functions
 * Import these helpers in your Deno tests
 */

/**
 * Create a mock Request object for testing
 */
export function createMockRequest(
  options: {
    method?: string
    headers?: Record<string, string>
    body?: unknown
    url?: string
  } = {}
): Request {
  const {
    method = 'POST',
    headers = { 'Content-Type': 'application/json' },
    body = {},
    url = 'http://localhost:8000',
  } = options

  // GET and HEAD requests cannot have a body
  const requestInit: RequestInit = {
    method,
    headers,
  }

  if (method !== 'GET' && method !== 'HEAD') {
    requestInit.body = typeof body === 'string' ? body : JSON.stringify(body)
  }

  return new Request(url, requestInit)
}

/**
 * Parse JSON response and return both data and response
 */
export async function parseResponse<T = unknown>(
  response: Response
): Promise<{ data: T; response: Response }> {
  const data = await response.json() as T
  return { data, response }
}

/**
 * Mock environment variables for testing
 */
export function mockEnv(vars: Record<string, string>): void {
  Object.entries(vars).forEach(([key, value]) => {
    Deno.env.set(key, value)
  })
}

/**
 * Restore environment variables after testing
 */
export function restoreEnv(vars: string[]): void {
  vars.forEach((key) => {
    Deno.env.delete(key)
  })
}

/**
 * Create a mock Supabase client for testing
 * Note: This is a basic mock - extend as needed
 */
export function createMockSupabaseClient() {
  return {
    from: (table: string) => ({
      select: () => Promise.resolve({ data: [], error: null }),
      insert: () => Promise.resolve({ data: {}, error: null }),
      update: () => Promise.resolve({ data: {}, error: null }),
      delete: () => Promise.resolve({ data: {}, error: null }),
    }),
    auth: {
      getUser: () => Promise.resolve({ data: { user: null }, error: null }),
    },
  }
}

/**
 * Assert response is successful JSON
 */
export function assertJsonResponse(
  response: Response,
  expectedStatus = 200
): void {
  if (response.status !== expectedStatus) {
    throw new Error(
      `Expected status ${expectedStatus}, got ${response.status}`
    )
  }
  
  const contentType = response.headers.get('Content-Type')
  if (!contentType?.includes('application/json')) {
    throw new Error(
      `Expected Content-Type to include application/json, got ${contentType}`
    )
  }
}

/**
 * Create authorization header with bearer token
 */
export function createAuthHeader(token: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}
