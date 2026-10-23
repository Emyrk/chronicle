---
name: inference-chat
description: Maintains Chronicle's permission-gated provider-neutral inference and chat system. Use when changing inference providers, OpenRouter OAuth, encrypted credentials, assistants, tools, prompts, durable threads, run lifecycle, AG-UI/SSE events, prompt debugging, AI account settings, model selection, or inference authorization.
---

# Inference chat

Maintain Chronicle's inference feature as one security-sensitive system spanning SpiceDB authorization, encrypted provider credentials, PostgreSQL persistence, the bounded agent runtime, AG-UI streaming, and React chat surfaces. Preserve the server as the authority: the browser selects approved options and renders events, but it never receives credentials, defines tools, or authorizes itself.

## Start here

Read `docs/inference-chat.md` before changing behavior. Then use this map to open only the relevant layer.

| Concern | Source of truth |
| --- | --- |
| Public HTTP request/response types | `api/chroniclesdk/inference.go` |
| API mounting and global permission middleware | `api/api.go` |
| SpiceDB schema and role mutation | `database/authz/policy/schema.zed`, `database/authz/zmethods.go` |
| Tables and lifecycle indexes | `database/migrations/000252_add_inference_persistence.up.sql`, `000253_harden_inference_run_lifecycle.up.sql` |
| sqlc queries | `database/queries/inference.sql` |
| Service configuration and credential cipher | `internal/services/serviceinference/service.go` |
| Account settings, OAuth, connections, models, threads | `internal/services/serviceinference/http.go` |
| Assistants, prompts, tools, run validation, agent loop | `internal/services/serviceinference/agent.go` |
| Provider-neutral contracts | `internal/services/serviceinference/contracts/types.go` |
| Provider registry | `internal/services/serviceinference/registry.go` |
| OpenRouter adapter | `internal/services/serviceinference/openrouter/` |
| AG-UI event and SSE framing | `internal/services/serviceinference/agui/` |
| Frontend API and permission hooks | `frontend/chronicle/src/features/chat/api.ts` |
| Request composition and durable-history mapping | `frontend/chronicle/src/features/chat/inference.ts` |
| SSE parser and event validation | `frontend/chronicle/src/features/chat/client.ts` |
| Event types and reducer | `frontend/chronicle/src/features/chat/protocol.ts` |
| Chat controller and UI shell | `useAssistantChat.ts`, `AssistantChat.tsx`, `ChatPanel.tsx` in the chat feature directory |
| Product integrations | `InferenceChats.tsx`, `InferenceSettings.tsx`, `useInferenceSelection.ts` |
| Prompt inspector | `DebugInspector.tsx` |

When SDK types change, regenerate:

```bash
go run -C ./scripts/apitypings main.go > frontend/chronicle/src/api/typesGenerated.ts
```

## Architecture

```text
account capability + user preference
  -> SpiceDB use_inference_chat permission
  -> authenticated /api/v1/inference routes
  -> owner-scoped connection/thread/run lookup
  -> decrypt provider credential on the backend
  -> compose bounded provider-neutral request
  -> provider adapter streams normalized events
  -> bounded agent loop executes allowlisted tools
  -> Chronicle emits AG-UI events over SSE
  -> frontend parser validates and reducer renders state
  -> durable messages/run status commit to PostgreSQL where applicable
```

The current assistants are deliberately different:

- `site-help` is ephemeral. The browser supplies bounded visible history on every run. Chronicle does not persist its messages.
- `instance-analyst` is durable. PostgreSQL is authoritative for history; each thread belongs to one user and one instance, and every instance operation rechecks `instance#view`.

A run may execute on any node. Do not introduce sticky-session assumptions or in-memory thread authority.

## Non-negotiable invariants

### Authorization

