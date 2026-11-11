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

## Follow-up: persistent four-flavor corpus

A subsequent run migrated the isolated setup to
`~/Desktop/parsing_snapshots/` and exercised four real public inputs. The new
PostgreSQL 17 container `parsing-snapshots-postgres` binds
`~/Desktop/parsing_snapshots/postgres/data` and listens only on
`127.0.0.1:55440`. Migration used logical dumps/restores, not a live PGDATA copy.
The original container and named volume described below are retained. Restored
before/after/negative artifacts are byte-identical to the originals; seed dump
contents match after removing pg_dump's random restrict markers and sorting dump
lines for comparison.

| Case | Public log group | Instances / encounters / events | Strict differing fields |
| --- | --- | ---: | ---: |
| ChromieCraft | `64cd0aa4-97fb-4c4c-aa4f-6fb64625c12c` | 1 / 3 / 238,857 | 158 |
| Crusader Storm | `c529c367-f844-4342-8922-e80cf96d5db3` | 3 / 106 / 532,430 | 6,924 |
| OctoWoW | `5aae53d5-07c2-4da6-9129-c569cb776509` | 1 / 12 / 181,936 | 25 |
| Capybara | `10deeee3-d8d7-46fa-aa30-ffd7f02444d9` | 1 / 11 / 178,354 | 71 |

Each case completed two independent synchronous parses and exports. Every
negative control changed exactly one overview `player_deaths` field and the
whole-artifact comparison detected it. All twelve completed parse/control
databases have zero River jobs. **All four strict repeats fail**; these counts
are observations from one pair per case, not stable expected counts.

- OctoWoW and Capybara differ only in classification event fields.
- ChromieCraft differs in classification and remaining-hostile array order.
- Crusader also differs in slain events and two trash encounter names in
  Zul'Farrak: `Sandfury Shadowhunter` versus `Sandfury Witch Doctor`, and
  `Sandfury Blood Drinker` versus `Sandfury Shadowcaster`. Matching encounters
  diagnostically by exact times/map/boss flag finds the same identity sets.
  Name-based canonical encounter keys reorder many referencing event and combat
  structure sections, amplifying the strict diff. This is not a relaxed parity
  result; no artifact normalization or parser fix was applied.

A subsequent diagnostic classified all observed differences without rewriting
strict artifacts. For ChromieCraft, OctoWoW and Capybara, changed event segments
have equal first timestamps/counts and equal full-record multisets at each exact
event offset when only the event index is omitted. Remaining-hostile multisets
also match. These observations support an ordering/index-assignment diagnosis,
not strict parity. For Crusader, exact-time encounter alignment plus table-row
multiset comparison isolates the two encounter-name changes above; those are
**non-order semantic differences whose cause remains uninvestigated**. Its
remaining slain difference is ordering within nested
`attribution.meta.activity` (the same `start` and `bump` records reversed).
Classification/index ordering and name-based key/row reordering account for the
rest. No additional unexplained differences remain in this diagnostic, but
Crusader cannot be described as ordering-only or semantically equivalent.

A credential scan examined 248 persisted non-PGDATA files for the exact raw
API token without printing it: zero matches. Live Docker-owned PGDATA was
excluded; no API credential was passed to PostgreSQL. The scan report is saved
as `credential-scan.json` in the Desktop root.

An initial OctoWoW input was unavailable (HTTP 410, deleted raw storage). Another
parsed successfully but export rejected duplicate zero-duration `Shadowflame
Spark` encounter identities at `2026-11-10T20:36:13.227Z`, map 469. The rejected
case is retained under `cases/octowow-ambiguous/` and corresponding
`parser_baseline_octowow_ambiguous_*` databases. A smaller downloadable
single-instance input was selected instead; the ambiguity guard is unchanged.

Reference exports use the existing `legacy.sh` selectors: `azerothcore`, `tbc`,
`octowow`, and `turtle` for Capybara. They are local client approximations, **not
certified production-identical datasets**. World item/creature templates remain
absent; item quality, gear and creature enrichment are incomplete. Both repeats
of a case clone exactly the same reference/input seed.

