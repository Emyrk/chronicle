---
description: "Use when modifying Chronicle backend Go code, API handlers, database queries, migrations, or generated SDK/database types. Covers sqlc usage, handler patterns, testing, and regeneration steps."
name: "Chronicle Backend Conventions"
applyTo:
  - "api/**/*.go"
  - "chronicle/**/*.go"
  - "database/**/*.go"
  - "internal/**/*.go"
  - "cmd/**/*.go"
---

# Chronicle Backend Conventions

- Keep changes minimal and avoid over-engineering. If a simple local fix works, prefer it.
- Do not write raw SQL in Go code. Add queries under `database/queries/*.sql`, regenerate sqlc outputs, and use the generated store methods.
- In HTTP handlers, use `httpapi.Read`, `httpapi.Write`, and `httpapi.InternalServerError` instead of `http.Error` or ad hoc JSON handling.
- Read authenticated user data from context with `chronauth.MustAuthenticatedClaims` when a handler requires auth.
- For database-backed tests, prefer `dbtestutil.NewDB(t)` and create contexts with `testutil.Context` using the repo wait constants.
- Mark tests with `t.Parallel()` unless the test has a concrete reason not to.
- If you change migrations, SQL queries, or SDK-generated API types, remember to run the matching generation step before finishing: `make gen`, `make gen/db`, or the API typings generator described in `AGENTS.md`.
- Preserve existing package structure and styles. Avoid adding new abstractions unless the current design forces it.