- `/api/v1/inference` requires authentication and `chronicle:chronicle#use_inference_chat` in `api/api.go`.
- `inference_available = inference_capable + administer`.
- `use_inference_chat = inference_available - inference_disabled`; the opt-out applies to administrators too.
- `/api/v1/me/inference` must remain outside the use-inference gate so opted-out users can read status and re-enable themselves.
- Only accounts with `inference_available` may mutate their own `inference_disabled` relation.
- Instance threads and tools must independently enforce `instance#view`; frontend visibility is not authorization.
- Debug access is separate: `debug_inference_chat = inference_debug_capable + administer`.
- A `debug: true` run must recheck debug permission in the backend before database lookup, credential decryption, run creation, or provider invocation.
- `inference_debug_capable` does not imply `inference_capable`. A normal non-admin debug user needs both roles to launch debug runs.

Regenerate policy bindings after changing `schema.zed` using the repository's normal authz generation flow, and update authorization tests.

### Credentials and OAuth

- Provider authorization uses OpenRouter PKCE. Store only a hash of OAuth state and an encrypted verifier with a short expiration.
- Store provider keys encrypted with AES-256-GCM using `internal/secrets.CredentialCipher`.
- Bind ciphertext to owner and purpose with `credentialAAD(userID, purpose)`. OAuth verifiers and provider credentials use different purposes.
- Decrypt provider credentials only for the outbound provider call. Never send them to the browser, log them, place them in AG-UI events, or retain them in provider implementations.
- Deleting a connection must erase encrypted credentials and provider-key hashes while retaining non-secret metadata required by historical run foreign keys. It does not revoke the generated OpenRouter key; users needing upstream revocation must remove it from OpenRouter too.
- A missing encryption key disables inference with `503` while allowing Chronicle to start. An invalid configured key must fail startup.
- Every replica must use the same encryption key. Changing or losing it makes stored credentials undecryptable and requires users to reconnect their provider accounts.
- The current key ID is `v1`; there is no online key rotation. Do not silently introduce a second key path without designing migration and rollback behavior.
- OAuth return paths must remain bounded local absolute paths. Reject external URLs, scheme-relative paths, backslashes, and CR/LF.

### Provider boundary

- Core code uses only `contracts.Provider`, normalized messages, tool definitions, stream events, finish reasons, and usage.
- Provider DTOs belong inside their adapter. Do not leak OpenRouter types into the service, SDK, database, or frontend.
- `credential []byte` is opaque and ephemeral. A provider may use it for the request but must not retain it.
- Model listings exposed by Chronicle include only models that support the capabilities the runtime requires, currently streaming and tools.
- Normalize partial tool-call deltas by stable provider index; IDs, names, and arguments may arrive in fragments.
- Preserve provider cancellation through the request context and propagate callback errors to abort the upstream stream.

### Agent runtime and tools

- Assistants are server-defined. System prompts and tool schemas are not supplied by the browser.
- Declare whether every assistant is durable. Keep durable request shape (`thread_id` plus one new message) distinct from ephemeral shape (bounded browser history and no thread).
- Tools are server allowlisted, bounded, and strictly decode JSON with unknown fields rejected.
- Keep read-only tools as the default. Ask before introducing mutations or materially broader data access.
- Tool code must reauthorize the resource it reads even when the thread was already authorized.
- Preserve current run bounds unless explicitly redesigning them: request size, history count/bytes, model iterations, tool count, tool argument/output sizes, and assistant text size.
- Do not store event-object references or provider-specific stream fragments as history. Persist completed provider-neutral messages and completed tool calls/results.
- Tool errors returned to the model must be bounded and generic. Do not expose internal errors, SQL details, credentials, or authorization internals.

### Persistence and run lifecycle

- Migrations are immutable. Add a new migration for every schema change and run `make gen/db` or `make gen`.
- Every connection, thread, message, and run lookup must be owner-scoped.
- Durable input message insertion and run creation are one transaction.
- Persist an assistant tool-call message and all corresponding tool-result messages together before the next provider iteration.
- Only one active durable run may exist per thread. Preserve the partial unique index and translate its violation into a conflict response.
- `run_id` is the per-user idempotency key. Reject reuse instead of replaying a prior stream.
- Runs have a lease. Expire stale running rows at startup and before creating a new run so crashes do not permanently wedge a thread.
- Finalization uses a short context derived with `context.WithoutCancel`; a browser disconnect must not leave a completed provider call stuck in `running`.
- Token usage and terminal status are persisted. SSE events and hidden reasoning are not.
- Bound durable history by both row count and bytes, reverse it into chronological order, and trim orphaned leading assistant/tool messages until history starts with a user message.

