# Instance Advanced Search — design draft

Status: draft (2026-11-02). Nothing implemented yet.

## Goal

Let users combine an open-ended set of predicates ("kill on Ragnaros", "≥3 priests",
"kill-time parse ≥90 on Rag and Domo", "a player used both Bear and Cat", …) with
AND/OR/NOT and run them against the existing normalized tables. No denormalized
search table.

## Shape

```
UI (query-builder tree)  ──JSON AST──▶  Go: validate ▶ compile ▶ execute
                                         │            │
                                 predicate registry  one SQL template per predicate,
                                 (allowlist)         emitted as correlated EXISTS /
                                                     scalar subquery
```

- **Canonical format:** JSON AST. Optional CEL text syntax later (cel-go for
  parse + type-check only; we walk the checked AST ourselves). cel2sql is not
  usable: it is single-table only, with no joins/EXISTS over related tables.
- **Nodes:** `and`, `or`, `not`, `pred{name, args, op, value}`, and scoped
  quantifiers (see below).
- **Predicate registry:** each entry declares its scope, typed args, allowed
  operators, and a SQL template. Unknown names/ops/types are rejected. User
  values only ever become `$n` bind params; SQL text only comes from templates.
- **Lazy joins:** a child table appears in the SQL only if a predicate that
  needs it is in the tree. Use `EXISTS` / scalar subqueries, never JOINs on
  child tables (no row multiplication, plans as semi-joins).
- **Dynamic SQL** lives in one isolated package — an approved exception to the
  "always sqlc" rule. The fixed parts (frame, visibility, tenancy) stay in that
  package as constants, not user-controlled.

### Scoped quantifiers

Some predicates must hold for the *same* entity, not just somewhere in the
instance. Example: "a person uses both Bear and Cat at some point" is not
`has_sub_spec(Bear) AND has_sub_spec(Cat)` (that could be two different druids).
So the AST has quantifier nodes that open a new scope:

```json
{ "any_player": { "and": [
    { "pred": "used_sub_spec", "value": "Bear" },
    { "pred": "used_sub_spec", "value": "Cat" }
]}}
```

compiles to

```sql
EXISTS (
  SELECT 1 FROM log_instance_players p
  WHERE p.instance_id = li.id
    AND EXISTS (SELECT 1 FROM encounter_dps_rankings r
                WHERE r.instance_id = li.id AND r.player_guid = p.unit_guid::text
                  AND r.player_sub_spec = $1)
    AND EXISTS (SELECT 1 FROM encounter_dps_rankings r
                WHERE r.instance_id = li.id AND r.player_guid = p.unit_guid::text
                  AND r.player_sub_spec = $2)
)
```

Scopes: `instance` (root) → `player` (`any_player`, `count_players op N`) and
`encounter` (`any_encounter`, `each_of_bosses [..]`). Each registry entry says
which scope(s) it is valid in; the validator rejects a player predicate used at
the instance scope, etc. `count_players(<subtree>) op N` covers "≥3 Holy Priests".

## Tenancy, RLS, visibility (non-negotiable)

Instances belong to realms, and realms belong to tenants. RLS is enforced on
`wow_servers` → `wow_server_realms` (via `app.tenant_id`, set per connection by
`database.PrepareConnFunc`). `log_instances` and its child tables have no
policies of their own, so every search goes through a fixed outer frame that
the user tree cannot alter:

```sql
SELECT li.id, ...
FROM log_instances li
JOIN wow_server_realms wsr ON wsr.id = li.realm_id       -- RLS tenant scope
JOIN parsed_log_group plg ON plg.id = li.log_group_id
JOIN wow_log_groups wlg ON wlg.id = plg.id
  AND plg.parse_generation = wlg.parse_generation
  AND plg.finalized_at IS NOT NULL
  AND NOT wlg.unlisted
WHERE li.invalidated_at IS NULL
  AND <one row per COALESCE(li.duplicate_group_id, li.id)>  -- dupes collapse to 1
  AND ( <compiled user tree> )
ORDER BY <sort>, li.id
LIMIT $n                                                 -- keyset pagination
```

Rules:
- Run through the normal `database.Store` connection so `app.tenant_id` is
  set; never with `app.tenant_bypass`.
- The frame is emitted by code, not by the tree.
- Tables that carry their own `tenant_id` without RLS (`parse_score_results`,
  `time_parse_scores`) get `tenant_id = <current tenant>` bound inside the
  subquery by the template, never from user input.
- `encounter_dps_rankings` has RLS (via realm); still correlate on `instance_id`.
- Read-only tx, `SET LOCAL statement_timeout`, max node count / depth, rate
  limit. No required date range: results are paginated + limited. Query
  complexity limits may be lower for non-Honored members (supporter tier).
- Duplicate uploads collapse to one logical run
  (`COALESCE(duplicate_group_id, id)`, index `idx_log_instances_logical_run`).

## Predicate catalog (from existing tables)

Legend: ✅ data + index exist · ⚠️ data exists, caveat · ❌ no data source

