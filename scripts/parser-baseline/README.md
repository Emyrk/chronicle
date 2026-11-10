# Temporary parser baseline CLI (partial coverage)

This local-only tool invokes `Chronicle.RunLogParseBaseline` against an existing
seeded database, then writes deterministic, indented JSON to stdout. It does not
start River or enqueue ranking refresh, score computation or notifications.
**Matching artifacts prove equality only for the explicit fields below, not full
parser equivalence.** All tables outside the allowlist are unsupported.

## Safety and fixture prerequisites

- Use disposable, exclusively owned local PostgreSQL databases named
  `parser_baseline_*`. The CLI requires `--isolated-db` and
  `BASELINE_DATABASE_URL`. It rejects remote hosts (including multi-host
  fallbacks). A loopback proxy or tunnel is not proof of isolation: never point
  this at production, even through a tunnel. Nothing provisions, migrates,
  downloads or resets a database automatically.
- Restore the **same seed** separately for each candidate revision. Apply the
  schema expected by that revision before running. Do not run a server/worker
  against these databases. `run` requires no existing `parsed_log_group` row for
  the selected group, including no staged output from a prior failure. Restore
  the fixture before retrying, rather than reparsing an already modified clone.
- Seed the log group and its owner, files, ready file parts and artifact rows,
  realm/server/tenant relationships, resolved dataset and matching reference
  data. Keep all input metadata, input object bytes, lookup data and fixture IDs
  identical across candidates. The tool requires explicit realm and generation;
  it resolves that realm's dataset/flavors from the database and fails if absent.
- Reference data includes dataset-scoped spells and related `dbc_spell_*` data,
  duration modifiers, consumables, talents, creature/item templates and associated
  metadata. Loot filtering depends on item quality. Missing reference data can
  change outputs without necessarily making the parse fail. The tool does not
  certify fixture completeness.
- Use a disposable **local object-storage copy**, never a production object-store
  configuration. `--storage DIR` contains `raidlogs/logs/<file UUID>` plus ready
  file-part objects under their stored keys, and artifact objects at
  `raidlogs/<artifact.ObjectKey>`. Preserve `content_encoding` (gzip when stored
  compressed). Sidekick artifacts matter even though missing artifacts may be
  nonfatal to the parser. Chronicle creates `raidlogs`, `parse-profiles` and
  `temporary` bucket directories; profile/replacement flags can write/delete
  profile objects. The CLI uses its own temporary directory, not the server's.
- Artifacts can contain player names and combat data. Keep them private. No
  production credentials or data acquisition are included in this tool.

## Run and compare

Build the same command at each candidate revision, using identical build tags
where required by the selected server:

```sh
go build -o /tmp/parser-baseline ./scripts/parser-baseline
```

Supply the existing `ArgsLogParse` JSON (unknown fields are rejected):

```json
{
  "log_group_id": "11111111-1111-1111-1111-111111111111",
  "parse_generation": 1,
  "realm_id": "bcf173a7-c94a-49fe-8930-27435d722fb7"
}
```

Include the fixture's `tenant_id` and other parse flags when applicable. UUIDs
above are illustrative; the group must already exist. This narrow CLI deliberately
requires a realm instead of exercising implicit realm pre-scan resolution.

```sh
# Set this explicitly to your disposable local clone. No DATABASE_URL fallback.
export BASELINE_DATABASE_URL='postgres://localhost/parser_baseline_before?sslmode=disable'
/tmp/parser-baseline run --isolated-db --args fixture-args.json \
  --storage /path/to/local-object-copy --expect-instances 1 > before.json.tmp \
  && mv before.json.tmp before.json

# Rebuild at the candidate revision, restore a separate identical seed, and use
# that clone's DSN and object copy to produce after.json in the same way.
diff -u before.json after.json
```

`diff` exits 0 for equality, 1 for differences, and >1 for errors. There is no
full-parity verdict or fuzzy comparator. Always check both CLI exit statuses;
an empty/truncated file from a failed command is not a baseline.

To re-export an already successfully parsed clone without parsing again:

```sh
/tmp/parser-baseline export --isolated-db --args fixture-args.json \
  --expect-instances 1 > before.json.tmp && mv before.json.tmp before.json
```

The exporter reads a repeatable-read, read-only transaction. It requires current,
finalized publication at the requested generation, the exact positive expected
instance count, at least one encounter per instance, and every supported stream
row. Missing outputs, stale generations, malformed event payloads, unknown event
fields and ambiguous canonical identities fail. The underlying runner's nil
return on stale-generation abort is **not** treated as publication proof. Empty
or encounter-free logs are intentionally unsupported in this first slice.

## Exact v2 allowlist

The artifact repeats its schema, partial-coverage warning and field allowlists.

| Table | Exported fields |
| --- | --- |
| `log_instances` | canonical `id`, `realm_id`, `name`, `capabilities`, `recorder_name`, `recorder_guid`, `start_time`, `end_time`, `difficulty_name`, `max_players`, `dynamic_difficulty`, `vehicle_control_intervals` |
| `log_instance_encounters` | canonical `id`/`instance_id`, `name`, `remaining`, `boss`, `start_time`, `end_time`, `kill_type`, `map_id`, `ranking_start_offset_ms`, `ranking_end_offset_ms` |
| `log_instance_events` | parent canonical instance, stream type, canonical encounter per segment, exact first Unix-millisecond timestamp, all decoded protobuf fields in original event order |

