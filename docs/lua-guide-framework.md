# Lua guide framework

Chronicle guides are untrusted ZIP packages containing a versioned `guide.json`, Lua source, and optional assets. The browser validates the entire archive before starting a dedicated worker. Lua never receives a JavaScript object, DOM reference, browser API, network primitive, or mutable host filesystem.

## Runtime choice

Version 1 uses [Fengari](https://fengari.io/) 0.1.5, a Lua 5.3 VM implemented in JavaScript, inside a dedicated module worker. Fengari is small, works with the existing Vite build, exposes the Lua C API needed for protected calls and instruction-count hooks, and does not require a separately maintained WASM build. A pinned pnpm patch makes browser detection explicit and prevents Node-only standard-library modules from being eagerly loaded in browser bundles. Chronicle does **not** include `fengari-interop` or Fengari's browser loader, both of which would expose JavaScript or synchronous network-backed module lookup.

Luau was considered. Its first-party sandbox helpers, allocator accounting, and interrupt callback are stronger primitives, but its web target is a sample embedding rather than a maintained package. Adopting it would require Chronicle to pin and continuously build a custom Emscripten artifact and C++ bridge. The language-neutral protocol deliberately keeps that migration possible.

Fengari cannot impose an exact VM heap ceiling because allocations use the worker's JavaScript heap. Version 1 therefore limits archive bytes, individual files, source bytes, object count, operation batches, strings, timers, and instruction count, and retains an independent main-thread watchdog that terminates the entire worker. This is defense in depth, not a claim that JavaScript workers are operating-system security boundaries.

## Security model

The guide worker receives one structured-clone startup message containing validated manifest data and copied package files. Its global scope has browser worker APIs, but guide Lua cannot reference them: only explicitly registered native functions are installed in the Lua state. The Lua `io`, `os`, `package`, `debug`, `dofile`, `loadfile`, `load`, and `collectgarbage` globals are removed. `require` is replaced with a package-local loader that accepts normalized relative Lua module names from the prevalidated file map.

Every host-to-worker and worker-to-host message is validated at runtime. The worker batches retained-scene operations. Limits are checked in the package loader, Lua bindings, protocol parser, scene reducer, timer scheduler, and runtime controller.

A Lua instruction hook aborts callbacks that exceed their instruction budget. A main-thread watchdog terminates a worker that does not finish startup or acknowledge an event before the wall-clock deadline. Termination is the final authority: there is no main-thread fallback for untrusted Lua.

No guide capability grants network, DOM, JavaScript, storage, or arbitrary filesystem access. Version 1 capabilities are:

- `ui`: screen-space frames, text, textures, and buttons.
- `map`: markers and tactical shapes in normalized map coordinates.
- `input`: click and viewport callbacks.
- `timers`: bounded one-shot timers.

Unknown required capabilities reject the package before execution.

## Package format

The root file `guide.json` uses manifest version 1 and names a package-local Lua entrypoint. ZIP paths are normalized to forward-slash relative paths. Absolute paths, `..`, empty segments, NUL bytes, backslashes, duplicate normalized paths, symlinks, encrypted entries, unsupported compression, undeclared assets, and oversized content are rejected.

The validated package is immutable. Lua can load declared Lua modules only through the restricted `require`; assets are resolved by the host to package-owned Blob URLs and revoked when the host unmounts or restarts.

## Retained protocol

Lua creates stable logical nodes. It emits ordered batches containing `create`, `set`, `destroy`, `listen`, and `camera` operations. The host validates and reduces each batch into an immutable retained scene. Parent cycles, unknown IDs, unsupported properties, invalid coordinates/colors/sizes, excessive nesting, and oversized batches fail closed.

UI nodes use viewport pixels and WoW-style anchors. Map nodes use normalized coordinates: `(0, 0)` is the map artwork's top-left and `(1, 1)` is bottom-right. Facing is radians clockwise from map north. Chronicle may later add explicit world-space nodes without changing normalized-map semantics.

## Lifecycle

1. Read ZIP bytes and validate archive limits.
2. Parse and validate `guide.json`.
3. Create package asset Blob URLs.
4. Start a fresh guide worker and send copied source files.
5. Worker creates a fresh Lua state, installs the constrained API, executes the entrypoint, and emits its initial batch.
6. Host renders the retained scene and dispatches validated input, resize, and timer events.
7. Stop, restart, route exit, crash, or unmount terminates the worker, clears timers, revokes URLs, and discards scene state.

Trusted host controls are React siblings rendered above the guide layer. Guide nodes cannot parent, mutate, cover, or intercept them.

## Integration boundary

`GuidePage` is a standalone `/guides/:guideId` route. `GuideHost` owns package/runtime lifecycle and guide UI. The map adapter reuses Chronicle map asset contracts and renderer primitives but does not depend on replay aggregation, combat-log streams, `Map.tsx`, or panel context. The checked-in Onyxia package is the first resolver target and exercises the same ZIP loading path as uploaded packages.

## Resource limits

The constants live beside the package and protocol validators and are part of API version 1. Initial limits intentionally favor small authored guides:

- 8 MiB ZIP transport
- 16 MiB total expanded bytes
- 2 MiB per file
- 512 files
- 1 MiB total Lua source
- 2,000 retained nodes
- 2,000 operations per batch
- 64 KiB serialized worker message
- 128 active timers
- 30 seconds maximum timer delay
- bounded instructions per startup/callback
- startup/event wall-clock watchdogs

These may become host policy settings in a future version, but package authors must not depend on larger values.

## Known limitations

- Fengari shares the worker's JavaScript heap, so v1 has no byte-accurate VM heap allocator quota.
- The WoW-inspired API is intentionally a small compatibility-shaped API, not WoW AddOn API compatibility.
- Packages are locally bundled fixtures in v1. Signing, remote repositories, publishing, account installation, and marketplace discovery are future work.
- The host loads trusted Chronicle map assets over its normal application network path; guide Lua itself has no network capability.
