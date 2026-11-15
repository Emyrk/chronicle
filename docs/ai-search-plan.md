# AI search plan: getting Chronicle cited by ChatGPT, Claude, Perplexity and Google AI

Status: proposal, 2026-11-15. Written for Emyrk and his agent to review.
Code refs are `origin/main` at `eac50c180`. The full research notes (crawler mechanics, player demand, code audit, live bot probe) can be shared on request; this doc carries the conclusions.

## 1. Goal and short version

Players increasingly ask chat assistants instead of search engines: "best DPS spec on WoW Forever", "WoW Forever population by class", "fastest Naxx clear on OctoWoW". Chronicle has the data to answer these with real numbers, and for the Turtle-fork servers nobody else does. But today an AI crawler sees Chronicle as a list of page titles with no body text.

The plan, in order:
1. **Cloudflare and webmaster setup (Emyrk, about an hour, section 7).** Let the AI search and training bots in, set up Google Search Console and Bing.
2. **Small fixes (one train, about 6 small PRs).** Real numbers in page descriptions, no false "No uploads yet" homepage, real 404s, spoof-proof rate limits, AI-referrer tracking.
3. **Public "answer pages" (one train, 6-7 PRs).** Server-rendered stats pages per server, built from precomputed snapshots, identical for bots and logged-out humans. **WoW Forever first**, because its raids unlock **2026-12-09** and Forever tier lists today are built from beta sims. Every page is tenant-generic, so all servers get them.
4. **Optional: open more of instance search to logged-out users** with guardrails. Good for converting visitors who arrive from an AI answer, but not an AI-search lever by itself (section 5).

## 2. Assumptions

- **Emyrk turns the Cloudflare knobs in section 7.** The rest of the plan assumes PerplexityBot, GPTBot, ClaudeBot and CCBot get through like Googlebot does, and that GSC and Bing Webmaster Tools are verified.
- **WoW Forever is the priority, but every feature is per tenant.** Forever is Blizzard's official Classic+ (launched 2026-11-04). Warcraft Logs is already analysing Forever logs, so this is a race. A server only gets pages once it clears a data threshold.
- **Turtle WoW itself shut down (2026-05-14), but its forks carry on.** Capybara (Turtle 1.18 continuation, 7,807 players seen in logs in 14 days), OctoWoW (3,688 players, 1,625 raids), Ravencraft and others run Turtle content. Players still search with "turtle wow" terms ("turtle wow dps tier list 2026", "turtle wow bis warrior"), so pages for those servers should say "Turtle WoW fork" in titles and descriptions. No competing data source exists for them that we could find.
- **No cloaking.** Bots and logged-out humans get the same HTML. Google and Bing treat bot-only content as cloaking, and they feed AI Overviews, Gemini, Copilot and much of ChatGPT search.

## 3. What bots get today

Measured 2026-11-15 with real crawler user agents (114 read-only requests).

