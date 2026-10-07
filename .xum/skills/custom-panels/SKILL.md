---
name: custom-panels
description: Maintains Chronicle's trusted custom-panel platform and published panel SDK. Use when changing custom-panel manifests, resolution or installation, host APIs, artifact verification, account settings, event-stream decoding, protobuf exports, SDK releases, or the reference plugin contract.
---

# Custom panels

Maintain the public SDK, server resolver, browser host, account-scoped installation state, and external author contract as one versioned system. Custom panels execute trusted JavaScript in Chronicle's page; preserve the security and compatibility boundaries below.

## Start here

Read only the layer relevant to the change, then follow the matching checklist.

| Layer | Source of truth |
| --- | --- |
| Public TypeScript contract | `frontend/chronicle-panel-sdk/src/v1/contracts.ts` |
| Event framing decoder | `frontend/chronicle-panel-sdk/src/v1/eventStream.ts` |
| Public protobuf binding | `frontend/chronicle-panel-sdk/src/v1/protobuf/chronicle_pb.ts` |
| Canonical protobuf source | `api/chronicleproto/chronicle.proto` |
| Server manifest and resolver contract | `api/chroniclesdk/custom_panel.go`, `api/custompanelapi/handler.go` |
| Account settings API | `api/custom_panel_settings.go`, `database/queries/custom_panel_settings.sql` |
| Browser installation/runtime | `frontend/chronicle/src/pages/Instance/EventsPanels/custom/` |
| Panel selection integration | `frontend/chronicle/src/pages/Instance/EventsPanels/EventsPanel.tsx`, `PanelSelector.tsx` |
| User and author documentation | `frontend/chronicle/src/pages/Tools/CustomPanelsPage.tsx` |
| SDK package/release | `frontend/chronicle-panel-sdk/package.json`, `.github/workflows/release-panel-sdk.yml` |
| Reference implementation | `https://github.com/Emyrk/chronicle-panel` |

`frontend/chronicle/src/pages/Instance/EventsPanels/custom/pluginTypes.ts` is intentionally only a compatibility re-export. Do not recreate a second application-local contract there.

## Architecture

```text
public GitHub repository + mutable ref
  -> server resolves full 40-character commit SHA
  -> server fetches and validates chronicle-panel.json only
  -> server returns canonical manifest hash and raw artifact URLs
  -> account stores the immutable installation record
  -> browser fetches artifact bytes with credentials omitted
  -> browser verifies exact size and SHA-256
  -> browser creates Blob URLs and imports the entry module
  -> host mounts the plugin in a ShadowRoot and owns its worker lifecycle
```

The server deliberately does not fetch artifact bytes. The browser deliberately does not trust URLs, manifest sizes, or hashes without verification.

## Non-negotiable invariants

- Custom panels are trusted code, not sandboxed code. A ShadowRoot isolates styles, not authority.
- Only public GitHub repositories are supported. Resolve mutable refs to immutable lowercase 40-character commit SHAs before installation.
- Keep GitHub requests bounded by host allowlists, redirect checks, timeouts, response limits, and rate limiting.
- Validate manifest paths as repository-relative paths. Reject traversal, absolute paths, backslashes, invalid hashes, oversized files, duplicate panel IDs, undeclared streams, and incompatible API versions.
- Hash the manifest using RFC 8785/JCS canonical JSON. Go and TypeScript must agree on the exact bytes.
- Fetch browser artifacts with `credentials: "omit"` and `referrerPolicy: "no-referrer"`; verify byte length and SHA-256 before Blob import.
- Keep `@bufbuild/protobuf` as an SDK peer dependency so the package and consumer use one structurally compatible runtime; pin the SDK development runtime to Chronicle's supported version.
- Keep entry and worker artifacts self-contained. Chronicle does not install dependencies or resolve runtime-relative imports for external repositories.
- Allow at most one host-managed worker per mounted panel. Terminate it during every cleanup path.
- Abort pending work, disconnect observers, cancel frames, call plugin `destroy()`, revoke Blob URLs at refcount zero, and remove plugin DOM on unmount.
- Do not let shared URLs install or enable code. Missing installations remain placeholders.
- Preserve `?safe=1` as a no-custom-code recovery path.
- Preserve legacy NUL-delimited custom-panel references while emitting the canonical JSON-safe colon form.
- Ask before breaking host API v1, manifest schema v1, or `chronicle-event-stream-v1`. Breaking changes require a new versioned entry point rather than silently changing `/v1`.

