# Controlled real-log validation, 2026-11-10

## Result: publication works; strict repeatability remains blocked

Two independent database clones parsed the same unmodified real ChromieCraft
Ulduar input through `RunLogParseBaseline`, synchronously published all outputs,
and exported v4 artifacts successfully. Their generated instance UUIDs differ.
The full-artifact comparison returned **1**, not equality:

- 14 differing array positions in encounter `remaining` GUID collections.
- 152 differing fields in `unit_classification` event arrays. Different units
  appear at the same event-index/timestamp positions across runs.
- Rankings, memberships, armory, loot, overview and speedrun sections match.

Event ordering was **not** normalized to hide this failure. No parser behavior
was changed. This result does not establish a stable baseline battery yet.

A third database cloned the first parsed output. Using existing sqlc methods,
only overview `player_deaths` changed from 39 to 40. Export and comparison returned
**1**, and recursive JSON comparison confirmed exactly one changed field:
`/publication/instance_overview_metrics/0/player_deaths`.

## Fixture and reference scope

- Public log group: `64cd0aa4-97fb-4c4c-aa4f-6fb64625c12c`.
- Realm: ChromieCraft, `743c7f27-9f8e-4ab5-a260-51e3c09fe9cc`.
- Format: `3.3.5a-cc-addon`; input flavor was preserved.
- Compressed input: 2,633,629 bytes; expanded: 32,850,396 bytes.
- Input SHA-256 (matching the API file metadata):
  `2dd757f8473232db4c19efdf288b40228da9cb5a671bb47d473ed4542a22c773`.
- Download used authenticated GETs on the repository-configured
  `https://legacy.chronicleclassic.com` origin. Redirects were disabled. The
  credential was read only from the environment and excluded from files/logs.
  No production database was accessed and no production mutation was requested.
- Local reference data came from `/home/steven/Games/Warmane`, exported by
  `dbcdata import --export-as=files`. Thirteen DBC artifacts were loaded through
  the existing `gamedataapi.UploadDBC` handler with in-process local test requests;
  talent JSON used the existing sqlc upsert. No production upload occurred.
- This is a **stock local WotLK reference approximation**, not a certified copy of
  production's AzerothCore dataset. World item/creature templates were not
  available/imported. Consequently item quality/gear enrichment and creature
  lookups are incomplete. Both parses used the same exact seeded reference data.

Each parse published 1 instance, 3 encounters and 238,857 decoded events:

| Output | Rows |
| --- | ---: |
| Encounter DPS rankings | 23 |
| Referenced talent builds | 18 |
| DPS/HPS memberships | 23 |
| Clear-time memberships | 0 |
| Boss-time memberships | 1 |
| Guilds | 2 |
| Current players / gear history | 23 / 23 |
| Loot | 2 |
| Overview / speedrun | 1 / 1 |

Zero clear-time memberships is actual output, not coverage of a successful
qualified clear. Other requested servers have not yet been validated.

## Local resources and commands

Only newly created resources were used; existing development services were left
untouched. The database container/volume intentionally remain for investigation:

- Container: `parser-baseline-9be38f11f5`, image `postgres:17`.
- Persistent volume: `parser_baseline_9be38f11f5_data`.
- Endpoint: `127.0.0.1:55439`, local trust auth, no production credentials.
- Databases: `parser_baseline_seed`, `parser_baseline_before`,
  `parser_baseline_after`, `parser_baseline_mutated`.
- Private fixture root:
  `/home/steven/.local/share/chronicle-parser-baseline/9be38f11f5`.
  Input, metadata, local setup/seed/mutation helpers, logs and JSON artifacts are
  kept there, not committed. Each JSON artifact is approximately 179 MB.

The before/after databases were independently created with:

```sh
docker exec parser-baseline-9be38f11f5 createdb -U postgres \
  -T parser_baseline_seed parser_baseline_before
docker exec parser-baseline-9be38f11f5 createdb -U postgres \
  -T parser_baseline_seed parser_baseline_after
```

For each fresh clone (`NAME=parser_baseline_before` or `parser_baseline_after`):

```sh
ROOT=/home/steven/.local/share/chronicle-parser-baseline/9be38f11f5
env -u CHRONICLE_TOKEN \
  BASELINE_DATABASE_URL="postgres://postgres@127.0.0.1:55439/$NAME?sslmode=disable" \
  "$ROOT/parser-baseline" run --isolated-db --fresh-armory-seed \
  --args "$ROOT/args.json" --storage "$ROOT/objects" --expect-instances 1 \
  > "$ROOT/$NAME.json"
```

`cmp -s before.json after.json` returned 1. A subsequent `export` of the mutation
clone followed by `cmp -s before.json mutated.json` also returned 1, as expected.
Do not rerun `run` against these already-published databases without explicitly
creating fresh disposable clones from the seed.

## Defect fixed and checks

The first real parse exposed a nil SpiceDB panic during transactional guild
publication. `NewDatabaseOnly` used a no-op authorizer only outside transactions;
`AuthzTX` still called its parent's nil SpiceDB client. An explicit database-only
flag now bypasses relationship writes/deletes and rollback compensation only for
that constructor. Normal authorization behavior is unchanged. Regression tests
cover SQL commit/rollback and direct database-only relationship operations.

Passed after the fix:

```sh
go test ./database/authz ./scripts/parser-baseline ./chronicle -count=1
golangci-lint run ./database/authz/... ./scripts/parser-baseline/... ./chronicle/...
go build ./scripts/parser-baseline
```

Next decision: address production event-emission repeatability, or explicitly
accept a non-byte-identical baseline policy. Do not silently sort semantic event
streams. Reference-data completeness and additional server fixtures remain
separate follow-ups.