| Finding | Detail | Ref |
|---|---|---|
| Four bots blocked at Cloudflare by UA | GPTBot, ClaudeBot, CCBot, PerplexityBot get a 25-byte 403 on pages, sitemap and API. PerplexityBot is allowed by robots.txt, so Chronicle can't be in Perplexity at all | live probe |
| Empty pages without JS | Everything except the blog and `/` sends an empty `<div id="root">`. Leaderboards, census, speedrunning, guild, armory, instance, recent: 0 words | `frontend/chronicle/index.html:73` |
| API closed to crawlers | `/api/v1` is BrowserOnly (`Sec-Fetch-Site` present and not cross-site) and robots.txt disallows `/api/`. Googlebot renders the shell but can't load data | `api/httpmw/browseronly.go:52-57`, `api/seo.go:262` |
| BrowserOnly doesn't stop scrapers | Adding one header, or any `Authorization:` value, passes it. So it keeps out only well-behaved crawlers | `browseronly.go:47-57` |
| Homepage prerender says "No uploads yet" | On Kronos, while `/api/v1/stats` reports 109 logs | `home/prerender.tsx` |
| Root landing lists 2 servers | chronicleclassic.com (GitHub Pages) shows Forever and Old Man Warcraft only. Likely cause: the build-time discovery fetch gets a 403 from BrowserOnly and falls back to a static list (inferred) | `frontend/landing/README.md` |
| Head tags thin | Raid and character descriptions carry numbers. Guild, census and leaderboard descriptions are boilerplate, though serviceog already loads the numbers for share images. JSON-LD is site-level everywhere | `og_guild.go:193-245`, `og_census.go:30` |
| Soft 404s, messy canonicals | Unknown IDs and free-text `/leaderboards/<segment>` return 200. Kronos armory canonical has a raw space. Guild/character canonicals use the requesting host | `frontend.go:294-296`, `og_leaderboards.go:57` |
| Sitemap mostly thin pages | Up to 5,000 character pages per tenant; data-rich pages are noindex | `seo.go:270`, `seo.go:30-42` |
| Rate limits spoofable | Search and external-API buckets key on the first `X-Forwarded-For` hop; nothing reads `CF-Connecting-IP` | `api/instance_search.go:178-182`, `serviceexternalapi/ratelimit.go:126-132` |
| No AI-referrer tracking | GA4 only, no referrer tagging for chatgpt.com, perplexity.ai etc. | `frontend/chronicle/index.html:26-44` |
| Not found in test searches | No chronicleclassic.com result in 12+ test queries | — |

The good news: the data for strong answers already exists, is already anonymous, and is mostly precomputed (parse spreads, raid summaries, highlights, census cache, gear trends, speedruns).

## 4. Principles for every change

1. **Crawlers fetch GET URLs; they never fill forms.** Anything meant to be cited must live at a stable GET URL that returns server-rendered HTML.
2. **Same HTML for everyone.** No UA sniffing on public URLs.
3. **Precompute, then cache at the edge.** A crawler hit must never trigger a live scan. Snapshots refreshed on a schedule, `Cache-Control: public, s-maxage`.
4. **Answer-shaped pages.** A one-paragraph plain-English summary with numbers at the top, an "as of" date, sample size, methodology link. That's what AI answers quote.
5. **Curated URLs indexable, infinite parameter space not.** Google's faceted-navigation guidance: index a curated set, `noindex` or block arbitrary query combinations.
6. **Honest labels.** Discovery and census counts are players seen in uploaded logs, not server population. Pages say so.

## 5. Opening the expensive searches: what it would look like

**Short answer: opening search to logged-out users is fine and isn't cloaking, but it does almost nothing for AI search on its own.** Search runs as `POST /api/v1/raidlogs/search` with a JSON body. Search bots index GET URLs, and the live "user fetch" agents (ChatGPT-User, Claude-User, Perplexity-User) fetch GET URLs too. None of them will compose a CEL query and POST it. What *does* carry over to AI search is the results of good searches published at stable URLs, which is what the answer pages in section 6 are.

Where opening search does help: someone who arrives from an AI citation can keep exploring without hitting a login wall. That's conversion, and with low current usage the cost risk is small.

**Server-side state today** (`internal/instancesearch`, `serviceinstancesearch/search.go`):
- Anonymous subset enforced on the server: 7 cheap fields, at most 6 filters, at most 25 results (`anonymous.go:13-58`).
- Honored field locks and the Revered `encounter.hostile_count` lock are **UI-only**: any logged-in free user can use them today (`fieldTiers.ts:4-9`).
- Cost control is solid: read-only transaction, 5 s statement timeout, 6 concurrent searches per replica, token buckets (anon 20/min refill, burst 40; free burst 100; Exalted 2,000), runtime charged at 10 tokens/s (`search.go:18-50,271`).
- Weak spot: anonymous buckets key on the spoofable first XFF hop.

