# Inference chat architecture

Chronicle's inference service is a provider-neutral broker and bounded agent runtime. The browser never receives provider credentials and never calls a model provider directly.

## Scope

The initial provider is OpenRouter. The implementation supports two assistant modes:

- `site-help` is ephemeral. The browser sends a bounded conversation history with each run.
- `instance-analyst` is durable. PostgreSQL stores the owner-scoped thread and recent messages, and every operation rechecks `instance#view`.

A single HTTP request represents one run. PostgreSQL is authoritative for durable state, so subsequent turns may reach a different Chronicle node without sticky sessions.

## Authorization and credentials

Every route under `/api/v1/inference` requires authentication and the global `chronicle:chronicle#use_inference_chat` permission. Administrators implicitly have inference available; other users require the `inference_capable` role. Any user with inference available can self-assign the `inference_disabled` relation from account settings, and `use_inference_chat = inference_available - inference_disabled`, so opting out also applies to administrators. Instance chat additionally requires `instance:<id>#view` when creating, listing, reading, or running a thread. The self-service `/api/v1/me/inference` preference route remains available while opted out and when inference is not configured on the deployment, allowing the account settings page to always report status and restore the preference. Accounts without `inference_available` see a collapsed read-only status and cannot assign the opt-out relation until capability is granted.

OpenRouter authorization uses PKCE. Chronicle stores the short-lived verifier and resulting provider key encrypted with AES-256-GCM. Ciphertext is bound to its owner and purpose through associated data. Provider keys are decrypted only for the outbound provider request.

Configure the service with:

- `CHRONICLE_INFERENCE_CREDENTIAL_ENCRYPTION_KEY`: base64-encoded 32-byte encryption key.
- `CHRONICLE_INFERENCE_OPENROUTER_BASE_URL`: optional OpenRouter API override.
- `CHRONICLE_INFERENCE_OPENROUTER_AUTH_URL`: optional OpenRouter authorization override.
- `CHRONICLE_INFERENCE_ATTRIBUTION_TITLE`: optional provider attribution title.
- `CHRONICLE_INFERENCE_ATTRIBUTION_REFERER`: optional provider attribution URL.

The equivalent encryption-key flag is `--inference-credential-encryption-key`. When no encryption key is configured, inference routes return `503 Service Unavailable` and the rest of Chronicle starts normally. A configured but invalid key fails service startup.

> [!WARNING]
> The initial release supports one encryption key identified as `v1`; it does not yet provide online key rotation. Every replica must receive the same key, and changing or losing it requires users to reconnect their provider accounts. Back up the key under the production secret-recovery policy before enabling inference.

Disconnecting a provider connection immediately erases Chronicle's encrypted credential and account-key hash while retaining non-secret connection metadata needed by historical run rows. It does not currently revoke the generated key at OpenRouter, so users who need upstream revocation must also remove it from their OpenRouter account.

The separate `chronicle:chronicle#debug_inference_chat` permission is granted by the administrator-managed `inference_debug_capable` role or by `administer`. It is reserved for the prompt, tool, and future skill inspector; ordinary `inference_capable` users do not receive debug access.

## Streaming contract

The browser/backend contract is the Chronicle-owned subset of AG-UI 1.0 over server-sent events. Supported events are:

- `RUN_STARTED`, `RUN_FINISHED`, and `RUN_ERROR`
- `TEXT_MESSAGE_START`, `TEXT_MESSAGE_CONTENT`, and `TEXT_MESSAGE_END`
- `TOOL_CALL_START`, `TOOL_CALL_ARGS`, and `TOOL_CALL_END`
- `DEBUG_SNAPSHOT` when an authorized request sets `debug: true`
- `CLIENT_TOOL_REQUEST` when a server-defined browser tool pauses a durable run

The frontend client incrementally parses UTF-8 SSE frames and reduces these events into messages, tool-call state, and optional debug snapshots. Cancellation aborts the run request. Provider HTTP failures expose a bounded, credential-redacted provider message and stable error code; other internal failures remain generic. Authorization failures are terminal in the chat UI and are not retried automatically. Run finalization uses a detached, bounded context so an ordinary browser disconnect can still update the database. Durable threads reject overlapping active or client-tool-waiting runs, and a 15-minute lease marks abandoned runs terminal after a node crash or failed finalization.

Durable instance runs may advertise an optional client descriptor containing a bounded session ID and capability IDs, versions, scopes, and state revisions. Chronicle recognizes `instance-page` version `1` only when it is scoped to the thread's instance. The server then adds its own definitions for `inspect_instance_ui`, `query_panel`, and `update_instance_ui`; browser input never supplies tool descriptions or schemas. When the model calls one, Chronicle validates the arguments, atomically stores the assistant tool-call message and pending request, changes the same run to `awaiting_client_tool`, emits `CLIENT_TOOL_REQUEST`, and closes SSE without `RUN_FINISHED`.