## Change checklists

### Change the host API or snapshot

1. Update `frontend/chronicle-panel-sdk/src/v1/contracts.ts` first.
2. Implement the contract in `CustomPanelHost.tsx` or the relevant broker.
3. Map Chronicle's internal models explicitly into public SDK shapes; do not expose internal React contexts or generated application types.
4. Update contract tests and runtime broker/host tests.
5. Update `CustomPanelsPage.tsx` and the SDK README.
6. Update and build `Emyrk/chronicle-panel` against the packed or published package.
7. Bump the SDK version when the public package must be released.

Keep these application-owned unless intentionally promoted into the public contract:

- React mounting and popup integration
- Account storage and resolver HTTP calls
- Artifact fetching and Blob URL caching
- Tenant-aware game-data requests
- Chronicle's internal event cache and worker pool

### Change the manifest or installation schema

1. Keep Go and TypeScript models aligned:
   - `api/chroniclesdk/custom_panel.go`
   - `frontend/chronicle-panel-sdk/src/v1/contracts.ts`
2. Update both validators:
   - server validation in `api/custompanelapi/handler.go`
   - client validation in SDK `isManifestV1()` / `isInstallationV1()`
3. Preserve canonical manifest hashing across languages.
4. Update account settings validation and tests if persisted installation fields change.
5. Treat deployed database migrations as immutable. Add a migration for storage changes.
6. Update the reference repository manifest and committed artifact metadata.

Do not add a field only to the frontend interface. The resolver response, stored installation, account API, registry, and browser verifier all consume the same release record.

### Add or change an event stream

1. Update the canonical proto and the backend event producer/stream mapping.
2. Add the stream name to `api/chroniclesdk/constants.go`, regenerate its enum helpers, and update `ChronicleStreamType` plus the SDK's known-stream validator:

```bash
go generate ./api/chroniclesdk
```

3. Run protobuf generation:

```bash
(cd api/chronicleproto && buf generate)
```

This intentionally generates both:

- `frontend/chronicle/src/api/proto/chronicle_pb.ts`
- `frontend/chronicle-panel-sdk/src/v1/protobuf/chronicle_pb.ts`

4. Copy the canonical source into the package:

```bash
cp api/chronicleproto/chronicle.proto frontend/chronicle-panel-sdk/proto/chronicle.proto
```

5. Verify snapshots:

```bash
pnpm --dir frontend/chronicle-panel-sdk run check:protobuf
```

6. Update `docs/external-api-event-streams.md`, package tests, host stream allowlists, and the reference panel if it consumes the stream.

The duplicated generated binding is intentional: Chronicle uses its application-local protobuf runtime, while external authors consume the package binding. The two generated files and the copied `.proto` must stay byte-identical to their canonical counterparts.

### Change artifact loading or module lifecycle

Review together:

- `pluginArtifacts.ts`: fetch, size/hash verification, cache/refcounts, Blob URL revocation
- `pluginModuleLoader.ts`: module import cache
- `CustomPanelHost.tsx`: mount/update/destroy and worker ownership
- `CustomPanelErrorBoundary.tsx`: per-panel containment
- `CustomEventsPanel.tsx`: placeholders, retry, disable, popup, safe mode

Add tests for failure and cleanup paths, not only successful loading. Important cases include aborts, digest mismatch, size mismatch, shared artifact leases, module rejection, repeated cleanup, popup teardown, and worker failure.

### Change installation or account state

Account state is authoritative after sign-in. Review:

