# servicestats: public `/stats` answer pages

Server-rendered pages under `/stats/...` that answer one player question per
URL ("How much raiding is logged on WoW Forever?") with real numbers. Bots and
logged-out humans get the same HTML. The plan is `docs/ai-search-plan.md`
(sections 4 and 6, train `ai-answers`).

## How it works

```
River (hourly)                         Page request
──────────────                         ────────────
DispatchWorker                         GET /stats/<page>
  └─ TenantWorker per tenant + root      └─ Handler
       RefreshTenant                          one GetStatsSnapshot (primary key)
         threshold check (≤ every 6h)         Page.Render(site, snapshot)
         Producer.Compute for due pages       shared layout (page spec)
         UpsertStatsSnapshot  ──────────►  stats_snapshots (tenant_id, page_key)
         IndexNow ping on change
```

- **Snapshots** live in `stats_snapshots`, one row per tenant and page key,
  behind tenant RLS. The root site is `tenant_id = uuid.Nil`.
- **A page hit never runs an aggregate query.** It reads one snapshot row by
  primary key. Site facts (server name, Turtle fork, discoverable) come from a
  per-tenant cache in the `api` package (`api/stats_pages.go`).
- **Tenant threshold** (`thresholds.go`): a tenant needs at least
  `MinTenantRaids` listed raids or `MinTenantPlayers` distinct players in
  `ActivityWindow`. Below both, the job deletes the tenant's page snapshots, so
  every `/stats` URL is 404. The check is stored as the internal `_activity`
  row and rerun every `ActivityCadence`.
- **Page minimum sample** (`Page.MinSample`): below it the page still renders
  but has `<meta name="robots" content="noindex">` (and `X-Robots-Tag`) and is
  left out of the sitemap. Query-parameter variants and non-discoverable sites
  are noindex too.
- **Caching:** `Cache-Control: public, max-age=300, s-maxage=3600`.
- **Sitemap:** indexable pages are added to the tenant sitemap with
  `lastmod = computed_at` (`api/seo.go`, `loadSitemapURLs`).
- **IndexNow:** off unless `CHRONICLE_INDEXNOW_KEY` is set. Then the key is
  served at `/indexnow.txt` and the job pings IndexNow (best effort) with the
  indexable pages whose payload changed. Only discoverable tenants are pinged.

## Adding a page

1. **Write a producer** (`Producer` in `page.go`):
   - `Key()`: the snapshot's `page_key`. Unique; never starting with `_`.
   - `Cadence()`: how stale the snapshot may get. The dispatch runs every
     `DispatchInterval` (1h), so cadences round up to it.
   - `Compute(ctx, tenant)`: run the expensive queries here. `ctx` is already
     scoped to the tenant, so RLS limits every query to its data. Return a
     JSON-serializable payload and the sample size the numbers rest on (raids,
     parses, characters...). Store everything the page shows, including the
     window, so the text always matches the data.
   - Write SQL in `database/queries/*.sql` and run `make gen/db` as usual.
     Prefer reading existing precomputed tables (parse spreads, summaries,
     census cache) over scanning raw logs.
2. **Write a render func** `func(site Site, snap Snapshot) (Content, error)`.
   Decode the payload with `Decode[T](snap)`. No database access. Fill
   `Content` to meet the page spec:
   - `Title`: the player's question, with `site.Label()` (it adds
     "(Turtle WoW fork)" for Turtle forks). It is both `<title>` and `<h1>`.
   - `Lead`: 2-3 self-contained sentences, answer first, with the key number,
     "As of <FormatDate(snap.ComputedAt)>", the sample size and the window.
   - `SampleLabel` and `Window`: shown in the "Updated" line.
   - `Table`: the data as a real table. `Cell.Href` links rows into the SPA.
   - `Links`: the SPA pages for the full, interactive view.
   - `Description` defaults to `Lead`.
   - Say what the numbers count: players seen in uploaded logs, not the
     server's population.
3. **Register it** in `DefaultPages` (`servicestats.go`) with its `Path`
   (under `/stats`) and `MinSample`. That is all the wiring: routing, the
   layout, the sitemap, noindex rules, caching and IndexNow come for free.
   Pages that are removed from the registry have their snapshots pruned on
   the next refresh.
4. **Test it**: render the page through `Service.Handler` with a fake store
   (see `handler_test.go`) and test the producer's SQL against a real database
   (see `refresh_test.go`; DB tests need `CHRONICLE_TEST_POSTGRES_PORT` or
   Docker). Keep tests independent of the build's flavor tags.

The shared layout is `layout.html.tmpl`; it renders the title/H1, lead,
"Updated" line with sample size, window and methodology link, the table, the
methodology section (only on the page that sets `Content.Methodology`,
currently `/stats/about`), SPA links, canonical URL on the tenant's canonical
host, and WebPage JSON-LD with `dateModified`. Never add `nosnippet`.

## Not here

- No user-agent checks: content must be identical for every client.
- No per-request queries beyond the snapshot read.
- No per-character or per-raid pages (doorway/thin-page risk, see the plan).