The owning client continues the run with `POST /api/v1/inference/runs/{runID}/client-tools/{toolCallID}`. Continuation rechecks run, thread, connection, and `instance#view` ownership, matches the persisted client session, capability, scope, and revision, stores a bounded normalized tool result, and renews the run lease. Provider tool-call IDs are normalized to remain unique within the durable run because some provider routes reuse an ID on a later completion. Successful and stale-state results resume the provider loop from durable history. User rejection, unavailable capability, and client execution failure instead emit a deterministic assistant explanation and finish without another provider call, preventing an unavailable mutation from consuming the remaining agent iterations. A resumed exchange can pause again or emit `RUN_FINISHED`. This protocol has no in-memory waiter or node affinity. If the browser loses a continuation and the user explicitly submits a new message, Chronicle records a synthetic client error, abandons the waiting run, and starts the new run instead of leaving the thread blocked until lease expiry.

The frontend mounts a general `InferenceRuntimeProvider` and page components register capability handlers with it. Read-only tools execute automatically. View mutations require an inline approval in the chat (so it follows the chat into a popped-out window) unless the user enables the visible, memory-only YOLO toggle for the current browser session; YOLO resets on reload and is never an authorization boundary. The initial instance capability controls only the primary layout and current unsaved view. Participants following a live session have a read-only view; mutation attempts return a bounded explanation to the model, which is instructed not to retry unavailable or rejected mutations. UI inspection exposes a compile-time-complete catalog of every built-in panel with its human label, purpose, visibility, and query support so the model can choose panels by meaning rather than identifier alone. Panel queries return bounded normalized rows for Damage Done, Damage Taken, Healing Done, and Healing Taken panels whose worker results are ready.

Durable instance chat exposes a **New chat** action and a `/clear` command. Both clear the owner-scoped thread history after rejecting a currently running provider response; an orphaned client-tool wait is safely abandoned first. Assistant responses render as styled Markdown, including headings, lists, code blocks, and external links.

Accounts with inference debug permission can run `/debug` to request a provider-free preview of the current composed system prompt, bounded durable history, skills, tools, schemas, limits, model, and context. The endpoint rechecks thread and instance authorization and never loads provider credentials, creates a run, persists a message, or invokes the model provider. The command opens the prompt inspector, whose JSON download includes the preview.

Debug authorization is enforced again by the backend before connection lookup, credential decryption, run creation, or provider invocation; hiding the frontend toggle is not the security boundary. Each `DEBUG_SNAPSHOT` is generated from the provider-neutral request actually composed by the server and identifies its iteration and phase (`request`, `tool_results`, `client_tool_request`, or `response`). Snapshots include ordered messages, tool definitions and schemas, applied skills, runtime limits, context, model, and accumulated usage. The prompt inspector can download the current run's snapshots, client-tool requests, and visible transport error as JSON for diagnostics. Snapshots are streamed only and are never written to inference message or run records. Provider credentials, OAuth material, encryption data, HTTP headers, raw provider events, and hidden provider reasoning are excluded. Until skill composition is implemented, the server explicitly emits `skills: []`.

## Persistence and limits

The persistence model consists of connections, OAuth transactions, threads, messages, and runs. Run events are not stored in the MVP.

Server-enforced limits include:

- 256 KiB run request bodies.
- At most 50 messages in ephemeral history.
- At most the 50 most recent durable messages, additionally bounded to 256 KiB and trimmed to begin at a user message.
- Five model iterations and ten tool calls per run.
- 16 KiB tool arguments, 64 KiB tool output, and 256 KiB assistant text.

The runtime stores token usage and terminal run status. It does not persist hidden reasoning. Reconnect/replay of interrupted SSE output and managed Chronicle credits are intentionally outside the initial scope.

## Tools

Tools are server-defined, allowlisted, and strictly decode bounded JSON arguments.

`site-help` can list and search known Chronicle pages and issue bounded ranking queries. `instance-analyst` can request a bounded instance summary containing metadata, encounters, and roster information. It does not receive raw combat-event streams.

## Extension points

Provider adapters implement the interfaces in `internal/services/serviceinference/contracts`. New providers should preserve the credential boundary and return provider-neutral streaming events. New assistants should declare persistence explicitly, keep tools bounded and read-only by default, and enforce resource authorization independently of frontend visibility.

The chat renders as a non-modal floating window so the site stays usable underneath. It can be minimized to its launcher bubble (the conversation stays mounted), expanded to full height, or popped out into a separate browser window. Pop-out reuses the EventsPanel popup approach in `panelPopup.ts`: the chat is portaled into the popup document, so the controller, runtime, and registered client-tool capabilities stay shared with the page. Closing the popup docks the chat back into the page. `useChatWindow` owns this state in the parent so remounting the chat (for example, when the instance thread id resolves) does not close the popup.
