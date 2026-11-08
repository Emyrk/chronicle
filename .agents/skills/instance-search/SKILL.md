---
name: instance-search
description: >
  Advanced instance search for Chronicle: a JSON query tree (and/or/not, any_player,
  count_players, any_encounter, count_encounters, field predicates) compiled to one
  parameterized, tenant-safe SQL query by internal/instancesearch. Use when: writing or
  explaining a search query, translating a natural-language question ("raids with 3+ priests
  and a 95 clear parse") into a query, adding a searchable field, or touching the compiler.
advertise: true
---

# Instance Search

Package: `internal/instancesearch`. Design: `docs/instance-search.md`.
Field list (generated, always current): [fields.md](fields.md).
Worked examples: `internal/instancesearch/testdata/examples/*.json`. The matching `.golden.sql` shows the query as CEL-style text (`FormatCEL`, display only; there is no CEL parser yet) and the SQL it compiles to. Reading the CEL headers is the fastest way to learn the language:

```
players.filter(p, p.class == "PRIEST").size() >= 3
&& players.exists(p, p.sub_spec == "Bear" && p.sub_spec == "Cat")
&& instance.kill_time_parse({"bosses": ["Ragnaros", "Majordomo Executus"], "match": "each"}) >= 90
&& "unit-position" in instance.capabilities
```

## Endpoint

`POST /api/v1/raidlogs/search` with the query as the JSON body. It returns `{results, next}`. The handler is `api/instance_search.go`, and the wire types are `chroniclesdk.InstanceSearch*`; TypeScript types are generated.

| Status | Meaning |
|---|---|
| 200 | results |
| 400 | invalid query; `detail` names the bad path, e.g. `where.and[1].field: unknown field "x"` |
| 403 | anonymous caller used something beyond the anonymous subset; prompt them to log in |
| 422 | the query hit the 5s statement timeout; narrow it with zone, realm or date |
| 429 | rate limited; obey `Retry-After`. "too complex" means the query costs more than the whole bucket |
| 503 | too many searches running at once; retry in a second |

**Response headers.**
- Every response carries the caller's bucket: `RateLimit-Limit`, `RateLimit-Remaining` and `RateLimit-Reset` (seconds until full).
- Every response for a query that compiled also carries `Chronicle-Search-Cost`, the query's static compiled cost. That includes 403, 429 and 503. Only a 400 for an invalid query has no cost.
- After a query runs and its runtime charge is recorded, the response also carries `Chronicle-Search-Runtime-Cost`; the UI shows the static + runtime total and breakdown.
- Refused, invalid and login-required requests spend nothing.
- A 503 (busy) refunds the static cost because the query never ran.
- Once execution starts, cancellation, timeout and query errors retain the static cost and add a runtime charge of 10 tokens per second, rounded up to whole tokens. The post-query charge may make `RateLimit-Remaining` negative; normal searches stay blocked until refill clears the debt.

**Why a run matched:** `POST /api/v1/raidlogs/search/explain` with `{"query": {...}, "instance_id": "..."}` returns `{matched, evidence}`.
- `evidence` mirrors the query tree node for node: `children` line up with `and`/`or`/`not`, and each witness's `evidence` lines up with its quantifier's subtree.
- Each node has `ok`: `true`/`false`, or `null` when the value is missing (SQL unknown). Unknown never matches, even under `not`, the same as the search.
- Field nodes carry `value`, or `rows` (`{name, value, ok}` per boss or fight, limited to the requested `bosses`) for per-fight fields.
- Quantifier nodes carry `count` and up to 5 `witnesses` (players: `name, guid, class`; pulls: `name, encounter_id, outcome, duration_ms`).
- Same rules as search: the anonymous subset, rate limit, concurrency cap and timeout. It costs `1 + search cost / 4`, and runs the caller can't see are 404.

**Bucket status without searching:** `GET /api/v1/raidlogs/search/limit` returns `{logged_in, limit, remaining, refill_per_minute, reset_seconds}` and the same headers. It spends nothing.

**Anonymous users** (`instancesearch.CheckAnonymous`) can only send:
- up to 6 predicates ANDed together
- fields from `instance.name`, `realm`, `guild`, `started_at`, `difficulty`, `category`
- no quantifiers, `or` or `not`
- a page size of at most 25

They have a per-IP bucket. Everything else returns 403 "Log in to use advanced search."

**Supporter tiers.** Each field has a `MinimumTier` (empty = free), published as `minimum_tier` in `GET /search/fields` and in `fields.md`. The costly fields need Honored: `player.parse`, `player.dps`, `player.hps`, `player.avg_ilvl`, `instance.boss_time_ms`, `instance.trash_time_ms`, `instance.idle_time_ms`. `serviceinstancesearch.run` checks every field in `Compiled.Fields`, which includes fields nested in `and` / `or` / `not` and the quantifiers, against the caller's tier. Below the minimum it returns `ErrSupporterRequired` with `RequiredTier` and `RequiredField`: a 403 "Searching by <field> is an Honored supporter perk.", uncharged. Search and explain share this path, and so do session users, bearer tokens, AI keys (`/api/external/v1`, a key acts at its owner's tier) and in-process callers (Discord bot, site assistant). Anonymous callers get the log-in 403 first. Sorts have their own `minimum_tier` (below). The Blocks / Code editor lock is UI-only: the server does not gate query shapes.

