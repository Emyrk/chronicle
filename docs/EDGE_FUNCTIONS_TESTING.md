# Edge Functions Testing - Quick Reference

## ✅ Setup Complete!

Your Supabase Edge Functions now have comprehensive unit testing support.

## 🚀 Quick Start

```bash
# Run all Edge Function tests
npm run test:edge

# Watch mode (auto-reruns on file changes)
npm run test:edge:watch

# Run both Next.js and Edge Function tests
npm run test:all
```

## 📚 What's Included

### 1. **Test Helpers** (`supabase/functions/_shared/test-helpers.ts`)
Reusable utilities for testing:
- `createMockRequest()` - Easy Request object creation
- `parseResponse()` - Extract JSON from responses
- `assertJsonResponse()` - Validate JSON responses
- `createAuthHeader()` - Authorization headers
- `mockEnv()` / `restoreEnv()` - Environment variables
- `createMockSupabaseClient()` - Mock Supabase client

### 2. **Example Functions**

#### Hello World (`supabase/functions/hello-world/`)
- Simple POST endpoint
- Basic validation
- Error handling
- **5 test cases** covering success and error scenarios

#### Complete Example (`supabase/functions/example-with-helpers/`)
- Full CRUD pattern with validation
- Email validation
- Auth header checking
- CORS handling
- **11 comprehensive test cases**

### 3. **Comprehensive Documentation**
See `supabase/functions/README.md` for:
- Writing test patterns
- Using test helpers
- Deno assertions guide
- Best practices
- Advanced patterns (Supabase client, env vars, CORS)
- CI/CD integration
- Debugging tips

## 📝 Writing Your First Test

```typescript
// supabase/functions/my-function/index.test.ts
import { assertEquals } from "jsr:@std/assert@1"
import { handler } from "./index.ts"
import { createMockRequest, createAuthHeader } from "../_shared/test-helpers.ts"

Deno.test("my-function", async (t) => {
  await t.step("should work correctly", async () => {
    const request = createMockRequest({
      headers: createAuthHeader("token"),
      body: { data: "test" }
    })

    const response = await handler(request)
    const data = await response.json()

    assertEquals(response.status, 200)
    assertEquals(data.success, true)
  })
})
```

## 🎯 Test Results

Current test status: **✅ All 16 tests passing**

- `hello-world`: 5 tests ✅
- `example-with-helpers`: 11 tests ✅

## 🔑 Key Points

1. **Edge Functions use Deno**, not Node.js
2. Tests run with Deno's native test framework
3. Always export your `handler` function for testing
4. Use test helpers to reduce boilerplate
5. Organize tests with `t.step()` for clarity
6. Test both success and error cases

## 📖 Next Steps

1. **Read the full guide**: `supabase/functions/README.md`
2. **Study the examples**: 
   - `hello-world/index.test.ts` - Basic patterns
   - `example-with-helpers/index.test.ts` - Advanced patterns
3. **Create your own function**: Use the examples as templates
4. **Run tests**: `npm run test:edge:watch` for live feedback

## 🐛 Common Issues

### Type checking errors with edge-runtime.d.ts
**Solution**: Tests use `--no-check` flag to skip type checking. This is fine for tests.

### GET/HEAD requests with body
**Solution**: The `createMockRequest()` helper automatically handles this.

### Missing assertions
**Solution**: Import from `jsr:@std/assert@1`:
```typescript
import { assertEquals, assertExists, assert } from "jsr:@std/assert@1"
```

## 🎓 Resources

- [Full Testing Guide](supabase/functions/README.md)
- [Deno Testing Docs](https://docs.deno.com/runtime/fundamentals/testing/)
- [Deno Assertions](https://jsr.io/@std/assert)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)

---

**Happy Testing! 🧪**