### Instance scope (`log_instances`, frame)

| Predicate | Source | Status |
|---|---|---|
| zone / instance name | `li.name` (+ `server_upload_meta.instance_name` fallback) | ⚠️ no index on name |
| realm | `li.realm_id` | ✅ `idx_log_instances_realm_id` |
| date | `li.start_time` / `end_time` | ⚠️ no index; list queries use MIN(encounter.start_time) |
| uploading guild | `li.guild_id` | ✅ `idx_log_instances_guild` |
| difficulty / max players | `li.difficulty_name`, `li.max_players` | ✅ |
| category raid/dungeon | `li.category` | ✅ |
| recorder name | `li.recorder_name` | ✅ |
| has video | `log_instance_youtube_timestamped` | ✅ |

### Time parses (`time_parse_scores` + `time_parse_boss_scores`)

One `time_parse_scores` row per (tenant, instance, policy_version,
query_version, lookback_days), with per-boss rows in `time_parse_boss_scores`.
The template pins the contract (current policy/query version + a lookback the
UI picks, default all-time) and the tenant, so the user only picks the score
scope and threshold.

| Predicate | SQL sketch | Status |
|---|---|---|
| clear-time parse `op N` (server/realm/guild) | `tps.clear_<scope>_display_score op $` | ✅ idx `(tenant_id, instance_id, policy, query, lookback)` |
| clear time `op` | `tps.clear_duration_ms` or `instance_speedruns.duration_ms` | ✅ |
| kill-time parse `op N` on **each / any** of bosses [..] | `time_parse_boss_scores.<scope>_display_score` joined by `time_parse_score_id`, `encounter_name = ANY($)`; "each" = `count(DISTINCT encounter_name) = cardinality($)` | ✅ PK `(time_parse_score_id, encounter_id)` |
| kill time `op` on boss(es) | `time_parse_boss_scores.duration_ms` (or encounter end-start) | ✅ |
| boss / trash / idle time `op` | boss = Σ boss encounter durations; trash = Σ non-boss encounter durations in the clear window; idle = clear − boss − trash. Same definition as `speedruns.sql` (guild history). `instance_overview_metrics` (`total_boss_duration_ms`, `total_combat_duration_ms`, `encounter_span_duration_ms`) is a cheaper precomputed alternative — pick one so the numbers match the Guild History page | ⚠️ choose source |

### Encounter scope (`log_instance_encounters`, idx on `instance_id`)

| Predicate | SQL sketch | Status |
|---|---|---|
| outcome on boss(es): clean/partial/wipe/reset | `EXISTS (… e.name = ANY($) AND e.kill_type = $)` | ✅ |
| # wipes / attempts on boss `op N` | `(SELECT count(*) … e.name=$ AND e.kill_type='wipe') op $` | ✅ |
| bosses killed count `op N` | count where `boss AND kill_type IN (clean,partial)` | ✅ |
| total wipes / deaths in instance | `instance_overview_metrics.wipe_count`, `player_deaths` | ✅ PK instance_id |

### Player scope (`log_instance_players`, idx `instance_id`, `(unit_guid, instance_id)`)

| Predicate | SQL sketch | Status |
|---|---|---|
| is player (name/guid) | `p.unit_guid = $` | ✅ |
| class / race | `p.class`, `p.race` | ✅ |
| in guild(s) X,Y | `p.guild_id = ANY($)` | ✅ |
| spec / sub-spec used (on any / specific boss kill) | `encounter_dps_rankings.player_spec / player_sub_spec` (e.g. Feral + Bear/Cat) | ✅ spec known on boss kills only |
| parse on boss(es) `op N` (dps/hps) | `parse_score_results.display_score`, bind tenant | ⚠️ dedupe semantics must match the instance page |
| dps/hps on boss `op N` | `encounter_dps_rankings.dps/hps` | ✅ idx `(instance_id, encounter_name)` |
| deaths on boss `op N` | `encounter_dps_rankings.player_deaths` | ⚠️ kills only, nullable |
| avg ilvl `op N` | `encounter_dps_rankings.avg_ilvl` | ⚠️ kills only |

Counts at instance scope are `count_players(<player subtree>) op N`: "≥3
priests", "≥2 Holy Paladins", "≥10 members of guild X".

### Not available today

| Predicate | Why |
|---|---|
| deaths on a boss including wipes | only in `log_instance_events` bytea blobs; needs a rollup |

## Pagination & sorting

Keyset pagination on `(sort_key, li.id)` like `ListRecentInstances`. v1 sorts:
date (default), clear time, clear-time parse.

## Next steps

1. Freeze v1 predicate set (✅ rows) and the boss/trash/idle source.
2. Go package: AST types, registry, validator, compiler + golden SQL tests,
   including tenancy tests (a tree can never escape the frame or see another
   tenant's instances).
3. Endpoint + `EXPLAIN ANALYZE` on prod-scale data for the worst predicates.
4. UI with react-querybuilder driven by a registry endpoint (fields, ops, arg
   types, scopes).