### AG-UI and frontend state

Chronicle owns a small AG-UI 1.0 subset over SSE:

- Run lifecycle: `RUN_STARTED`, `RUN_FINISHED`, `RUN_ERROR`
- Text: `TEXT_MESSAGE_START`, `TEXT_MESSAGE_CONTENT`, `TEXT_MESSAGE_END`
- Tools: `TOOL_CALL_START`, `TOOL_CALL_ARGS`, `TOOL_CALL_END`
- Authorized inspector: `DEBUG_SNAPSHOT`

For every event change, update these together:

1. Go event DTO and discriminator in `agui/events.go`.
2. SSE serialization tests in `agui/sse_test.go`.
3. Frontend discriminator, TypeScript interface, union, state, and reducer in `protocol.ts`.
4. Runtime structural validation in `client.ts`; validate nested fields, not only the top-level discriminator.
5. Parser and reducer tests.
6. Any UI consuming the event.

Preserve these ordering rules:

- Start text before emitting text deltas.
- Do not emit `TEXT_MESSAGE_END` until required persistence succeeds.
- Emit tool start/arguments while preparing execution and tool end after persisted tool results are available.
- A stream ending without a terminal run event is an error.
- Cancellation marks partial messages and tool calls interrupted in client state.
- The SSE parser must handle CRLF, multi-line data, arbitrary UTF-8 byte chunking, event IDs, and abort signals.

### Prompt inspector

- The frontend toggle is shown only after checking `debug_inference_chat`, but the backend permission check is the security boundary.
- Build `DEBUG_SNAPSHOT` from the exact provider-neutral messages and tools passed to the provider, not from a separately reconstructed approximation.
- Emit request snapshots before each provider call, tool-result snapshots after tool execution/persistence, and a response snapshot with final accumulated usage.
- Snapshots may contain prompts, visible history, tool arguments/results, schemas, selected model/context, limits, usage, and applied skill metadata.
- Snapshots are streamed only. Never persist them in messages, runs, metadata, or logs.
- Never include provider credentials, OAuth material, encryption keys/AAD, HTTP headers, raw provider events, or hidden provider reasoning.
- Until a real skill-composition layer exists, emit `skills: []` explicitly rather than inventing applied skills.

## Change checklists

### Add a provider

1. Implement `contracts.Provider` in a provider-specific directory.
2. Keep every provider request/response type inside that adapter.
3. Normalize model capabilities, text/tool deltas, finish reasons, usage, errors, and cancellation.
4. Add bounded HTTP behavior and tests with fake servers; do not call a real provider in PR tests.
5. Register the provider in `Service.Start` through `Registry`.
6. Design its authorization and credential lifecycle; do not reuse OpenRouter assumptions accidentally.
7. Add SDK/settings UI only after the backend owner and credential boundaries are established.
8. Test that secrets never appear in logs, errors, SSE, debug snapshots, or stored messages.

### Add or change an assistant

1. Define its stable ID, system prompt, persistence mode, and tool set in `agent.go`.
2. Choose ephemeral or durable history deliberately. A new durable context type needs owner-scoped creation/read routes and resource authorization.
3. Add server-side request-shape validation; do not accept both history modes.
4. Implement tools with strict bounded schemas, resource authorization, and bounded outputs.
5. Add the frontend request builder and product entry point behind `use_inference_chat`.
6. Ensure debug snapshots show the exact composed prompt, tools, context, limits, and future skills.
7. Test normal response, tool loop, invalid arguments, authorization failure, persistence failure, cancellation, limits, and stale-run recovery as relevant.

### Change prompts, tools, or skill composition