**Cost.** `Compiled.Cost` adds up per-field weights (`field.Cost`, default 2), plus 2 per `or`, 1 per `not`, 4 per `any_*` and 10 per `count_*`, plus a base of 1. The rate limiter charges that static cost before execution, then 10 additional tokens per second of execution (rounded up):
- logged-in users: 60 tokens a minute, with burst 100 for free users, 300 for Honored, 800 for Revered and 2000 for Exalted
- anonymous: 20 tokens a minute, burst 40 per IP

Give an expensive new field a higher `Cost`.

UIs can show the cost before running: `GET /api/v1/raidlogs/search/fields` returns each field's `cost` plus `cost_base`, `cost_or`, `cost_not`, `cost_any` and `cost_count`. The search page computes it live (`searchCost.ts`), and a frontend test checks it against the compiled cost of every example.

**Observability.**
- `chronicle_instance_search_duration_seconds{outcome,caller}`
- `chronicle_instance_search_cost{caller}`
- `chronicle_instance_search_field_uses_total{field}`
- Searches slower than 2s, or that time out, are logged with their `FormatCEL` text.

## Query shape

```json
{
  "where": <node>,
  "sort": {"field": "instance.clear_time_ms", "direction": "asc"},
  "limit": 25,
  "cursor": <the previous response's next>
}
```

`where` is optional (omit = every visible run). `limit` defaults to 25, max 100. Without `sort`, results are newest first. Sorting uses a fixed allowlist returned by `GET /search/fields` as `sorts`:

| Property | Default | Minimum tier | Added cost |
|---|---:|---:|---:|
| `instance.started_at` | desc | free | 0 |
| `instance.name` | asc | free | 0 |
| `instance.realm` | asc | free | 0 |
| `instance.guild` | asc | free | 0 |
| `instance.difficulty` | asc | free | 0 |
| `instance.max_players` | desc | free | 0 |
| `instance.player_count` | desc | Honored | 8 |
| `instance.bosses_killed` | desc | Honored | 4 |
| `instance.clear_time_ms` | asc | Honored | 4 |
| `instance.idle_time_ms` | asc | Honored | 20 |
| `instance.boss_time_ms` | asc | Honored | 20 |
| `instance.kill_time_ms` | asc | Honored | 6 |
| `instance.deaths` | asc | Revered | 4 |
| `instance.wipes` | asc | Revered | 4 |
| `instance.clear_parse` | desc | Revered | 6 |

`instance.clear_parse` accepts `parse_scope: "server" | "realm" | "guild"`. `instance.kill_time_ms` requires one `boss` name and sorts by that boss's fastest clean/partial kill in each run. Directions are `asc` and `desc`; missing values always sort last. Free sorts are also available to anonymous callers whose query otherwise fits the anonymous subset. Pass the returned `next` object back unchanged as `cursor`; it pins the normalized sort and keyset value.

