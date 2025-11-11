# GitHub Actions Workflows

## PR Checks (`pr-checks.yml`)

Automated checks that run on every pull request to ensure code quality and functionality.

### Triggers

- **Pull Requests**: Runs on PRs targeting `main` or `develop` branches
- **Manual**: Can be manually triggered via workflow_dispatch

### Jobs

The workflow runs 5 parallel jobs:

#### 1. **Lint** 🧹
- Runs ESLint to check code quality and style
- Command: `npm run lint`

#### 2. **Type Check** 📝
- Runs TypeScript compiler to verify type safety
- Command: `npx tsc --noEmit`

#### 3. **Test (Vitest)** 🧪
- Runs Vitest test suite for React components and utilities
- Uploads coverage reports as artifacts
- Command: `npm run test -- --run --reporter=verbose`

#### 4. **Test (Edge Functions)** ⚡
- Runs Deno tests for Supabase Edge Functions
- Uses Deno runtime for edge-compatible testing
- Command: `npm run test:edge`

#### 5. **Build** 🏗️
- Verifies the application builds successfully
- No environment variables needed (build-time only check)
- Command: `npm run build`

#### 6. **PR Checks Summary** ✅
- Aggregates results from all jobs
- Single status check for branch protection rules
- Fails if any job fails

### Features

- **Concurrency Control**: Cancels in-progress runs when new commits are pushed
- **Caching**: Uses npm cache to speed up dependency installation
- **Artifacts**: Saves test coverage reports for review

### Required Secrets

No secrets are required for this workflow to run! 🎉

The workflow only validates:
- Code quality (linting)
- Type safety (TypeScript)
- Test correctness (Vitest + Deno)
- Build success (Next.js compilation)

Runtime environment variables like `NEXT_PUBLIC_SUPABASE_URL` are only needed when the app actually runs, not during CI checks.

### Branch Protection

Configure branch protection rules to require the **PR Checks Summary** job to pass before merging:

1. Go to Repository Settings → Branches
2. Add branch protection rule for `main`
3. Enable "Require status checks to pass before merging"
4. Search for and select: **PR Checks Summary**

This ensures all linting, type checking, testing, and build checks pass before code can be merged.

### Local Testing

Before pushing, you can run the same checks locally:

```bash
# Run all checks
npm run lint
npx tsc --noEmit
npm run test:all      # Runs both Vitest and Edge Function tests
npm run build

# Or individually
npm run lint          # Linting only
npm test             # Vitest in watch mode
npm run test:edge    # Edge function tests only
npm run build        # Build check
```

### Troubleshooting

**Jobs failing?**
- Check the workflow run logs in the Actions tab
- Ensure all dependencies are properly listed in `package.json`
- Verify TypeScript configuration in `tsconfig.json`

**Build failing?**
- Ensure environment variables are properly configured
- Check that all imports are correctly typed
- Verify Next.js configuration in `next.config.js`

**Tests failing?**
- Run tests locally first: `npm test`
- Check test setup in `test/setup.ts`
- Ensure all test files follow naming convention: `*.test.ts(x)`
