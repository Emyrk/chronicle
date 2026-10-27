# Lua panel host v1

Lua runs only in `Guides/runtime/panelWorker.ts` (Fengari), not the page. The ZIP
loader accepts `project.json` with `kind: "panel"`, `.lua` entrypoint, declared
assets, capabilities `ui`/`input`, and at most the `damage` stream. Packages may
`require("chronicle.v1.ui")` and `require("chronicle.v1.events.damage")`; host
modules are never copied into or resolved from the uploaded ZIP. Reserved
`chronicle/` and `chronicle.` paths are rejected. No Lua network API exists.

`chronicle.v1.events.damage` offers `onEvent(callback)`, `onComplete(callback)`
and `bySource(onUpdate)`. Events contain only `stream`, `source`, `target`,
`amount`, `offsetMs`, `encounterId`, `selected`. Chronicle fetches its cached
damage stream, decodes it in the Lua worker and replays it once, then calls
`Panel:OnComplete`. By default it selects only current encounter IDs; a manifest
with `"stream_scope": "instance"` receives every encounter, tagged `selected`.
Panel filters are not applied to Lua panels yet. There is no host cap on events or
bytes: the manifest may set `max_events`, the runtime bounds pending UI operations
per batch, and the host stops a worker after 10 s without progress. `chronicle.v1.ui` provides `metric`, `table`, `bars`, each
creating retained UI operations validated by the Guide scene protocol.

Selector catalog: `GET /api/v1/me/lua-projects` for the signed-in owner's
published panels only. The panel resolves
`GET /api/v1/lua-projects/{id}?channel=stable|unstable` once per page load for
its SHA-256, then fetches its ZIP from
`/api/v1/lua-projects/{id}/artifacts/{sha256}/package`. A browser refresh
resolves the channel again; an open panel keeps running its original release.
Panel refs are `lua:{uuid}:{channel}`. A missing channel/package remains a
non-executing error placeholder. Backend must validate package manifests and
capabilities on publication; this client validates independently. Future work:
URL/layout serialization outside this directory, digest-pinned layout references,
richer event projections and sync playback policy.