A **node** sets exactly one of:

| Node | Meaning |
|---|---|
| `{"and": [node, ...]}` | all children match |
| `{"or": [node, ...]}` | any child matches |
| `{"not": node}` | child does not match |
| `{"any_player": node}` | some player in the run matches the node |
| `{"count_players": {"where": node, "op": ">=", "value": 3}}` | number of distinct matching players compared to value (`where` optional = all players) |
| `{"any_encounter": node}` | some encounter (one pull) matches |
| `{"count_encounters": {"where": node, "op": ">=", "value": 5}}` | number of matching pulls compared to value |
| `{"field": "...", "op": "...", "value": ...}` | a predicate from [fields.md](fields.md) |

Predicate options (only on fields that list them):

- `bosses: ["Ragnaros", ...]` restricts a boss-based field to those encounter names.
- `match: "any"` (default) means any listed boss satisfies it. `"each"` means every listed boss must satisfy it, and requires `bosses`.
- `parse_scope: "server" | "realm" | "guild"` picks the time-parse cohort (default `server`).
- `metric: "dps" | "hps"` picks the metric for `player.parse` (default `dps`).
- `on: "bosses" | "trash" | "any"` picks which fights per-fight player fields read (spec, sub_spec, role, dps, hps, deaths, avg_ilvl). The default is `bosses`.
  - Each player has one row per boss kill, plus one aggregated trash row per spec, so `bosses` and `trash` are exact complements.
  - `bosses` and `match` only apply with `on: "bosses"`.

Ops: numbers/times use `= != < <= > >= between`; `between` takes `[low, high]` and includes both ends (for a whole day, end at `T23:59:59Z`). Free-text strings use `= != in not_in contains starts_with`. Enums and UUIDs use `= != in not_in`, with a JSON list for `in`/`not_in`. Booleans use `= !=`. Times are RFC 3339 strings. Durations are milliseconds.

## Scopes: the one rule that matters

Fields are prefixed by the row they describe, and must be used in that scope:

- `instance.*` at the top level only (not inside a quantifier).
- `player.*` only inside `any_player` / `count_players`.
- `encounter.*` only inside `any_encounter` / `count_encounters`.

Quantifiers can't nest inside each other. Everything inside one `any_player` refers to **the same player**:

```json
{"any_player": {"and": [
  {"field": "player.sub_spec", "op": "=", "value": "Bear"},
  {"field": "player.sub_spec", "op": "=", "value": "Cat"}
]}}
```

This means one druid played both Bear and Cat. Two separate `any_player` nodes ANDed together would allow two different druids. The same applies to encounters: "Ragnaros was killed" is `any_encounter(name = Ragnaros AND killed = true)`, and the name and outcome must sit in the same quantifier.

## Translating questions

| Question | Query |
|---|---|
| "3+ priests" | `count_players(where player.class = PRIEST) >= 3` |
| "2+ Holy paladins" | `count_players(where class = PALADIN and spec = Holy) >= 2` |
| "Thrall parsed 95+ on Rag" | `any_player(name = Thrall and player.parse >= 95, bosses [Ragnaros])` |
| "killed Rag, never wiped on it" | `any_encounter(name=Ragnaros, killed=true) AND NOT any_encounter(name=Ragnaros, outcome=wipe)` |
| "5+ wipes on Nefarian" | `count_encounters(where name=Nefarian and outcome=wipe) >= 5` |
| "kill parse 90+ on Rag **and** Domo" | `instance.kill_time_parse >= 90, bosses [...], match each` |
| "fast clear" | `instance.clear_parse >= 95` (or `instance.clear_time_ms <= N`) |
| "little downtime" | `instance.idle_time_ms < 300000` |
| "tanked trash as Bear, Cat on bosses" | `any_player(sub_spec = Bear on trash AND sub_spec = Cat on bosses)` |
| "nobody died on Rag" | `NOT any_player(player.deaths >= 1, bosses [Ragnaros])` plus a Rag kill |
| "logs with positions and resources" | `instance.capability = unit-position AND instance.capability = unit-resources` |
| "logs without positions" | `instance.capability != unit-position` |
| "10+ from guild Alpha or Beta" | `count_players(where player.guild in [Alpha, Beta]) >= 10` |

