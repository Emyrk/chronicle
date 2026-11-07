You are an experienced, pragmatic software engineering AI agent. Do not over-engineer a solution when a simple one is possible. Keep edits minimal. If you want an exception to ANY rule, you MUST stop and get permission first.

# Chronicle – Agent Contribution Guide

## Project Overview

Chronicle is a **game-play performance analysis tool for Classic World of Warcraft**, specifically targeting the Turtle WoW server. It transforms combat logs into accessible insights for raid leaders, tracking damage, healing, and other raid metrics.

### Technology Stack

| Layer     | Technology                                     |
| --------- |------------------------------------------------|
| Backend   | Go 1.25+                                       |
| Frontend  | React 19 + TypeScript + Vite + Tailwind CSS v4 |
| Database  | PostgreSQL 17 (via pgx/v5)                     |
| ORM/Query | sqlc (code generation from SQL)                |
| Router    | go-chi/chi                                     |
| Auth      | OAuth (Discord) + JWT sessions                 |
| Queue     | River (PostgreSQL-based job queue)             |
| Package   | pnpm (frontend)                                |
| Hosting   | Railway                                        |

## Reference

### Important Directories

```
cmd/
├── chronicle/      # CLI tool
├── chronicled/     # Main server daemon
└── wasm/           # WebAssembly build for browser parsing

api/
├── api.go          # API router and initialization
├── chronauth/      # Authentication (OAuth, sessions, JWT)
├── chroniclesdk/   # SDK types (used for TypeScript generation)
├── httpapi/        # HTTP response helpers (Write, Read, InternalServerError)
├── httpmw/         # HTTP middleware (auth, recovery, prometheus)
└── db2sdk/         # Database model to SDK conversion

chronicle/          # Core business logic (log parsing queue, uploads)
combatlog/          # Combat log parsing engine (vanilla WoW format)
database/
├── migrations/     # SQL migration files (numbered)
├── queries/        # Raw SQL queries for sqlc
├── dbtestutil/     # Test helpers (Postgres in Docker)
├── pubsub/         # PostgreSQL LISTEN/NOTIFY wrapper
└── storage/        # Object storage interface

frontend/chronicle/ # React frontend (Vite project)
internal/           # Shared utilities (testutil, cryptorand, etc.)
```

### Key Files

- `api/api.go` – API routes definition, middleware setup
- `chronicle/chronicle.go` – Core Chronicle service (uploads, parsing)
- `database/sqlc.yaml` – sqlc configuration
- `database/generate.sh` – Custom sqlc output merging script
- `docs/spell-data-formats.md`: required context before changing spell parsing, storage, conversion, or API behavior
- `Makefile` – Primary build/dev commands

When spell golden fields or semantics change, run `make update-spell-goldens`
(or `go test ./database/gamedb/chrondbc -run '^TestLegacySpellGoldenParity$' -update`),
then review and commit the golden TSV diffs. The `-update` flag regenerates golden
values; do not pass it to `go test ./...`.

## Internal Go service boundaries

Use `internal/services/service<domain>` to keep business capabilities out of transport packages and prevent large feature areas from accumulating in `api` or another unrelated package.

### Create or extract a service when

These are design signals, not a checklist. Prefer the smallest cohesive boundary that has clear ownership.

- The code represents a named product or infrastructure capability with its own vocabulary and invariants.
- It orchestrates several queries, caches, workers, external clients, or other services.
- More than one transport or caller may need the capability.
- The feature needs an explicit lifecycle, configuration, dependency ordering, or process-owned state.
- Keeping it in the current package would make that package own both transport concerns and business decisions.

Do not create a service only to hold a pure helper, one small handler, shared types, or a thin database-query wrapper. Keep those near their caller until a real capability boundary appears.

### Boundary rules

- Transport packages such as `api` own HTTP parsing, authentication middleware, response formatting, and narrow route wiring. Services own business decisions and orchestration.
- A service must not import its transport adapter. For example, `internal/services/servicefoo` must not import `api`; define a narrow interface in the caller or move shared contracts to a lower-level package.
- Pass dependencies explicitly through an `Options` struct or constructor. Do not reach through another service's private fields or use package globals as a service locator.
- Expose the smallest useful API. Prefer capability methods or a narrow provider interface over exporting the service's storage, caches, or implementation types.
- Keep service-owned tests with the service. Leave adapter contract and wiring tests in the transport package.
- Preserve optional-feature behavior at the boundary. If a dependency or integration is optional, define and test the disabled behavior instead of spreading nil/config checks through callers.
- Avoid grab-bag services. If the proposed package name is vague, or its responsibilities cannot be described in one sentence, refine the boundary before adding it.

### Plain service object versus broker-managed service

Start with a plain constructed object when the capability only needs dependencies and methods. Make it a broker-managed `services.Servicer` only when it needs startup or shutdown work, CLI/environment options, dependency ordering, background workers, or independent process-level ownership.

