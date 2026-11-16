# servicestats: public `/stats` answer pages

Server-rendered pages under `/stats/...` that answer one player question per
URL ("How much raiding is logged on WoW Forever?") with real numbers. Bots and
logged-out humans get the same HTML. The plan is `docs/ai-search-plan.md`
(sections 4 and 6, train `ai-answers`).

## How it works

```
River                                      Page request (GET or HEAD)
─────                                      ────────────
DispatchWorker (hourly)                    /stats/<...>
  └─ TenantWorker per discoverable site      └─ Handler
       RefreshTenant                              static page? → activity row read
         prune families unregistered > 7d         else most specific Family.Match
         threshold check (≤ every 6h)               → one GetStatsSnapshot (PK)
         ineligible → drop all pages                → Family.Render(site, page, snap)
         enqueue ArgsProducer per due family      shared layout (page spec)
  └─ ProducerWorker per (tenant, family)
       RefreshProducer
         Producer.Compute under its Timeout
         UpsertStatsSnapshot per Output ───────► stats_snapshots (tenant_id, page_key)
         delete the family's pages not emitted
         IndexNow ping for changed pages
```

- **Snapshots** live in `stats_snapshots`, one row per tenant and page key,
  behind tenant RLS. The root site is `tenant_id = uuid.Nil`. Each row records
  its `producer_key` (owning family), `sample_n`, `min_sample`, `computed_at`
  (every refresh; drives cadence and the visible "Updated" line) and
  `payload_changed_at` (only when the payload changes; drives sitemap
  `lastmod` and JSON-LD `dateModified`).