The Desktop root contains a detailed README, logical backups, scripts, input
objects, DBCs, source/binary/image provenance, SHA-256 manifests and per-case
`validation-summary.json` files. Its reproducible runner uses
`parser_baseline_<case>_{repeat_a,repeat_b,negative}` databases and refuses
existing names instead of overwriting evidence. API credentials are environment
only; production access was read-only HTTP, never database access or mutation.

Focused tests passed for `./scripts/parser-baseline`, `./database/authz` and
`./chronicle`. To keep test databases on the bind-mounted PostgreSQL server, a
local Go build overlay changed only dbtestutil's default connection port to
55440; per-test cloning remained enabled. An initial shared-DSN test invocation
failed due to concurrent database timezone updates and was corrected, not hidden.
Focused lint reported zero issues; external Python compilation and shell syntax
checks passed. No production code changed during this corpus expansion.

The final reproducibility audit added optional `BASELINE_RUN_ID` to the external
runner, validated against `[a-z0-9_]+`. It preflights all requested output paths
and database names before writing, rejects collisions, and namespaces outputs
under `results/<run-id>/<case>/`. Each parse uses a private copy of the input
object tree; immutable input/reference seeds and historical artifacts are
preserved. Helper Go commands resolve the caller's current Git checkout, not a
fixed child-worktree path.

An actual `portable_check_01` OctoWoW rerun using the current-checkout CLI completed
two parses (each 1 instance, 12 encounters, 181,936 events) and a negative control.
Strict repeat comparison found 25 fields; the negative control detected exactly
one `player_deaths` change. All three databases contain zero River jobs. Six
preflight rejection cases passed, including a later invalid case and an existing
run collision; existing output and historical input/reference checksums remained
unchanged. A fresh ID permits another direct run without editing scripts:

```sh
ROOT="$HOME/Desktop/parsing_snapshots"
bash "$ROOT/scripts/build-current.sh"
BASELINE_RUN_ID=portable_check_02 \
BASELINE_BINARY="$ROOT/bin/parser-baseline-current" \
  bash "$ROOT/scripts/run-corpus.sh" octowow
```

### Deterministic trash naming follow-up

The ordinary encounter-name fallback now chooses the most numerous nonempty
hostile display name, counting each eligible mob GUID once (not activity periods
or events), with alphabetical ties. Existing named/function/boss/authoritative
encounter precedence is unchanged. The previous fallback selected the first
hostile after activity-start sorting; tied starts could retain map iteration
order. No event ordering or remaining-hostile ordering was changed.

The `trash_names_01` Crusader rerun completed two parses and a negative control
using the updated current-checkout CLI. Each parse produced 3 instances, 106
encounters and 532,430 events. **All encounter names now match between repeats.**
The remaining strict differences are 19 Auchenai classification fields, 430
Hyjal remaining-hostile positions and 2,551 Hyjal classification fields (3,000
total). Exact-time event multiset and remaining-GUID multiset diagnostics account
for all of them as ordering/index assignment; no unexplained semantic changes
remain in this pair. Strict artifacts are still unequal and were not normalized.
The negative control still detects exactly one `player_deaths` change.

Results and diagnostic evidence are preserved under
`~/Desktop/parsing_snapshots/results/trash_names_01/crusader/`; all original
corpus resources remain intact. The naming regression tests exercise every
three-mob insertion order, majority over activity count and entry-ID grouping,
alphabetical ties, empty names and existing override priorities. The instances
subtree tests, ten race-enabled focused repetitions and focused lint passed.

### Bounded expansion to 100 real source logs

The Desktop corpus now contains **100 distinct, checksum-verified public source
logs**, 25 each for ChromieCraft, Crusader Storm, OctoWoW and Capybara. The 96 new
inputs total 436,517,949 compressed bytes and 4,327,224,232 expanded bytes, covering
10/10/13/12 selected map names respectively. Discovery used a fixed 30-day window,
bounded pages and size caps, serial requests and bounded 429/5xx retries. One
expanded-checksum mismatch was preserved as rejected evidence, not accepted.

All 96 new inputs finalized synchronous parsing at generation 1. **85 canonical
exports succeeded; 11 were rejected**, yielding 89 export fixtures including the
original four—not 100 successful baselines and not a repeat-parity result:

| Flavor | New inputs | New exports | Export rejects |
| --- | ---: | ---: | ---: |
| ChromieCraft | 24 | 19 | 5 |
| Crusader Storm | 24 | 23 | 1 |
| OctoWoW | 24 | 22 | 2 |
| Capybara | 24 | 21 | 3 |

The new exports contain 160 instances, 5,078 encounters and 32,248,118 events.
Six rejects have ambiguous encounter identities; five mismatch production's
expected instance count (three expected 2/found 1; two expected 3/found 4).
Causes remain uninvestigated. No identity/count guard was weakened, and local
reference datasets remain approximations without world item/creature templates.
These 96 fixtures received one parse/export attempt, not per-fixture repeats or
negative controls; earlier repeat/control evidence is retained separately.

Nine initial Capybara fixture-seeding failures were isolated to an unrelated
migration-default `Gehennas` realm colliding by name with production's actual
realm UUID/server. Fresh retry clones renamed only that unrelated default row,
preserved its metadata, and inserted the exact source realm identity. Original
seeds and failed databases remain intact. Eight retries exported; the ninth
hit an instance-count guard. This was external fixture setup, not a parser fix.

All artifacts are streamed directly to gzip (967,625,067 bytes total), with
per-input summaries and database evidence retained. Filesystem growth was about
14.2 GiB, below the 35 GiB budget; about 80.9 GiB remained free, above the 50 GiB
reserve. All 105 retained database attempts have zero River jobs. Latest outcomes
are in `~/Desktop/parsing_snapshots/expansion_100/final-summary.json` and
`corpus-index.csv`; each batch includes exact input/binary/generation provenance,
checksums and database audits. All 100 accepted inputs have distinct expanded
hashes. Historical input/reference/artifact checksums and original seeds remain
unchanged; original container/volume are retained.

Seven mocked acquisition-safety tests, Python compilation, guarded seeder build
and `go vet`, replay collision/ID rejection checks, and checksum audits passed.
A scan of 1,569 persisted non-PGDATA files found zero exact raw-token matches;
credentials remained environment-only. Production access was read-only HTTP.
No production database access or mutations occurred. The Desktop expansion
README documents full commands, caps, retries, retained rejects and limitations.

The remainder of this document records the earlier ChromieCraft-only run.

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

## Narrow ordering diagnosis

A read-only diagnostic compared the two unchanged artifacts at exact absolute
millisecond timestamps, within each canonical encounter:

| Encounter | Classification records | Timestamp groups | Full-record multiset mismatched times | Mismatched times excluding only `meta.index` |
| --- | ---: | ---: | ---: | ---: |
| 0 | 656 | 461 | 7 | 0 |
| 1 | 164 | 99 | 3 | 0 |
| 2 | 554 | 355 | 2 | 0 |

The event-index **sequence** is equal in each encounter, but different targets
receive those indices. Thus complete records, even treated as equal-time
multisets, are **not identical**. Excluding only `meta.index` diagnostically,
equal-time multisets are identical, including target, type, affiliation,
owner/controller, spell and all other metadata. No value discrepancy beyond
index assignment was found for this pair. This is not permission to discard
indices or event ordering, and does not prove other fixtures behave the same.
The private diagnostic saved no changed baseline artifacts.

The exact unordered emission path is:

1. `characters/lookup.go`: `activityChanged` is a Go `map[Character]struct{}`;
   `notifyActivityChanged` ranges that map into a slice (lines 223-234).
2. `instances/classificationemitter.go:31-34`: `ActivityChange` emits in that
   supplied slice order; `emitClassification` materializes each unit's values.
3. `instances/hookable.go:291-296`: the callback forwards events to the active
   fight's builder.
4. `encounterevents/encounterevents.go:293-294,366-368`: classification events
   receive sequential indices and are appended in emission order.

The fight-start/end `emitAllActive` path is **not itself an unordered Go map**:
`characterset.Set.ForEach` walks an ordered map oldest-first. Do not incorrectly
attribute this issue to that loop or to the character catalog lookup.