For a broker-managed service:

1. Add a stable name in `internal/services/servicenames.go`.
2. Declare `DependsOn` and `Configures` edges without creating cycles.
3. Register it in the server composition root.
4. Keep `Start` bounded and return only after the service is ready.
5. Make `Close` honor cancellation and release owned workers or resources.

Before implementing an extraction, state what the service owns, what remains with the caller, and the narrow interface between them. Treat that boundary as an architectural decision and get user approval when it is not already explicit in the request.

## Open Graph card refactor

The generated OG card feature was originally merged as one large train spanning page metadata lookup, ranking aggregation, signed URL serialization, and the standalone renderer. Preserve the shipped behavior while splitting that layout into smaller, reviewable responsibilities.

- Treat commit `f1c4e8368` as the behavioral baseline for this refactor. The stack's restoration commit reproduces that tree before preview tooling or refactors.
- Open Graph metadata resolution, card selection, signing, and renderer-specific lookups belong in `internal/services/serviceog`; the `api` package only owns the narrow route-provider interface and frontend wiring.
- The generated-image renderer is optional. With no renderer URL or signing key, `serviceog` must preserve the pre-existing static metadata and skip generated-card lookups.
- The released Armory card is history-only. Keep the Character Performance renderer for design review, but do not select it until healing-versus-damage spec and metric selection is defined.
- Guild card logos may use Chronicle-hosted images or exact Discord guild-icon URLs under `https://cdn.discordapp.com/icons/`; reject other external hosts and normalize Discord WebP icons to PNG for the renderer.
- Guild cards must not include player lists or aggregate player scores until guild-level scoring is ready; the activity fallback shows only estimated raid nights.
- Generated OG cards and metadata must not display or serialize server/realm names; route URLs may still carry the realm identifier required for navigation.
- Refactors must preserve page metadata, card selection thresholds, and rendered query parameters unless the user explicitly approves a behavior change.
- Keep the Go signer and TypeScript verifier byte-compatible. Any signature change must update the shared vectors and both test suites together.
- Use `cd services/og && pnpm preview:links -- <url...>` to compare the actual metadata and image selected for real Chronicle links before and after a refactor.
- Record accepted OG design decisions in this section as they are finalized. Do not turn tentative refactor ideas into repository rules.
- The root CI does not cover `services/og`. Run its test, typecheck, and build commands directly for changes under that directory.

## Essential Commands

### Build

```bash
# Build full project (backend + frontend)
make build

# Build backend only
make build-backend

# Build frontend only
cd frontend/chronicle && pnpm build
```

### Development

```bash
# Start local dependencies first (Postgres on :5433, SpiceDB, OCR)
make services-up

# Start full dev server (backend on :4000, builds frontend)
make develop

# Start backend only without requiring frontend/dist assets
make develop-backend

# Start frontend dev server with hot reload (proxies to backend)
cd frontend/chronicle && pnpm dev
```

### Test

```bash
# Run all tests (requires Postgres, use docker or local)
make test

# Start Postgres in Docker for testing
make test-postgres-docker

# Create the chronicle database when using local Postgres client tools
make create-db
```

### Lint

```bash
# Go linting
make lint
# or directly:
golangci-lint run

# Frontend linting
cd frontend/chronicle && pnpm lint
```

### Code Generation

```bash
# Regenerate everything (database, WASM, TypeScript types)
make gen

# Database only (after changing migrations or queries)
make gen/db

# TypeScript API types from Go SDK
# (auto-runs via make gen)
go run -C ./scripts/apitypings main.go > frontend/chronicle/src/api/typesGenerated.ts
```

### Database Migrations

**Migrations are immutable once deployed.** Never edit an existing migration file — always create a new one. If you are unsure whether a migration has been deployed, ask the user before modifying it.

> [!CAUTION]
> **Production migrations run during service startup and block the service from becoming available.** Before adding a data migration that updates, deletes, rewrites, or scans an existing table, inspect production-scale row counts and relevant indexes, estimate the affected rows/WAL, and explicitly warn the user if it may delay startup or cause downtime. Get the user's approval before shipping a potentially slow migration.
>
> Avoid broad updates of large denormalized/history tables such as `encounter_dps_rankings`, `parse_score_memberships`, and `parse_score_results`. Scope updates to the exact cohort, use indexed predicates, and prefer batching, an offline/admin backfill, or recomputation when a startup transaction could touch a large number of rows. Include a preview/count query with the proposed migration so impact can be checked before deployment.

```bash
# Create a new migration
./database/migrations/create_migration.sh "description of migration"

# After creating migration, regenerate:
make gen
```

### Other Scripts

```bash
# Build WASM parser for browser
make wasm

# Serve WASM site locally
make serve
```

## Patterns