**Recommended way to open it, in steps:**
1. **Fix the IP key first** (ticket F5): bucket on `CF-Connecting-IP`.
2. **Add a Cloudflare rate-limiting rule** on `POST /api/v1/raidlogs/search` and `/explain` per IP, as an outer fence (section 7).
3. **Add a kill switch:** a config value or flag that scales the anonymous budget, down to 0, without a deploy. Alert when the slow-query log (2 s) or 503-on-concurrency rate jumps.
4. **Widen the anonymous subset** server-side, e.g. add boss, kill time and player parse fields, keep the anon burst low and the 25-result cap. Decide whether Code mode and Revered fields stay paid. That's a business call for Emyrk; the infrastructure can take either.
5. **Linkable search results:** a GET permalink (`/search?q=<encoded>`) that reruns the query (subject to the same budget) and shows results. Mark arbitrary permalinks `noindex`, so crawlers don't wander an infinite query space.
6. **Curated searches become answer pages:** pick the best queries (the 30 saved examples in `internal/instancesearch/testdata/examples/*.json` are a ready catalog), run them on a schedule per tenant, and publish them as named, indexable pages ("Fastest 20-player Molten Core clears on WoW Forever"). This is the version that gets cited.

**Later bet:** a documented GET search on the external API (the ai-key-links train already has a CEL search route) plus OpenAPI / llms.txt / an MCP server, so an assistant could run a live query when a user asks. Unproven that assistants do this unprompted, so it's Phase 3.

## 6. Work plan

### Train 1 `ai-search-fixes` (small, independent PRs; target: in main by about 2026-11-22)

| # | Change | Acceptance |
|---|---|---|
| F1 | Real numbers in guild, census, leaderboard and raid meta descriptions, reusing serviceog's cached data | curl without JS shows numbers on all 4 page types; no new uncached DB query per request; tests |
| F2 | Homepage prerender never claims "No uploads yet" when logs exist | tenant homepage HTML shows real counts or omits the claim |
| F3 | Root landing lists every discoverable server | root cause in PR; build lists all servers or fails loudly |
| F4 | Real 404 + noindex for unknown raid/guild/character IDs and unknown leaderboard segments; URL-encoded canonicals; one host per tenant | tests per case |
| F5 | Rate limits (search, external API) key on `CF-Connecting-IP` | forged XFF doesn't change the bucket; tests |
| F6 | GA4 tagging for sessions referred by chatgpt.com, perplexity.ai, claude.ai, gemini.google.com, copilot.microsoft.com (app + landing) | event visible in GA4 DebugView |
| F7 | Drop character URLs from the sitemap (pages stay reachable) | no `/armory/` URLs in sitemap |

### Train 2 `ai-answers` (target: live 2026-12-08, before Forever raids unlock)

Car order is Forever-driven: the pages useful *before* raids open come first, so they're indexed by 12-09.

| Car | What | Notes |
|---|---|---|
| A1 Foundation (M) | River job writing per-tenant snapshot rows; Go `html/template` handler under `/stats/...` (pattern: `servicelivesession/landing.go`); shared layout (summary, "as of", sample size, methodology, links into the SPA); `s-maxage` edge caching; sitemap and indexable entries (`seo.go:30-42,229-253`); per-tenant data threshold (below it: 404); IndexNow ping on snapshot change | Repeat hit makes no DB query; tests |
| A2 Server hub `/stats` (S) | "Raid logs, rankings and census for <server>": activity, active raids and dungeons, links to the pages below, how to upload. Turtle forks say so in the title | Answers "is <server> active", "where do I upload logs for <server>" |
| A3 Census `/stats/census` (S-M) | Class × race × faction of characters seen in logs, last 30/90 days, from the census cache | Top Forever demand ("wow forever population by class", "wow forever census website"). Question for Emyrk: exclude characters seen only in unlisted logs? |
| A4 Per-boss spec stats `/stats/<instance>/<boss>` (M-L) | DPS/HPS by spec, parse cutoffs (25/50/75/95/99), kill time, wipe rate, from precomputed parse spreads (`handler_parse_score_spreads.go`), success rates and kill times | Dungeons now, Forever raids populate automatically from 12-09. Skip cohorts under 5; hide where `cohort_mode=disabled` |
| A5 Fastest clears `/stats/<instance>/speedruns` (S-M) | From `instance_speedruns`; guild names only | |
| A6 Most-worn gear `/stats/gear/<class>/<spec>` (M) | Gear trends, top 20 parsers, min sample 5 (`gearbuilderapi/trends.go:20-29`) | Answers "BiS <class> <server>" from real data |
| A7 Curated searches (M) | Section 5 step 6: scheduled runs of the best saved queries, one page each per tenant | Needs A1 |
| A8 Explainers (S, no code) | Blog posts: what a parse, Peak, Mastery and Renown are; speedrun rules; "Turtle WoW fork servers in 2026, by raid activity" | Any time |