- `pluginAccountStorage.ts`
- `api/custom_panel_settings.go`
- `database/queries/custom_panel_settings.sql`
- `pluginRegistry.ts`
- `pluginStorage.ts` for legacy/local recovery behavior

Preserve optimistic concurrency through `expected_revision`. Validate every installation read from storage or the API. Never execute a corrupt, disabled, missing, or incompatible installation.

### Release the SDK

1. Decide whether the public contract changed and choose the package version deliberately.
2. Run the SDK validation suite and inspect the tarball.
3. Merge the version bump to `main`; `.github/workflows/release-panel-sdk.yml` publishes only versions absent from npm.
4. Publishing uses npm trusted publishing through GitHub OIDC. Keep `contents: read` and `id-token: write`; do not reintroduce `NPM_TOKEN`.
5. The npm trusted-publisher configuration is tied to repository `Emyrk/chronicle` and workflow `release-panel-sdk.yml`. Coordinate npm settings before renaming or replacing that workflow.
6. After publication, update `Emyrk/chronicle-panel`, rebuild its self-contained `dist/` artifacts, and commit its manifest hashes and sizes with the source change.

## Validation

### SDK-only changes

```bash
pnpm --dir frontend/chronicle-panel-sdk install --frozen-lockfile
pnpm --dir frontend/chronicle-panel-sdk run check:protobuf
pnpm --dir frontend/chronicle-panel-sdk run typecheck
pnpm --dir frontend/chronicle-panel-sdk test
pnpm --dir frontend/chronicle-panel-sdk run build
(cd frontend/chronicle-panel-sdk && npm pack --dry-run)
```

### Browser runtime changes

Run the narrow custom-panel tests first, then the full frontend checks:

```bash
pnpm --dir frontend/chronicle install --frozen-lockfile
pnpm --dir frontend/chronicle exec vitest run --project unit src/pages/Instance/EventsPanels/custom
pnpm --dir frontend/chronicle lint
pnpm --dir frontend/chronicle test
pnpm --dir frontend/chronicle build
```

Repository-wide lint may expose unrelated existing findings. Always run targeted ESLint on touched files and report unrelated full-lint failures precisely.

### Server resolver/settings changes

```bash
go test ./api/custompanelapi
go test ./api -run 'CustomPanel'
```

Run database-backed custom-panel tests when queries or persistence change. Start the test Postgres service if required.

### Cross-repository compatibility

Before declaring a public-contract change complete, install the packed or published SDK in `Emyrk/chronicle-panel` and run:

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
```

Confirm `dist/panel.js` and `dist/worker.js` have no unresolved external imports, and confirm every manifest artifact's size and SHA-256 match the committed bytes.

## Common mistakes

- Editing the compatibility re-export instead of the SDK source of truth.
- Updating Go manifest types without updating TypeScript validators, or vice versa.
- Generating only Chronicle's protobuf binding and leaving the package binding stale.
- Copying an internal Chronicle type into the public snapshot instead of defining a stable public shape.
- Treating a custom panel as sandboxed because it renders in a ShadowRoot.
- Fetching a stream on every `update()` or replay tick instead of decoding once in the plugin worker.
- Comparing event timestamps to host encounter strings when `frame.firstTimestampMs + EventMeta.offsetMilli` is authoritative.
- Counting player or pet damage without excluding events targeting players or player-owned pets when implementing a normal damage-done view.
- Making `@bufbuild/protobuf` a normal SDK dependency and creating incompatible duplicate runtime types in consumers.
- Publishing a package version without updating the reference repository's dependency and committed build artifacts.
- Renaming the release workflow without changing npm's trusted-publisher configuration.

## Self-check

Before finishing, verify:

- Which compatibility surface changed: manifest, host API, framing, protobuf, or none?
- Are Go, SDK, browser runtime, docs, tests, and reference implementation synchronized where applicable?
- Are immutable SHA resolution, canonical hashing, artifact verification, trusted-code warnings, and cleanup guarantees intact?
- Were package and plugin versions bumped only when a release is intended?
- Do the SDK tarball and reference bundles contain exactly the files and imports expected?