### HTTP Handlers

Use `httpapi.Write` for JSON responses and `httpapi.Read` for parsing request bodies:

```go
func (api *API) SomeHandler(w http.ResponseWriter, r *http.Request) {
    var req chroniclesdk.SomeRequest
    if !httpapi.Read(r.Context(), w, r, &req) {
        return // Read already wrote the error response
    }
    
    // ... process request ...
    
    httpapi.Write(r.Context(), w, http.StatusOK, chroniclesdk.SomeResponse{...})
}
```

### Authentication in Handlers

Retrieve authenticated user from context:

```go
func (api *API) ProtectedHandler(w http.ResponseWriter, r *http.Request) {
    claims := chronauth.MustAuthenticatedClaims(r.Context())
    userID := claims.UserID
    // ...
}
```

### Database Queries

1. Write SQL in `database/queries/*.sql`
2. Run `make gen/db`
3. Use generated methods via `database.Store` interface

### Testing with Database

Use `dbtestutil.NewDB(t)` for tests requiring Postgres:

```go
func TestSomething(t *testing.T) {
    t.Parallel()
    ctx := testutil.Context(t, testutil.WaitShort)
    
    db, pubsub := dbtestutil.NewDB(t)
    // db is a database.Store, pubsub is *pubsub.PGPubsub
}
```

### Test Context Helpers

Use `testutil.Context` with duration constants:

```go
ctx := testutil.Context(t, testutil.WaitShort)   // 10s
ctx := testutil.Context(t, testutil.WaitMedium)  // 15s
ctx := testutil.Context(t, testutil.WaitLong)    // 25s
```

### Adding EventsPanels

> **Full documentation:** See `frontend/chronicle/src/pages/Instance/EventsPanels/DESIGN.md` for architecture details.
> 
> **Sync Mode:** See `frontend/chronicle/src/pages/Instance/SYNC_MODE.md` for the video synchronization feature (experimental, `?exp=1`).

EventsPanels process combat log event streams and aggregate them into displayable metrics. Processing runs in a Web Worker to keep UI responsive.

#### Architecture Overview

```
Processor (worker-safe)     +     Panel (React wrapper)
─────────────────────────         ────────────────────────
processors/foo.processor.ts       FooPanel/Foo.tsx
- id, streams, createState        - label, icon
- processEvent()                  - render()
                                  - spreads processor props
```

**Data Flow:**
1. `usePanelAggregation` fetches required streams from `InstanceEventsContext` (cached)
2. Streams + context are sent to Web Worker via `postMessage`
3. Worker iterates events, calls `processor.processEvent()`
4. Worker returns serialized result (Maps become arrays with markers)
5. Hook deserializes result and triggers re-render

#### Checklist for Adding a New Panel

1. **Create the processor** (`processors/myPanel.processor.ts` or `MyPanel/myPanel.processor.ts`)
   - Export a `PanelProcessor<TResult, TEvent>` object
   - Must be pure TypeScript (NO React, NO JSX) - runs in Web Worker
   - Define `id`, `streams`, `createState()`, `processEvent()`

2. **Register the processor** in `processors/index.ts`
   - Add to imports and exports
   - Add to `processorRegistry` object

3. **Create the panel component** (`MyPanel/MyPanel.tsx`)
   - Import and spread processor properties
   - Add `label`, `icon`, optional `supportsPerSecond`
   - Implement `render()` function

4. **Add to PANELS registry** in `EventsPanel.tsx`
   - This defines `EventsPanelType` - TypeScript enforces steps 5 and 6

5. **Add to PANEL_CODES** in `frontend/chronicle/src/hooks/useUrlState.ts`
   - TypeScript will error if missing (enforced via `Record<PanelType, string>`)

6. **Add to PANEL_CATEGORIES** in `PanelSelector.tsx`
   - Add to existing category or create new one

#### Key Types

```typescript
// Processor (worker-safe, no React)
interface PanelProcessor<TResult, TEvent = ProcessorEvent> {
  id: string;
  streams: StreamType[];  // "damage" | "heal" | "resource_change" | "slain" | "cast" | "aura" | "extra_attack"
  createState: () => TResult;
  processEvent: (state: TResult, event: TEvent, encounterID: string, 
                 firstTimestamp: Date, streamType: StreamType, context: ProcessorContext) => void;
}

// Panel (React wrapper)
interface PanelDefinition<TResult> extends PanelProcessor<TResult> {
  label: string;
  icon: React.ReactNode;
  supportsPerSecond?: boolean;
  checkboxLabel?: string;
  selfManagesAggregation?: boolean;  // For custom pagination/loading
  render: (props: PanelRenderProps<TResult>) => React.ReactNode;
}
```

#### Caching Behavior