### Optional train 3 `open-search` (section 5 steps 3-5, after F5)

Kill switch + alerts, widened anonymous subset, `noindex` search permalinks. Needs Emyrk's call on what stays paid.

### Later (only if AI referrals show up)

Read-only MCP server over `/api/external/v1` (OpenAPI already exists, `serviceexternalapi/openapi.go:10-17`); public `llms.txt` (close to zero value on current evidence); guild summary pages (blocked on a player/guild opt-out, which doesn't exist today).

### Not doing

UA-sniffed or bot-only content; opening raw search to crawlers; body text on character pages before an opt-out exists; llms.txt as a main lever.

## 7. Emyrk's checklist (Cloudflare and webmaster tools)

1. **Cloudflare → AI Crawl Control / Bots:** allow PerplexityBot, GPTBot, ClaudeBot, CCBot (they get a UA-based 403 today). Keep OAI-SearchBot, ChatGPT-User, Claude-SearchBot, Claude-User, Perplexity-User, Googlebot, Bingbot, Applebot allowed (they pass today).
2. **Check the "Training" category block** doesn't also block Googlebot, Bingbot or Applebot (Cloudflare changed this 2026-09-15).
3. **Managed robots.txt:** if Cloudflare's managed block is on, remove its Disallow lines for the bots above.
4. **Rate-limiting rule:** per-IP limit on `POST /api/v1/raidlogs/search` and `/search/explain`; later, a cache rule for `/stats/*` honoring origin `s-maxage`.
5. **Crawler Hints** (Cloudflare's IndexNow integration): turn on.
6. **Google Search Console:** domain property for chronicleclassic.com covering all tenant subdomains; submit each tenant sitemap.
7. **Bing Webmaster Tools:** import from GSC; check the AI Performance report there later.
8. **Share read access** to GSC and Bing with Dean so progress can be measured.

## 8. Timeline

| By | Milestone |
|---|---|
| 11-17 | Emyrk reviews this doc; section 7 done; Train 1 cars start |
| 11-22 | Train 1 in main; A1 PR up |
| 11-26 | A1 merged into Train 2; A2-A6 in parallel |
| 12-03 | Train 2 PR to main, full CI, Emyrk review |
| 12-08 | Live, with Forever pages behind the sample threshold |
| 12-09 | Forever raids unlock; A4/A5 fill in automatically |
| ~01-06 | 4-week check, decide on Phase 3 |

## 9. Measuring

- **Baseline (this week):** GSC/Bing impressions per tenant host; 10 test queries in Perplexity and web search.
- **2 weeks after section 7:** bots no longer blocked; Perplexity and Bing indexing tenant hosts.
- **4 weeks after Train 2:** AI-referrer sessions (F6), Bing AI Performance, GSC impressions on `/stats/*`, the 10 queries again.
- **Expectations:** AI assistants send about 0.3% of web traffic overall. The realistic win is being *the* cited source for Turtle-fork and early-Forever stats. The same pages fix Google and Bing, which still drive most traffic.

## 10. Questions for Emyrk

1. Is the section 7 checklist OK, and anything there you'd rather not change?
2. Snapshot cadence and DB budget for A1: hourly for census and speedruns, nightly for spec stats OK?
3. Census: exclude characters seen only in unlisted logs?
4. Per-tenant threshold for getting pages (e.g. 50 raids or 200 players in 6 months)?
5. Opening search: which fields stay paid? Is a widened anonymous subset OK once F5 lands?
6. Any tenant that should opt out of public stats pages?
