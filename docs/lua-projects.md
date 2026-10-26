# Lua projects (initial panel release)

Lua projects are account-owned source packages. A project has one editable draft and two channel-following published releases, `unstable` and `stable`. Published releases are identified by the SHA-256 of their deterministic ZIP bytes. Uploading a draft does not affect either channel; publishing replaces Unstable; promoting copies the exact tested Unstable hash to Stable without rebuilding. Unreferenced package bytes are deleted. Historical artifact bytes are not retained, so restoring an older release requires uploading and publishing it again.

## Authoring and sharing

Uploaded ZIPs live in the `lua-projects` object-storage namespace (an S3 prefix when the deployment uses the configured S3 bucket; local object storage in development). The underlying S3 bucket must remain private: the S3 adapter does not set a bucket policy, and authenticated/public channel downloads are mediated by Chronicle's API. PostgreSQL holds project/channel metadata, content hashes, and object keys, not new ZIP bytes. Before each upload, PostgreSQL records a durable object-key intent. An upload that crashes before the artifact transaction or loses a revision race remains recoverable. Successful artifact transactions consume the intent atomically; upload and commit errors leave the intent untouched because acknowledgments can be ambiguous. Collectors only claim unreferenced keys after the upload's ten-minute grace period and retry failed deletions on a lease, using PostgreSQL time for eligibility and lease expiry. Cleanup runs at startup, after writes, and once a minute, so idle services still collect expired intents. The `chronicle_lua_projects_artifact_gc_backlog` Prometheus gauge counts eligible, unreferenced ZIPs waiting for deletion (including leased retries); watch for sustained growth. It is sampled on cleanup passes, so may lag by up to a minute. Existing PostgreSQL bytea artifacts remain readable during migration but new uploads use object storage.

Authoring is opt-in via the site-wide SpiceDB relation `chronicle:chronicle#lua_project_author@user:<id>` (assignable as **Lua Project Author** in Admin Users). This grants `create_lua_project`; technical administrators receive it automatically, while ordinary site administrators need the explicit grant. Creation records `lua_project:<id>#chronicle@chronicle:chronicle`, `lua_project:<id>#owner@user:<id>`, and `lua_project:<id>#public_viewer@user:*`. Owners and technical administrators can `update` drafts and publish channels. Published metadata and packages require `view` and remain public by default, including for anonymous visitors; technical administrators retain `view` even if the wildcard is removed. Private draft downloads require project `update` permission; the public view grant does not expose drafts. Removing an author's site-wide grant prevents new projects but does not revoke update access to projects already owned; remove the project owner relation separately to revoke that access.

Create a panel at `/lua-projects`. Upload an uncompressed `.tar` with `project.json` and `main.lua`, or use the separate ephemeral inference author to propose `main.lua`, review its text, and explicitly upload it as a private draft. The model cannot publish a project. Preview loads the private draft ZIP in the same sandbox as installed panels, but has no instance event data. Test data-driven behavior by adding the Unstable panel reference to an instance layout before promoting it.

A minimal manifest is:

```json
{"manifest_version":1,"kind":"panel","name":"Example","slug":"example","entrypoint":"main.lua","capabilities":["ui"],"streams":[],"assets":[]}
```

The manifest name, slug, and kind must match the project record. Supported capabilities are `ui` and `input`; the only available event stream in this release is `damage`. An Unstable reference is `lua:<project UUID>:unstable`, and Stable uses `:stable`. Stable appears in the panel catalog by default. Anyone with an Unstable reference can paste it into the panel selector search box. A saved layout stores the channel reference, **not** a specific digest. Active panels check their channel for updates periodically.

Use `require("chronicle.v1.ui")` for shared metric, table, and bar helpers and `require("chronicle.v1.events.damage")` for `onEvent`/`bySource`. These modules ship with Chronicle, not in each project ZIP. The `chronicle` namespace is reserved; package-local Lua modules can be required from other names. Host-owned processing passes bounded event records to the worker. There is no Lua network, DOM, JS interop, or generic HTTP function.

For a simple damage panel, declare `"streams":["damage"]` and write:

```lua
local ui = require("chronicle.v1.ui")
local damage = require("chronicle.v1.events.damage")
local metric = ui.metric(UIParent, "damage-total", "Damage", 0, 16, -16)
local total = 0
damage.onEvent(function(event)
  -- A host-bounded record: source, target, amount and offsetMs.
  total = total + event.amount
  metric.set(total)
end)
```

## Boundaries and limitations

The server accepts only regular tar files, bounded to 8 MiB upload, 16 MiB expanded data, and 128 files. It rejects links, traversal, duplicate paths, unknown package file types, and reserved module paths; raster assets must be declared and have matching PNG/JPEG/WebP signatures. It repackages validated files as a sorted ZIP. The panel loader independently validates the ZIP before starting a dedicated Fengari worker. Lua callbacks have instruction limits, scene messages have size and geometry checks, damage projection has event and output limits, and the host terminates a worker that exceeds its time budget. Workers are not an OS memory sandbox; a malicious script can still consume CPU/memory up to browser limits.

Public Stable releases appear in the project catalog. Unstable is link-only. Guide projects can be created and drafted but **cannot yet be published** through this project system; PR #1217's built-in guide format remains separate. There is currently no general network/API capability, no durable inference project conversation, and no byte-accurate heap quota. Sharing a channel means the author's next publish can change what viewers run; there is no stored old artifact for rollback.
