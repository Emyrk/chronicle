# Supabase Edge Functions Testing Guide

## 🧪 Testing Your Edge Functions

Edge Functions run on Deno, so they use **Deno's native testing framework** (not Vitest/Jest).

## Quick Start

### Run Tests

```bash
# Run all Edge Function tests
npm run test:edge

# Watch mode (re-runs on file changes)
npm run test:edge:watch

# Run specific function test
deno test --allow-env --allow-net supabase/functions/hello-world/index.test.ts

# Run all tests (Next.js + Edge Functions)
npm run test:all
```

## 📁 Test Structure

Each Edge Function should have its test file in the same directory:

```
supabase/functions/
├── hello-world/
│   ├── index.ts          # Your function
│   ├── index.test.ts     # Tests for the function
│   └── deno.json         # Deno config
└── _shared/
    └── test-helpers.ts   # Shared test utilities
```

## ✍️ Writing Tests

### Basic Pattern

```typescript
// supabase/functions/my-function/index.test.ts
import { assertEquals } from "jsr:@std/assert@1"
import { handler } from "./index.ts"

Deno.test("my-function", async (t) => {
  
  await t.step("should do something", async () => {
    const request = new Request("http://localhost:8000", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: "test" }),
    })

    const response = await handler(request)
    const data = await response.json()

    assertEquals(response.status, 200)
    assertEquals(data.result, "expected")
  })
})
```

### Using Test Helpers

```typescript
import { assertEquals } from "jsr:@std/assert@1"
import { handler } from "./index.ts"
import { 
  createMockRequest, 
  parseResponse,
  assertJsonResponse,
  createAuthHeader 
} from "../_shared/test-helpers.ts"

Deno.test("authenticated function", async (t) => {
  
  await t.step("should work with auth token", async () => {
    const request = createMockRequest({
      headers: createAuthHeader("fake-token"),
      body: { action: "test" }
    })

    const response = await handler(request)
    
    assertJsonResponse(response, 200)
    const { data } = await parseResponse(response)
    
    assertEquals(data.success, true)
  })
})
```

## 🔨 Test Helper Functions

Available in `supabase/functions/_shared/test-helpers.ts`:

### `createMockRequest(options)`
Create test Request objects easily:

```typescript
const request = createMockRequest({
  method: 'GET',
  headers: { 'Authorization': 'Bearer token' },
  body: { name: "test" },
  url: 'http://localhost:8000/endpoint'
})
```

### `parseResponse(response)`
Extract JSON data from responses:

```typescript
const response = await handler(request)
const { data, response: originalResponse } = await parseResponse(response)
```

### `assertJsonResponse(response, expectedStatus?)`
Verify response is valid JSON with expected status:

```typescript
const response = await handler(request)
assertJsonResponse(response, 200) // Throws if not 200 or not JSON
```

### `createAuthHeader(token)`
Create authorization headers:

```typescript
const headers = createAuthHeader("my-jwt-token")
// { 'Authorization': 'Bearer my-jwt-token', 'Content-Type': 'application/json' }
```

### `mockEnv(vars)` & `restoreEnv(keys)`
Mock environment variables:

```typescript
Deno.test("with env vars", async (t) => {
  mockEnv({ 'API_KEY': 'test-key' })
  
  await t.step("test with env", async () => {
    // test code
  })
  
  restoreEnv(['API_KEY'])
})
```

## 📊 Deno Test Assertions

Import from `jsr:@std/assert@1`:

```typescript
import {
  assertEquals,      // Strict equality
  assertNotEquals,   // Not equal
  assertExists,      // Not null/undefined
  assert,            // Truthy
  assertMatch,       // Regex match
  assertThrows,      // Throws error
  assertRejects,     // Async throws
} from "jsr:@std/assert@1"
```

### Common Patterns

```typescript
// Status codes
assertEquals(response.status, 200)

// JSON structure
const data = await response.json()
assertEquals(data.message, "Success")
assertExists(data.id)

// Headers
assertEquals(response.headers.get("Content-Type"), "application/json")

// Error handling
await assertRejects(
  async () => await handler(badRequest),
  Error,
  "Expected error message"
)
```

## 🎯 Testing Best Practices

### 1. Export Your Handler

```typescript
// index.ts - Always export handler for testing
export const handler = async (req: Request): Promise<Response> => {
  // Your logic
}

Deno.serve(handler) // This runs in production
```

### 2. Use Test Steps for Organization