1. Treat the provider-neutral `ChatRequest` assembled immediately before `Provider.StreamChat` as the source of truth.
2. Keep composition deterministic and server-owned.
3. Update debug DTOs and inspector rendering if new composition metadata is required.
4. Represent applied skills explicitly with stable identity/version/source, prompt contribution, and contributed tools. Do not infer them in the frontend.
5. Verify request snapshots match the actual next provider request after every tool iteration.
6. Add adversarial tests for prompt/tool-output size, malformed JSON, unauthorized resource access, and secret leakage.

### Change persistence or lifecycle

1. Add a migration; never edit `000252` or `000253` after deployment.
2. Update `database/queries/inference.sql`, run generation, and keep `database.Store` usage through sqlc.
3. Preserve owner scoping, transactional message/run writes, active-run uniqueness, idempotency, leases, and detached finalization.
4. Estimate production migration cost before any update/scan of existing rows and warn before shipping a potentially blocking startup migration.
5. Add database-backed tests for constraints and rollback behavior.

### Change chat protocol or UI

1. Update Go events, TypeScript protocol, runtime validator, reducer, and UI as one contract.
2. Keep authorization hooks separate for normal inference and debugging.
3. Hide launchers when normal permission or service availability is absent; account settings must still explain status and permit re-enabling.
4. Preserve ephemeral full-history submission and durable one-new-message submission.
5. Keep model selection searchable by name, ID, and description; do not truncate the server catalog arbitrarily.
6. Run parser/reducer tests with malformed nested payloads and interrupted streams.

## Validation

Run the narrow checks first:

```bash
go test -race ./internal/services/serviceinference/...
golangci-lint run --build-tags azerothcore ./internal/services/serviceinference/... ./api/chroniclesdk/...

cd frontend/chronicle
pnpm exec vitest run \
  src/features/chat/api.test.ts \
  src/features/chat/client.test.ts \
  src/features/chat/inference.test.ts \
  src/features/chat/inferencePreference.test.ts \
  src/features/chat/ModelCombobox.test.ts \
  src/features/chat/protocol.test.ts
pnpm exec eslint src/features/chat
pnpm exec tsc --noEmit
```

When SDK types, database queries, or authorization bindings changed, regenerate first and verify generated diffs. Before finishing, run the applicable full checks:

```bash
make test
make lint
make build
```

Use the relevant server build tag instead of `azerothcore` when working on another server variant. Repository-wide lint can expose findings from outside the changed packages or neighboring worktrees. Still run targeted lint on every touched package/file, and report unrelated full-lint failures precisely rather than weakening checks.

## Common mistakes

- Gating the launcher in React but forgetting backend authorization.
- Placing `/api/v1/me/inference` behind `use_inference_chat`, making opt-out irreversible.
- Treating `inference_debug_capable` as normal inference capability.
- Loading a durable thread by ID without user ownership or instance authorization.
- Decrypting credentials before rejecting an unauthorized debug request.
- Passing provider DTOs through core contracts or persisting provider stream fragments.
- Emitting a successful text end before durable persistence succeeds.
- Persisting tool calls without their tool results, or exposing results before persistence.
- Reusing `run_id` as a resumable stream token; replay is not implemented.
- Removing leases or the one-running-run-per-thread constraint and allowing wedged or overlapping conversations.
- Recording raw errors, debug snapshots, credentials, or hidden reasoning.
- Reconstructing debug prompts in the browser instead of inspecting the server-composed request.
- Adding a tool that trusts thread authorization without checking the actual resource it queries.
- Letting an adapter retain `credential []byte` or call a real provider from tests.

## Self-check

Before finishing, verify:

- Which trust boundary changed: authorization, credentials, provider adapter, tools, persistence, protocol, or UI?
- Are normal permission, opt-out, debug permission, ownership, and resource checks still enforced at the backend?
- Can any secret or internal error reach logs, persistence, API JSON, SSE, or debug snapshots?
- Are ephemeral and durable request/history rules still distinct?
- Are run idempotency, leases, transactional writes, finalization, and active-run uniqueness intact?
- Do Go DTOs, generated TypeScript, parser validation, reducer state, and UI agree?
- Do debug snapshots describe the actual provider request and remain stream-only?
- Were targeted race tests, frontend protocol tests, lint, generation, and the applicable full build run?
