# GitHub Actions Workflows

## PR Checks (`pr-checks.yml`)

Automated checks that run on every pull request to ensure code quality and functionality for the Next.js/TypeScript application.

## Go Checks (`go-checks.yml`)

Automated Go testing and linting that runs when Go code changes are detected.

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

---

## Go Checks Workflow Details

### Triggers

- **Pull Requests**: Runs on PRs targeting `main` or `develop` branches (only when Go files change)
- **Push**: Runs on direct pushes to `main` or `develop` branches (only when Go files change)
- **Manual**: Can be manually triggered via workflow_dispatch
- **Path Filters**: Only runs when `**.go`, `go.mod`, `go.sum`, or the workflow file itself changes

### Jobs

#### 1. **Lint (golangci-lint)** 🔍
- Runs comprehensive Go linting with golangci-lint
- Uses official `golangci/golangci-lint-action@v6`
- Shows only new issues on pull requests
- Caches Go modules for faster runs
- Configuration: `.golangci.yml`

#### 2. **Test (gotestsum)** 🧪
- Runs Go tests with race detection
- Uses `gotestsum` for better test output
- Generates JUnit XML report for test results
- Creates coverage report (`coverage.out`)
- Uploads test results and coverage as artifacts
- Shows coverage summary in GitHub step summary

#### 3. **Go Checks Summary** ✅
- Aggregates results from both lint and test jobs
- Single status check for branch protection rules
- Fails if any Go check fails

### Configuration Files

#### `.golangci.yml`
Configures 20+ linters including:
- Error checking (errcheck, gosec)
- Code quality (revive, stylecheck)
- Performance (prealloc, ineffassign)
- Complexity (gocyclo)
- Code duplication (dupl)
- And many more...

#### `Makefile`
Provides convenient commands for local development:
```bash
make install-tools  # Install gotestsum, golangci-lint, goimports
make test          # Run tests with gotestsum
make test-race     # Run tests with race detector
make lint          # Run golangci-lint
make lint-fix      # Auto-fix linting issues
make fmt           # Format code
make coverage      # Show coverage report
make coverage-html # Open coverage in browser
make ci            # Run all CI checks locally
```

### Local Testing (Go)

Before pushing Go code, run the same checks locally:

```bash
# Install required tools first
make install-tools

# Run all CI checks locally
make ci

# Or individually
make lint          # Linting only
make test          # Tests without race detector
make test-race     # Tests with race detector (same as CI)
make fmt           # Format code
```

### Branch Protection

Configure separate branch protection rules for Go and TypeScript:

1. **PR Checks Summary** - For Next.js/TypeScript code
2. **Go Checks Summary** - For Go code (if present)

Both are optional but recommended. The Go workflow only runs when Go files are present.

---

## Troubleshooting

### Next.js/TypeScript Issues

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

### Go Issues

**golangci-lint failing?**
- Run locally first: `make lint`
- Check `.golangci.yml` configuration
- Use `make lint-fix` to auto-fix some issues
- Disable specific linters if needed in config

**gotestsum tests failing?**
- Run locally first: `make test-race`
- Check for race conditions (common issue)
- Ensure `go.mod` is up to date
- Verify all dependencies are available

**Workflow not running?**
- Ensure you have a `go.mod` file in the repository
- Check that Go files are actually modified in your PR
- Workflow only runs when Go-related files change