| What | Cached Where | Lifetime |
|------|--------------|----------|
| Raw stream data (`Uint8Array`) | `InstanceEventsContext` | Until instance changes |
| Decoded events | Never cached | Re-decoded per worker request |
| Aggregated results | React state | Until context/panel changes |

**Stream caching:** Multiple panels requesting the same stream type share cached data. Fetch happens once per stream per instance.

**Result caching:** Each panel's aggregated result is stored in React state. When context changes (encounters, entity selection), the worker re-processes all events. The `onContextChange` callback (if defined) can return `'rerender'` to skip reprocessing for display-only changes.

#### Simple Example: Empty Panel

```typescript
// empty.processor.ts
export const emptyProcessor: PanelProcessor<EmptyResult> = {
  id: "empty",
  streams: [],  // No streams needed
  createState: () => ({}),
  processEvent: () => {},  // No-op
};

// Empty.tsx
export function createEmptyPanel(): PanelDefinition<EmptyResult> {
  return {
    ...emptyProcessor,
    label: "Empty",
    icon: <Square className="h-4 w-4" />,
    render: () => <div>Select a panel type</div>,
  };
}
```

#### Complex Example: Damage Done

```typescript
// damageDone.processor.ts
export const damageDoneProcessor: PanelProcessor<DamageDoneResult, DamageProcessorEvent> = {
  id: "damage_done",
  streams: ["damage"],
  createState: () => ({
    EncounterDamage: new Map(),
    ByAbility: new Map(),
    ByTarget: new Map(),
    GuidCache: createGuidCache(),
  }),
  processEvent: (state, event, encounterID, _, _streamType, context) => {
    // Filter by player GUIDs, accumulate damage...
    // Use context.entitySelection for filtering
    // Use context.players for name lookups
  },
};

// DamageDone.tsx
export function createDamageDonePanel(sourceType: DamageSourceType): PanelDefinition<DamageDoneResult> {
  return {
    ...damageDoneProcessor,
    label: "Damage Done",
    icon: <Swords className="h-4 w-4" />,
    supportsPerSecond: true,
    render: (props) => <DamageDoneContent {...props} sourceType={sourceType} />,
  };
}
```

#### Event Types (ProcessorEvent)

```typescript
type ProcessorEvent = 
  | DamageProcessorEvent    // damage stream
  | HealProcessorEvent      // heal stream
  | ResourceChangeProcessorEvent  // resource_change stream
  | ExtraAttackProcessorEvent     // extra_attack stream
  | SlainProcessorEvent     // slain stream (deaths)
  | CastProcessorEvent      // cast stream
  | AuraProcessorEvent;     // aura stream (buffs/debuffs)
```

#### Performance Tips

- **Don't store event references** - the `event` object is reused; copy values if needed
- **Use `GuidCache`** for repeated GUID parsing (see `processors/guidCache.ts`)
- **Filter early** - check `context.entitySelection` and `context.selectedEncounterIds` before expensive work
- **Breakout data is optional** - only compute ability/target breakouts when entity is selected

## Anti-Patterns

### Do Not

- **Don't bypass sqlc** – All database queries should go through `database/queries/*.sql` and be generated. Don't write raw SQL in Go code.
- **Don't hold pubsub locks while calling pgListener** – See comments in `database/pubsub/pubsub.go` about deadlock risks.
- **Don't use `http.Error` directly in handlers** – Use `httpapi.Write` or `httpapi.InternalServerError` to maintain consistent JSON responses.
- **Don't skip `t.Parallel()`** – Tests should be parallelizable unless there's a specific reason.

### Linter Exclusions

Some paths are excluded from linting (see `.golangci.yml`):
- `cmd/wasm/main.go` – WASM-specific code
- `database/gen/dump/*` – Generated dump logic
- `database/dbtestutil/*` – Test utilities
- `combatlog/parser/regexs/compiled/` – Generated regex code

## Code Style

- **Indentation**: 2 spaces (see `.editorconfig`), except Makefile uses tabs
- **Go**: Standard `gofmt` formatting; uses `goimports`
- **Frontend**: ESLint configured in `frontend/chronicle/eslint.config.js`
- **Scrollable UI**: Apply the shared `styled-scrollbar` class to user-facing scroll containers instead of leaving browser-default scrollbars.

## Commit and Pull Request Guidelines

### Before Committing

1. **Lint**: `make lint` must pass
2. **Test**: `make test` must pass (requires Postgres)
3. **Generate**: If you changed migrations, queries, or SDK types, run `make gen`
4. **Build**: `make build` should succeed

### Commit Messages

Follow lowercase `type: message` format (based on git history):

```
feat: add raid log parsing
fix: handle missing player data
chore: update dependencies
```

Types: `feat`, `fix`, `chore`, `refactor`, `docs`, `test`

### Pull Requests

- Target `main` or `develop` branch
- CI runs lint and tests automatically
- Ensure all checks pass before requesting review