```typescript
Deno.test("user registration", async (t) => {
  await t.step("should create new user", async () => { /* ... */ })
  await t.step("should reject duplicate email", async () => { /* ... */ })
  await t.step("should validate email format", async () => { /* ... */ })
})
```

### 3. Test Error Cases

```typescript
await t.step("should return 400 for missing data", async () => {
  const request = createMockRequest({ body: {} })
  const response = await handler(request)
  
  assertEquals(response.status, 400)
  const data = await response.json()
  assertExists(data.error)
})
```

### 4. Mock External Dependencies

```typescript
// For functions that call Supabase
import { createMockSupabaseClient } from "../_shared/test-helpers.ts"

Deno.test("with database", async (t) => {
  const mockSupabase = createMockSupabaseClient()
  
  // Override specific methods as needed
  mockSupabase.from = (table: string) => ({
    select: () => Promise.resolve({ 
      data: [{ id: 1, name: "Test" }], 
      error: null 
    })
  })
  
  // Test with mock
})
```

## 🚀 Advanced Patterns

### Testing with Supabase Client

```typescript
// For functions that use createClient()
import { createClient } from 'jsr:@supabase/supabase-js@2'

export const handler = async (req: Request): Promise<Response> => {
  const authHeader = req.headers.get('Authorization')!
  const token = authHeader.replace('Bearer ', '')
  
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } }
  )
  
  // Use supabase client
}

// In tests, set env vars
import { mockEnv, restoreEnv } from "../_shared/test-helpers.ts"

Deno.test("function with supabase", async (t) => {
  mockEnv({
    'SUPABASE_URL': 'http://localhost:54321',
    'SUPABASE_ANON_KEY': 'test-key'
  })
  
  await t.step("test with real local Supabase", async () => {
    // Your test - will connect to local Supabase
  })
  
  restoreEnv(['SUPABASE_URL', 'SUPABASE_ANON_KEY'])
})
```

### Testing CORS Headers

```typescript
await t.step("should include CORS headers", async () => {
  const request = createMockRequest({
    method: 'OPTIONS',
    headers: { 'Origin': 'http://localhost:3000' }
  })
  
  const response = await handler(request)
  
  assertEquals(response.status, 204)
  assertEquals(
    response.headers.get('Access-Control-Allow-Origin'), 
    '*'
  )
})
```

## 🔄 CI/CD Integration

Add to your GitHub Actions workflow:

```yaml
# .github/workflows/test.yml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
      
      # Test Next.js app
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm test
      
      # Test Edge Functions
      - uses: denoland/setup-deno@v1
        with:
          deno-version: v1.x
      - run: npm run test:edge
```

## 📚 Example Functions to Test

### GET Request Handler

```typescript
export const handler = async (req: Request): Promise<Response> => {
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  
  if (!id) {
    return new Response(
      JSON.stringify({ error: 'ID required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }
  
  // Fetch and return data
  return new Response(
    JSON.stringify({ id, data: 'example' }),
    { headers: { 'Content-Type': 'application/json' } }
  )
}

// Test it
Deno.test("GET handler", async (t) => {
  await t.step("should require id parameter", async () => {
    const request = new Request("http://localhost:8000", { method: "GET" })
    const response = await handler(request)
    assertEquals(response.status, 400)
  })
  
  await t.step("should return data with valid id", async () => {
    const request = new Request("http://localhost:8000?id=123", { method: "GET" })
    const response = await handler(request)
    const data = await response.json()
    assertEquals(response.status, 200)
    assertEquals(data.id, "123")
  })
})
```

## 🐛 Debugging Tests

```bash
# Run with verbose output
deno test --allow-env --allow-net supabase/functions/**/*.test.ts -- --verbose

# Filter specific tests
deno test --allow-env --allow-net supabase/functions/**/*.test.ts --filter "should return greeting"

# Show console.log output
deno test --allow-env --allow-net supabase/functions/**/*.test.ts -- --trace
```

## 📖 Resources

- [Deno Testing Documentation](https://docs.deno.com/runtime/fundamentals/testing/)
- [Deno Assertions](https://jsr.io/@std/assert)
- [Supabase Edge Functions Guide](https://supabase.com/docs/guides/functions)
- [Edge Runtime API Reference](https://supabase.com/docs/guides/functions/runtime-api)
See example here: https://github.com/supabase/supabase/tree/master/examples/edge-functions/supabase/functions