All 22 current streams are decoded, including the persisted `ressurection`
spelling. The exporter validates gzip, segment lengths, event counts and protobuf
fields, including unknown nested fields. It compares semantics, not gzip bytes.
A newly introduced enum stream without a decoder fails closed.

Instances receive `instance/N` keys ordered by `(realm_id, name, start, end)`.
Encounters receive `instance/N/encounter/M` keys ordered by
`(name, map_id, boss, start, end)`. Identity tuples are sorted by their exact JSON
encoding; ties fail instead of using random UUIDs. Segment encounter references
use those same keys. Reference realm IDs and WoW GUIDs remain unchanged. Row and
segment order is canonicalized; event/array order is preserved. No semantic
values are rounded or shifted. SQL timestamps use UTC representation without
changing the instant or precision. Event header timestamps, offsets, durations,
activity order and synthetic markers remain exact. Protobuf int64 values stay
JSON strings; other numbers never pass through float64 during re-encoding.

Not compared: generated UUIDs, hashed slugs, duplicate-group identity, parser
version bookkeeping, publication wall-clock time, invalidation metadata and
joined guild/tenant presentation fields. These omissions are explicit, not a
generic timestamp/duration scrubber.

## Ranking parity coverage (v2)

The `ranking_parity` section exports these tables with explicit field allowlists
in `rankings.go` and in each artifact:

- `encounter_dps_rankings`: every column except `created_at` and
  `log_hashed_slug`. This includes all damage/healing/absorb totals, unranked
  damage, exact `duration_secs`/DPS/HPS, death/alive evidence, nullable item level,
  class/spec/sub-spec/role/level, difficulty, names and `killed_at`.
- `parse_score_memberships`, `time_parse_clear_time_memberships`,
  `time_parse_boss_kill_memberships`: every column. Policy/query versions, tenant,
  representative instance, logical run, player/spec dimensions, exact scores,
  semantic timestamps and duration milliseconds remain visible.
- Referenced `talent_builds`: every column except `created_at`, including dataset,
  class, full layout, ordered talent summary, spec and nullable sub-spec.

Generated row IDs become natural-key strings. Talent identity uses
`(dataset_id, player_class, talent_layout)`; guild references use `(realm_id,
name)` after looking up the actual referenced guild, not a denormalized name.
Guild table coverage remains unsupported apart from this identity lookup.
Instance/encounter references use the same mappings as the event export. Ranking
identity uses instance, encounter, encounter name and player; trash rankings also
include spec/sub-spec. Membership identity uses tenant, policy/query version and
logical run, plus encounter/player where applicable. The selected log-group ID
becomes `log-group`. Missing, ambiguous or inconsistent references fail closed.

Queries include memberships for **all affected logical runs**, even when the
representative belongs to another seeded log group. This version rejects such
external representatives and duplicate-run anchors outside the exported group,
rather than silently omitting their memberships or retaining unstable UUIDs.
Use a fixture without cross-log duplicate groups for this slice. Full duplicate
closure export remains a follow-up. Local duplicate anchors use their canonical
instance key. Reference dataset/realm/tenant UUIDs remain unchanged and must
match between fixtures.

Rows are sorted by their semantic keys, never by random UUIDs. No event order is
changed. SQL bigint values are re-encoded as exact JSON numbers; float64 evidence
uses its exact round-trip representation without rounding. Empty ranking and
membership arrays are permitted (unlisted/unrankable/zero-output cases can be
legitimate), and any row-count/content difference is visible in the artifact.
Publication checks alone cannot certify that an expected nonempty ranking cohort
was produced: the baseline fixture must establish that expectation.

The schema is now `chronicle-parser-baseline-v2`. Compare the **whole artifact**,
including version, coverage, allowlists and unsupported-table inventory. `diff`
returns nonzero for different coverage; never compare an intersection or strip
coverage metadata. v1 and v2 artifacts are not comparable as equal coverage.

## Unsupported synchronous outputs

All other tables are unsupported, notably:

- `log_instance_units`, `log_instance_players`,
  `log_instance_encounter_hostiles`, `log_instance_encounter_phases`,
  `log_instance_raid_group_snapshots`.
- `guilds`, `game_players`, `game_player_gear_history`, `instance_loot`.
  These are the exact guild/loot write targets of
  `combatlog/parser/common/armory/armory.go` and
  `combatlog/parser/common/loot/loot.go`, via `database/queries/armory.sql` and
  `database/queries/loot.sql`. `world_item_template` is a reference lookup for
  item metadata and low-quality loot filtering, not a parser output table.
- `instance_overview_metrics`, `instance_speedruns`.

Async computed scores, ranking-run refresh results and notification/River state
are deliberately excluded. No retired `rating_*` schema is assumed. Extending
coverage requires explicit queries/field policies/tests, not dumping every
associated table and silently normalizing it.

## Validation

```sh
go test ./scripts/parser-baseline ./chronicle
golangci-lint run ./scripts/parser-baseline/... ./chronicle/...
```

Tests use isolated `dbtestutil` databases and cover missing/staged/stale outputs,
instance/encounter/stream absence, scope isolation, canonical generated IDs,
precision-sensitive timestamps/offsets/durations, malformed protobuf and local
DB validation. Ranking tests additionally cover randomized generated identities,
reference failures, exact ranking evidence, all three membership refresh/read
paths, talent references and affected-run scope isolation. No real production fixture is included or downloaded.
