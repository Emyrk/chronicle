# Temporary parser baseline CLI (controlled-fixture publication coverage)

This local-only tool invokes `Chronicle.RunLogParseBaseline` against an existing
seeded database, then writes deterministic, indented JSON to stdout. It does not
start River or enqueue ranking refresh, score computation or notifications.
**Matching artifacts prove equality only for the explicit fields below and the
controlled fixture scope, not arbitrary production-database equivalence.** All
tables outside the allowlist are unsupported.

## Safety and fixture prerequisites

- Use disposable, exclusively owned local PostgreSQL databases named
  `parser_baseline_*`. The CLI requires `--isolated-db` and
  `BASELINE_DATABASE_URL`. Both commands also require `--fresh-armory-seed`,
  attesting that shared guild/player/gear tables were empty before this public
  parse. `run` verifies those tables are empty before parsing. It rejects remote hosts (including multi-host
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
go build -ldflags "-X github.com/Emyrk/chronicle/internal/version.GitCommit=$(git rev-parse HEAD)" \
  -o /tmp/parser-baseline ./scripts/parser-baseline
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
/tmp/parser-baseline run --isolated-db --fresh-armory-seed --args fixture-args.json \
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
/tmp/parser-baseline export --isolated-db --fresh-armory-seed --args fixture-args.json \
  --expect-instances 1 > before.json.tmp && mv before.json.tmp before.json
```

The exporter reads a repeatable-read, read-only transaction. It requires current,
finalized publication at the requested generation, the exact positive expected
instance count, at least one encounter per instance, and every supported stream
row. Missing outputs, stale generations, malformed event payloads, unknown event
fields and ambiguous canonical identities fail. The underlying runner's nil
return on stale-generation abort is **not** treated as publication proof. Empty
or encounter-free logs are intentionally unsupported in this first slice.

## Baseline-only engine selection

`run --engine legacy` is the default. `run --engine parsernext-vanilla` selects
`parser/vanilla/nextsource` for `1.12a-cc-addon` only. It reuses the existing
consumers, finalizers and fenced publication. Unsupported names and formats fail;
there is no fallback. The selection is call-local and is never stored in River
arguments, database settings or production configuration. Production workers keep
the legacy default. `export` does not select an engine.

Pass `--provenance /new/path/run.json` to record the attempted engine and Go VCS
revision/dirty status separately from stdout's comparable artifact. If Go omits
VCS settings, the standard `version.GitCommit` linker input supplies the revision
(as in the build command above); dirty status remains explicitly unknown. The path is
exclusive-create; existing evidence is never overwritten. Provenance existence
does not prove success: both the run exit status and canonical export validation
must pass. Build a clean committed checkout for a precise revision; overlay builds
need a separate manifest naming the overlaid revision/files/hashes too.

For old/new validation, use separate fresh clones of the same seed and private
object copies. Compress stdout directly (with pipefail or explicit subprocess
status checks), preserve complete exports, and retain strict differences even
when a separate diagnostic attributes differences to known event ordering noise.

## Exact v4 allowlist

The artifact repeats its schema, controlled-fixture scope and field allowlists.

| Table | Exported fields |
| --- | --- |
| `log_instances` | canonical `id`, `realm_id`, `name`, canonical nullable `guild_id`, `capabilities`, `recorder_name`, `recorder_guid`, `start_time`, `end_time`, `difficulty_name`, `max_players`, `dynamic_difficulty`, `vehicle_control_intervals` |
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
Guild rows are also exported by the controlled-fixture publication layer below.
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

The current schema is `chronicle-parser-baseline-v5`. Compare the **whole artifact**,
including version, coverage, allowlists and unsupported-table inventory. `diff`
returns nonzero for different coverage; never compare an intersection or strip
coverage metadata. Artifacts with different versions are not comparable as equal coverage.

## Combat structure and log flavor coverage (v3)

Each instance's `combat_structure` section exports all columns of:

- `log_instance_units`: instance reference, WoW GUID, name, creature entry and
  nullable owner GUID.
- `log_instance_players`: instance reference, WoW GUID, name, level, class, race
  and nullable canonical guild reference.
- `log_instance_encounter_hostiles`: canonical encounter reference, hostile WoW
  GUID, boss flag and full ordered activity periods. Start/end/last-active
  timestamps, reasons, end states and embedded event evidence remain exact.
- `log_instance_encounter_phases`: canonical phase/encounter references, key,
  name, phase order, exact start/end offsets and kill type.
- `log_instance_raid_group_snapshots`: canonical snapshot/instance/encounter
  references, snapshot type, exact observation time and full raid composition.
  Group/slot ordering is preserved. Joined display-only encounter name and kill
  time from the read query are not columns of this table and are not duplicated.

The top-level `log_group` contains canonical `id`, persisted `log_type`, nullable
`format` and the full persisted `flavor` array. This captures parser flavor
publication without exporting owner, upload bookkeeping or generation timestamps.

Instance and encounter references reuse existing canonical mappings. Phase
identity uses `(encounter, key)`; snapshot identity uses `(instance, encounter,
type, observed_at)`. Unit/player identities use their WoW GUID, and hostile rows
use `(encounter, WoW GUID)`. Duplicate identities or missing/cross-instance
references fail. Player guild identities use the same `(realm_id, name)` lookup
as ranking references. Natural GUIDs are never replaced with generated IDs.

Only database row ordering is canonicalized. Activity period order, embedded
event evidence, phase-order values, composition slots, flavor order and decoded
event order are not sorted away. Nested semantic timestamps and numbers are not
rounded or scrubbed. Empty optional collections remain visible as empty arrays.

## Remaining publication tables (v4)

The `publication` section completes the requested synchronous output-table
inventory **for the controlled public, single-log fixture described below**:

- `guilds`: canonical `(realm_id, name)` identity, realm and name. `created_at`
  is excluded as insertion wall-clock bookkeeping. Instance guild affiliation
  is now also included in `log_instances` and resolved through this mapping.
- `game_players`: every column except insertion `created_at`, including exact
  semantic `updated_at`, nullable canonical `updated_from_instance`, gear,
  talents, identity, guild, level, class, gender and race.
- `game_player_gear_history`: every column except insertion `created_at`, scoped
  to selected instance IDs. Exact `equipped_at`, gear-slot order and nullable
  average item level remain visible. Player/realm references must resolve.
- `instance_loot`: every column. Generated IDs become canonical content keys plus
  occurrence numbers. Identical loot rows retain their multiplicity. Source and
  recipient GUIDs/timestamps, item fields, suffix and quantity remain exact.
- `instance_overview_metrics`: every column except operational `created_at` and
  `updated_at`. Exactly one row is required per instance. Requirements, deaths,
  wipes, ordered incoming-damage evidence, all semantic durations and metrics
  version remain exact.
- `instance_speedruns`: every column except insertion `created_at`. All six
  semantic timing endpoints, three duration variants, qualification, addon
  version and proof are retained. Proof is decoded JSON, not base64, preserving
  nested evidence, numeric precision, timestamps and array order. A missing row
  is represented as absence, since the writer conditionally skips speedruns.

The artifact's unsupported synchronous-table inventory is now empty **within
these explicit field and fixture limits**. Earlier field exclusions still apply
(hashed slugs, parser-version bookkeeping, the instance `versions` map and
`category`, duplicate-group storage identity, and invalidation metadata). This is not a claim that every database column or
trigger side effect is compared. Async ranking-run projections, computed score
results/receipts, notifications/River state and reattached preexisting shared-view
or video links remain excluded. No retired `rating_*` schema is assumed.

### Shared armory isolation contract

`armory.Tracker.Insert` upserts all observed guilds/players, not just encounter
participants. Current-player updates only win when `player.Seen` is newer, and
can inherit preexisting gear/talents if the new observation omits those fields.
Unlisted logs intentionally clear provenance and skip public gear history.
Consequently, after-the-fact participant joins cannot establish the writer set.

This tool therefore requires **public logs and initially empty `guilds`,
`game_players`, and `game_player_gear_history`**, with no other parse or writer in
the clone. `run` checks emptiness and rejects unlisted input; `export` rejects
unlisted publication. Both commands require `--fresh-armory-seed`. Export-only
cannot prove the earlier state: that flag is an operator attestation, not an audit
trail. Re-export only an output originally produced under this contract.

Current players are selected by `updated_from_instance` in the selected log;
gear history by selected instance IDs. All guilds in the selected instance realms
are included, catching observed guilds without a majority/participant reference.
Counts across shared armory tables must equal these scoped result counts, or
export fails rather than dumping unrelated history. Other-realm guilds and
players/gear without selected provenance are rejected. Same-realm preseeded
guilds or preexisting player values that were overwritten cannot be identified
post hoc, which is why the empty-before-parse attestation is mandatory.

Do not delete shared state from a live or populated database to meet this
contract. Prepare a separate disposable fixture with only reference/input data.
Populated/shared-history fixtures and cross-log duplicate closure remain
unsupported; their parity requires a different acquisition boundary. Multi-
instance outputs within the one selected log are allowed. These constraints and
field allowlists are included in the whole-artifact comparison contract.

### Next validation boundary

Publication table coverage is now implemented. The next step is **real fixture
end-to-end validation**, not another generic export abstraction. No production
corpus was accessed or acquired to build this tooling. A controlled real-log
fixture must still establish expected nonempty rankings, memberships, speedruns,
loot and armory output as appropriate. Empty optional arrays do not certify
fixture completeness, and output parity cannot certify matching reference data.

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
paths, talent references and affected-run scope isolation. Combat-structure tests
cover random phase/snapshot/guild IDs, scope rejection, exact period evidence,
phase offsets/order, raid slots/observation times and persisted log flavor. Final
publication tests cover shared-state isolation, randomized guild/loot IDs, exact
observation/loot times, speedrun proof, overview evidence and duplicate loot
multiplicity. No real production fixture is included or downloaded.

### Multi-format parsernext comparison

`--engine parsernext` selects the independent parsernext source composition for
Vanilla companion, TBC companion, Wrath companion, AzerothCore, V9, HermesProxy,
and V22 input. `--engine parsernext-vanilla` remains available as the narrower
Vanilla-only selection. Both are workerless tooling options; neither changes
normal server/River worker selection.

The stored format and resolved flavor tags are attached to the parsing context.
Wire format selects decoding and its synthetic composition, not custom-content
flavor. All sources feed the existing consumers and publication path. V22's new
source includes reordering internally, so callers must not reorder it a second
time.

Compare against a genuine pinned legacy source build, not merely the `legacy`
entrypoint of the refactored tree, since legacy adapters share extracted record
algorithms. Keep source/overlay hashes, reference-seed hashes, engine selection,
format, and flavor provenance. Strict differences remain differences; semantic
ranking diagnostics may separately explain canonical encounter-ID propagation.
These runs do not validate full-session snapshot/resume.

Version 5 also compares mixed-clear status, nullable per-encounter difficulty, faction in instance and career player rows, and the exact persisted `log_instance_difficulties` values. The last is not reconstructed from encounters. `difficulty_normalized` is excluded because it records internal normalization provenance rather than the resulting difficulty semantics.
