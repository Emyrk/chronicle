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

**Anonymous users** (`instancesearch.CheckAnonymous`) can only send:
- up to 6 predicates ANDed together
- fields from `instance.name`, `realm`, `guild`, `started_at`, `difficulty`, `category`
- no quantifiers, `or` or `not`
- a page size of at most 25

They have a per-IP bucket. Everything else returns 403 "Log in to use advanced search."

**Cost.** `Compiled.Cost` adds up per-field weights (`field.Cost`, default 1), plus 2 per `any_*` and 3 per `count_*`, plus a base of 1. The rate limiter charges that many tokens:
- logged-in users: 120 tokens a minute, burst 300
- anonymous: 20 tokens a minute, burst 40 per IP

Give an expensive new field a higher `Cost`.

**Observability.**
- `chronicle_instance_search_duration_seconds{outcome,caller}`
- `chronicle_instance_search_cost{caller}`
- `chronicle_instance_search_field_uses_total{field}`
- Searches slower than 2s, or that time out, are logged with their `FormatCEL` text.

## Query shape

```json
{
  "where": <node>,
  "limit": 25,
  "cursor": {"started_at": "...", "id": "..."}
}
```

`where` is optional (omit = every visible run). `limit` defaults to 25, max 100. Results are newest first; pass the returned `next` as `cursor` for the next page.

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

Ops: numbers/times use `= != < <= > >=`. Strings, enums and UUIDs use `= != in not_in`, with a JSON list for `in`/`not_in`. Booleans use `= !=`. Times are RFC 3339 strings. Durations are milliseconds.

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
| "nobody died on Rag" | `NOT any_player(player.deaths >= 1, bosses [Ragnaros])` plus a Rag kill |
| "logs with positions and resources" | `instance.capability = unit-position AND instance.capability = unit-resources` |
| "logs without positions" | `instance.capability != unit-position` |
| "10+ from guild Alpha or Beta" | `count_players(where player.guild in [Alpha, Beta]) >= 10` |

## Semantics to keep in mind

- **Missing data never matches.** Runs without a guild, without a clear (`clear_*`, `*_time_ms` parts), or without a computed parse don't match `=` or `!=`. Wrap the predicate in `not` to find "not X", which includes missing.
- **Spec, role, dps/hps, deaths and ilvl come from boss kills only.** Wipes and trash are not counted. Wipe deaths aren't searchable yet.
- **Clear time, boss/trash/idle time and clear parse exist for full clears only.** Boss/trash/idle use the same calculation as the Guild History page.
- `encounter.killed` is `clean` or `partial`. `instance.kill_time_ms` uses kills only.
- **Duplicate uploads appear once.** One logical run per `duplicate_group_id`.
- **Parses are tenant-specific.** Time parses use the current scoring contract with a 60-day lookback.

## Safety model (don't break it)

- **Tenant scoping comes from RLS.** The fixed frame in `compile.go` (`frameSQL`) joins `wow_server_realms`, and its RLS policy applies `app.tenant_id`. The frame also filters to finalized, listed, non-invalidated logs. The tree only ever becomes one parenthesized `AND (...)` inside it.
- **`Search` reads the tenant from ctx** (`servicetenant.TenantIDFromContext`) and binds it into parse tables that have `tenant_id` but no RLS. Never run a search with `servicetenant.AdminBypass`.
- **User input never becomes SQL.** Field names select templates, and values are always `$n` bind params. Limits apply: 64 nodes, depth 8, 50 list values, limit 100, 5s statement timeout, all configurable via `Options`/`SearchOptions`.

## Adding a field

1. **Add an entry to `fields` in `fields.go`.** Give it a name with a scope prefix, plus the scope, type, optional `Bosses`/`ParseScope`/`Metric`, a one-line `Doc` and a `compile` func.
   - Reuse `column(expr)` for plain columns. `{a}` is the quantifier alias, and instance fields use `li`.
   - Reuse `rankingField(col)` for per-boss-kill player data.
   - Reuse `c.bossMatch` for anything that needs any/each over bosses.
   - Correlate subqueries on `li.id`, and use `c.alias()` for every new alias.
   - Bind tenant-scoped tables with `c.tenant()` or `c.timeParseContract()`.
2. **Regenerate the generated files:** `go test ./internal/instancesearch -run 'TestExamplesGolden|TestFieldReference' -update`. This rewrites the golden SQL and `fields.md`. Review the diff.
3. **Add an example** in `testdata/examples/` if the field enables a new kind of question.
4. **Add a semantic case** in `search_test.go` (`TestSearch/Semantics`) with fixture data that proves it matches what it claims.
5. **Run the tests:** `go test -tags azerothcore ./internal/instancesearch`. This needs Postgres, and every example is executed against the real schema.