- **A page hit never runs an aggregate query.** It reads one snapshot row by
  primary key (a static page reads the tenant's `_activity` row). Site facts
  (server name, Turtle fork, discoverable) come from a per-tenant cache in the
  `api` package (`api/stats_pages.go`).
- **Tenant threshold** (`thresholds.go`): a tenant gets pages once it has
  `MinTenantRaids` listed raids or `MinTenantPlayers` distinct players in
  `ActivityWindow`, and keeps them until it drops below both `Keep*` values
  (hysteresis). Raids are counted first; the heavier player count runs only
  when raids don't decide it. Without pages every `/stats` URL is 404. The
  result is the internal `_activity` row, rechecked every `ActivityCadence`,
  and handed to producers as `Tenant.Activity`.
- **Page minimum sample** (`Output.MinSample`): below it the page still
  renders with `<meta name="robots" content="noindex">` (and `X-Robots-Tag`)
  and is left out of the sitemap. Query-parameter variants are noindex too.
- **404s:** unknown paths, percent-encoded variants of a path (`RawPath` set
  and different from `Path`, e.g. `/stats/%61bout`), non-discoverable sites
  (root or tenant) and pages without a snapshot. All are decided before any
  database read except the last. If the site lookup fails, a page with nothing
  behind it is still 404; only an existing page becomes 500.
- **Hidden sites:** the dispatch skips non-discoverable sites and deletes
  their pages (the activity row stays), so a site made discoverable again
  serves nothing stale; its pages return after its producers rerun.
- **Isolation:** every /stats job runs on its own River queue, `stats`
  (`QueueWorkers` workers), and every family in its own job with its own
  timeout (`Producer.Timeout`, default `DefaultProducerTimeout`), so a slow or
  failing producer never blocks the others or other queues. Producer jobs get
  one attempt: the next hourly tenant job re-queues a family that failed.
  Dispatch and tenant jobs run at default priority, ahead of producer jobs
  (low priority).
- **Cadence:** a family (or the threshold check) is due when
  `now − last run ≥ cadence − DispatchInterval/2`. A family's run marker is
  stamped with the time its job was queued (the River job's `CreatedAt`,
  passed to `RefreshProducer`), not when the run finished, so queue waits and
  compute time never push the next run back a tick. The slack absorbs the
  drift of River's periodic ticks, keeping an hourly family on every tick and
  a 6h family on every sixth.
- **Validation and shadowing:** a run's keys are all validated before the
  first write; one bad key fails the run and writes nothing. An output whose
  URL is served by another page (a static page, or a more specific family) is
  skipped with a warning, so it is never stored, listed in the sitemap or
  pinged. `New` rejects a static page that a family pattern also matches.
- **Pruning:** after a run, a family's pages it didn't emit are deleted (only
  that family's). Rows of a family that is no longer registered are kept for
  `UnregisteredRetention` (7 days) so a rolling deploy or rollback can still
  serve them. An internal `_ran:<family>` row records each family's last
  successful run, so a family that emitted nothing isn't rerun every hour.
- **Caching:** `Cache-Control: public, max-age=300, s-maxage=3600`.
- **Sitemap:** indexable stored pages of registered families that the family
  actually serves (path from `Family.PathForKey`, `lastmod =
  payload_changed_at`), plus the static pages when the tenant has any
  (`api/seo.go`, `loadSitemapURLs`).
- **IndexNow:** off unless `CHRONICLE_INDEXNOW_KEY` is set. Then the key is
  served at `/indexnow.txt` and producer runs ping IndexNow (best effort) with
  the indexable pages whose payload changed. Only discoverable tenants.

## The API

```go
type Producer interface {
	Key() string            // family key; owns Key() and Key()+"/..." page keys
	Cadence() time.Duration // rerun interval (rounded up to the hourly dispatch)
	Timeout() time.Duration // bound on one Compute; 0 = DefaultProducerTimeout
	Compute(ctx context.Context, tenant Tenant) ([]Output, error)
}

type Output struct {
	Key       string // PageKey(producer.Key(), params...)
	Payload   any    // stored as JSON
	SampleN   int
	MinSample int    // noindex + no sitemap below it
}

type Tenant struct {
	ID        uuid.UUID        // uuid.Nil = root site
	Row       *database.Tenant // nil for root
	Flavor    database.WoWFlavor
	DatasetID uuid.UUID
	Activity  Activity         // raids, players (if counted), eligibility
}

type Family struct {
	Pattern  string   // "/stats/about" or "/stats/{instance}/{boss}"
	Producer Producer
	Render   func(site Site, page Page, snap Snapshot) (Content, error)
}
// Family.Match(path) (key, ok) and Family.PathForKey(key) (path, ok) map
// between URLs and keys. Page carries Key, Path and Params (by name).

type StaticPage struct { Path string; Render func(site Site) Content }
```

Pattern parameters are lowercase slugs (`[a-z0-9]` words joined by `-`); the
page key is the family key followed by the parameter values in pattern order,
e.g. pattern `/stats/{instance}/{boss}` with family `boss` gives key
`boss/naxxramas/patchwerk`. When two families match a path, the one with a
literal segment at the first difference wins, so `/stats/{instance}/speedruns`
beats `/stats/{instance}/{boss}` for `/stats/naxxramas/speedruns`, and a
`boss/naxxramas/speedruns` output from the boss family is skipped. Families
that would match exactly the same paths, and static pages a family matches,
are rejected by `New`.

## Adding a page family

1. **Write a producer.** Run the expensive queries in `Compute`. `ctx` is
   already scoped to the tenant, so RLS limits every query to its data. Use
   `tenant.Flavor` / `tenant.DatasetID` to decide which instances or bosses
   exist (vanilla and wrath tenants differ). Return one `Output` per page the
   tenant should have, with the sample size its numbers rest on and the page's
   minimum sample. Put everything the page shows in the payload, including the
   window, so the text always matches the data. Honor `ctx`: it carries the
   timeout. Write SQL in `database/queries/*.sql` and run `make gen/db`.
   Prefer existing precomputed tables (parse spreads, summaries, census cache)
   over scanning raw logs, and reuse `tenant.Activity` instead of recounting.
   `tenant.Store` is the store to query with: `ctx` carries the tenant, so row
   level security scopes every query. `census.go` is a small worked example.
2. **Write a render func** `func(site Site, page Page, snap Snapshot)
   (Content, error)`. Decode the payload with `Decode[T](snap)` and read URL
   parameters from `page.Params`. No database access. Fill `Content` to meet
   the page spec:
   - `Title`: the player's question, with `site.Label()` (it adds
     "(Turtle WoW fork)" for Turtle forks). It is both `<title>` and `<h1>`.
   - `Lead`: 2-3 self-contained sentences, answer first, with the key number,
     "As of <FormatDate(snap.ComputedAt)>", the sample size and the window.
   - `SampleLabel` and `Window`: shown in the "Updated" line.
   - `Table`: the data as a real table. `Cell.Href` links rows into the SPA.
   - `Sections`: extra prose, each with an optional `Table` of its own.
     `Links`: SPA pages for the interactive view.
   - `Description` defaults to `Lead`.
   - Say what the numbers count: players seen in uploaded logs, not the
     server's population.
3. **Register it** in `DefaultFamilies` (`servicestats.go`). That is all the
   wiring: routing (GET and HEAD), the layout, the sitemap, noindex rules,
   caching, pruning and IndexNow come for free. A page with no snapshot
   behind it goes in `DefaultStaticPages` instead (see `methodology.go`).
4. **Test it**: render through `Service.Handler` with a fake store (see
   `handler_test.go`, including the parameterised family) and test the
   producer's SQL against a real database through `RefreshProducer` (see
   `refresh_test.go`; DB tests need `CHRONICLE_TEST_POSTGRES_PORT` or
   Docker). Keep tests independent of the build's flavor tags.

The shared layout is `layout.html.tmpl`; it renders the title/H1, lead,
"Updated" line with sample size, window and methodology link (snapshot pages
only), the table, sections, SPA links, canonical URL on the tenant's canonical
host, and WebPage JSON-LD. Every page links the methodology at
`/stats/methodology`. Never add `nosnippet`.

## Not here

- No user-agent checks: content must be identical for every client.
- No per-request queries beyond the snapshot read.
- No per-character or per-raid pages (doorway/thin-page risk, see the plan).
