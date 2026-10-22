# Inference chat architecture

Chronicle's inference service is a provider-neutral broker and bounded agent runtime. The browser never receives provider credentials and never calls a model provider directly.

## Scope

The initial provider is OpenRouter. The implementation supports two assistant modes:

- `site-help` is ephemeral. The browser sends a bounded conversation history with each run.
- `instance-analyst` is durable. PostgreSQL stores the owner-scoped thread and recent messages, and every operation rechecks `instance#view`.

A single HTTP request represents one run. PostgreSQL is authoritative for durable state, so subsequent turns may reach a different Chronicle node without sticky sessions.

## Authorization and credentials

Every route under `/api/v1/inference` requires authentication and the global `chronicle:chronicle#use_inference_chat` permission. Administrators implicitly receive the permission; other users require the `inference_chat_capable` role. Instance chat also requires `instance:<id>#view` when creating, listing, reading, or running a thread.

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

## Streaming contract

The browser/backend contract is the Chronicle-owned subset of AG-UI 1.0 over server-sent events. Supported events are:

- `RUN_STARTED`, `RUN_FINISHED`, and `RUN_ERROR`
- `TEXT_MESSAGE_START`, `TEXT_MESSAGE_CONTENT`, and `TEXT_MESSAGE_END`
- `TOOL_CALL_START`, `TOOL_CALL_ARGS`, and `TOOL_CALL_END`

The frontend client incrementally parses UTF-8 SSE frames and reduces these events into messages and tool-call state. Cancellation aborts the run request. Run finalization uses a detached, bounded context so an ordinary browser disconnect can still update the database. Durable threads reject overlapping active runs, and a 15-minute lease marks abandoned runs terminal after a node crash or failed finalization.

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