## Semantics to keep in mind

- **Matching ignores case.**
  - Free-text strings (names, guilds, realms, specs, GUIDs) and boss lists are compared with `lower()` on both sides, so `"molten core"` finds `"Molten Core"` and `"RAGNAROS"` works in `bosses`.
  - Enum values accept any case (`"priest"` becomes `PRIEST`).
  - `=` / `in` are whole-value matches (exact, ignoring case).
  - For partial matches on text fields use `contains` (`"molten"` finds "Molten Core") or `starts_with`. Both ignore case. `%` and `_` are literal characters, not wildcards. Empty values are rejected.
  - Typo-tolerant matching isn't supported yet.
- **Missing data never matches.** Runs without a guild, without a clear (`clear_*`, `*_time_ms` parts), or without a computed parse don't match `=` or `!=`. Wrap the predicate in `not` to find "not X", which includes missing.
- **Spec, role, dps/hps, deaths and ilvl come from boss kills by default.** Use `on: "trash"` or `on: "any"` to include trash. Wipes are never counted, so wipe deaths aren't searchable yet.
- **Sub-spec values:** `Bear` / `Cat` (Feral druid), `Tank` / `DPS` (Enhancement shaman) and `Fury Prot`. It's empty for every other spec, and on servers whose parser doesn't infer sub-specs.
- **Roles:** `dps`, `heal`, `tank`.
- **Clear time, boss/trash/idle time and clear parse exist for full clears only.** Boss/trash/idle use the same calculation as the Guild History page.
- `encounter.killed` is `clean` or `partial`. `instance.kill_time_ms` uses kills only.
- **Duplicate uploads appear once.** One logical run per `duplicate_group_id`.
- **Parses are tenant-specific.** Time parses use the current scoring contract with a 60-day lookback.

## Safety model (don't break it)

- **Tenant scoping comes from RLS.** The fixed frame in `compile.go` (`frameSQL`) joins `wow_server_realms`, and its RLS policy applies `app.tenant_id`. The frame also filters to finalized, listed, non-invalidated logs. The tree only ever becomes one parenthesized `AND (...)` inside it.
- **`Search` reads the tenant from ctx** (`servicetenant.TenantIDFromContext`) and binds it into parse tables that have `tenant_id` but no RLS. Never run a search with `servicetenant.AdminBypass`.
- **User input never becomes SQL.** Field names select templates, and values are always `$n` bind params. Limits apply: 64 nodes, depth 8, 50 list values, limit 100, 5s statement timeout, all configurable via `Options`/`SearchOptions`.

## Adding a field

1. **Add an entry to `fields` in `fields.go`.** Give it a name with a scope prefix, plus the scope, type, optional `Bosses`/`ParseScope`/`Metric`, a one-line `Doc` and a `value` func returning `valueSQL`. The match condition and the explain evidence are both derived from `value`.
   - Reuse `column(expr)` for plain columns. `{a}` is the quantifier alias, and instance fields use `li`.
   - Reuse `rankingField(col)` for per-boss-kill player data.
   - For anything that needs any/each over bosses, return `valueSQL{Expr, From, Name}`: the condition then goes through `c.bossMatch`, and explain lists each row.
   - Only set `compile` when the comparison isn't "value op argument" (see `instance.capability`).
   - Correlate subqueries on `li.id`, and use `c.alias()` for every new alias.
   - Bind tenant-scoped tables with `c.tenant()` or `c.timeParseContract()`.
2. **Regenerate the generated files:** `go test ./internal/instancesearch -run 'TestExamplesGolden|TestFieldReference' -update`. This rewrites the golden SQL and `fields.md`. Review the diff.
3. **Add an example** in `testdata/examples/` if the field enables a new kind of question.
4. **Add a semantic case** in `search_test.go` (`TestSearch/Semantics`) with fixture data that proves it matches what it claims.
5. **Run the tests:** `go test -tags azerothcore ./internal/instancesearch`. This needs Postgres, and every example is executed against the real schema.