Remaining-enemy GUIDs are set-valued in the inspected code: `Fight.EndStates`
ranges the map of unique hostiles and appends timeout IDs
(`encounter/encounter.go:124-141`); `fightEncounter` assigns this collection to
`Remaining` (`instances/hookable.go:1147-1153`). The instance UI builds a `Set`
and uses membership tests (`InstancePageView.tsx:446-470`). In this fixture the
three collections have 15, 1 and 0 unique GUIDs; all three multisets match, and
only the first collection's order differs. No sorting change was made.


## Vanilla parsernext baseline-engine comparison

The baseline CLI now accepts `run --engine legacy|parsernext-vanilla`. Production
selection remains unchanged. This validation used only the saved local Capybara
corpus and fresh isolated database clones; it did not acquire new inputs.

### Independent decoder and preserved evidence

- Candidate semantic code: `960eb2357` (baseline engine seam).
- Independent legacy decoder: all production `parserv2` source overlaid from
  `8122f7c20`, before the parsernext lexical/record/state extractions.
- Synthetic processing, consumers, finalization, publication and the canonical
  exporter were intentionally identical shared code in both binaries.
- Private evidence: `~/Desktop/parsing_snapshots/results/vanilla_engine_02/`.
  Each fixture retains both complete gzip canonical exports, exclusive run
  provenance, binary hashes, logs, strict JSONL differences and diagnostic output.
- The historical seed was at schema 341. An initial run in `vanilla_engine_01`
  rejected both engines on the missing `raw_files_pinned` column. That evidence
  remains preserved. Subsequent runs migrated only fresh clones to current schema.
- Go omitted embedded VCS settings in this environment. The full-corpus build
  manifest pins the exact checkout and legacy overlay hashes separately. A fresh
  paired control in `vanilla_engine_03`, built at `6dead0da3` using the standard
  `version.GitCommit` linker input, verifies exact revision-bearing provenance.
  Changes after `960eb2357` concern provenance and selection tests, not semantics.

### Complete canonical export results

All 25 saved Capybara inputs were attempted in both engines. Of these, **22 pairs
exported successfully**, covering **52 instances, 1,586 encounters and 11,791,956
persisted events** per engine. Two pairs were strictly equal. Twenty pairs retained
3,741 exact differing fields:

| Difference | Fields | Diagnostic finding |
| --- | ---: | --- |
| Unit-classification event positions | 3,487 | Same-timestamp payload multisets match when only event index is ignored in separate diagnostic copies. |
| Remaining-hostile array positions | 249 | All 44 affected arrays have identical multisets. |
| `talent_builds.sub_spec` | 5 | Real persisted Bear/Cat differences; not normalized away. |

All other fields in the complete canonical exports matched. Strict artifacts and
strict differences remain unchanged; diagnostic equivalence is **not** a strict
parity verdict.

Three inputs were rejected symmetrically by the exporter: two for ambiguous
encounter semantic identities (`instance/1` and `instance/0` respectively), and
one for expecting three published instances but finding four. No fallback or
relaxed identity/count check was used; those pairs have no comparable export.
Exact fixture identifiers and errors are retained in the private run summary.

### Existing publication nondeterminism

Four additional legacy-only parses of one affected fixture, in
`vanilla_engine_04`, produced two independent old/old pairs. Both reproduced the
same `talent_builds.sub_spec` Bear/Cat difference. This field remains part of the
strict comparison.

The publisher iterates maps in `chronicle/logparse.go` before calling
`UpsertTalentBuild`. That SQL conflicts on `(dataset_id, player_class,
talent_layout)` but updates `sub_spec`, so different Bear/Cat observations of the
same layout compete by write order. This validation does not change that policy.
A separate deterministic publication decision is needed before claiming strict
repeatable parity for these fixtures.

### Safety and checks

The runner maintained a 50 GiB free-disk floor and ended with approximately
55.5 GiB free. Only its own successful transient clones were released after their
complete gzip exports were validated. Historical inputs, seeds, databases and
prior evidence were preserved; failed clones remain available for investigation.
Every attempted run had zero River jobs.

The full baseline CLI test package and baseline-specific Chronicle integration
tests passed under the race detector using isolated local test databases.
Targeted lint passed. Tests cover invalid engines, unsupported formats before
worker side effects, the unchanged production default, and exclusive separate
provenance. Next work is resolving the explicit exporter/publication blockers,
not production activation, snapshot codecs or classification-policy changes.
