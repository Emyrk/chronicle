# Test Strategy

This project has multiple types of tests that run in different contexts:

## 1. Unit Tests (Vitest) ✅ Runs in CI

**Location:** `test/*.test.ts`
**Command:** `npm run test`
**Runner:** Vitest with jsdom

These are mocked unit tests that don't require any external services:
- `test/auth-flow.test.ts` - Authentication logic tests with mocked Supabase client

**CI:** These run in the GitHub Actions workflow on every PR.

## 2. Edge Function Unit Tests (Deno) ✅ Runs in CI

**Location:** `supabase/functions/**/*.test.ts`
**Command:** `npm run test:edge`
**Runner:** Deno test

These are Deno-native tests that test edge function handlers directly:
- `supabase/functions/hello-world/index.test.ts`
- `supabase/functions/example-with-helpers/index.test.ts`

**CI:** These run in a separate job with Deno runtime.

## 3. Integration Tests ⚠️ Manual Only

**Location:** `test/edge-functions/*.test.ts`
**Command:** Manual - requires `supabase start`
**Runner:** Vitest making HTTP requests

These tests make real HTTP calls to deployed edge functions:
- Require running Supabase locally (`supabase start`)
- Test the full HTTP request/response cycle
- **NOT included in CI** by design

**Why excluded from CI?**
- Requires Supabase services to be running (complex setup)
- Slower to execute (network calls)
- Better suited for manual testing or separate E2E pipeline

## Running Tests Locally

```bash
# Unit tests only (fast, no setup needed)
npm run test

# Edge function tests only (needs Deno)
npm run test:edge

# Integration tests (manual)
supabase start
npm run test -- test/edge-functions/

# All automated tests
npm run test:all  # Runs unit + edge tests
```

## CI Test Matrix

In GitHub Actions, the workflow runs:

1. **Vitest Job** → Unit tests (`test/*.test.ts`)
2. **Deno Job** → Edge function tests (`supabase/functions/**/*.test.ts`)

Integration tests are excluded and should be run manually during development.
