# design-sync notes — chronicle

## Known render warns (triaged — not new)

- `[RENDER_THIN] Tooltip: variants render identically` — expected: all side variants (top/bottom/
  left/right) render only the closed trigger; the open tooltip is hover-only and the repo's own
  storybook renders closed too. Faithful to the oracle.
- `[ASSETS_BLOCKED] docs.brandfetch.com` during compare — NOT sandbox egress: `cdn.brandfetch.io`
  302-redirects there and 404s. Broken remote asset in the app itself (Layout footer icon).
- `[CSS_ASSETS] ../c/fonts/FrizQuadrata-*` in the scraped CSS — harmless: those same fonts are
  extracted to `fonts/` and the url()s rewritten; the warn names the pre-rewrite refs.

## Re-sync risks

- The 45 KB Chronicle logo is INLINED as a data URI in the owned previews
  `TenantBanner.tsx`/`BlockingDialog.tsx` (from `public/c/chronicle/ChronicleIconSquare.png`) —
  if the logo file changes, regenerate those two owned previews.
- Skipped stories (play-function tests, MSW-driven states, broken fixtures) are pinned by story ID
  in config `overrides.*.skip` — if the app team fixes Upload/LogsList/EventsPanel fixtures or
  converts MSW stories to props-driven args, REMOVE the corresponding skips to regain coverage.
- `[STORY_CAP]`: SpellTooltip verified at 14 stories once, but the default cap is 6 — its tail
  stories (Innervate…Debug All Fields) ride on the one full pass + sibling trust. Button verified
  at 15 once, same note.
- EventsPanel: FIXED (2026-08-03) — MockInstanceEventsProvider now serves EMPTY streams for
  missing fixture types (no more "No fixture available" errors), and workerPool.ts falls back to
  main-thread processing (shared `panelRequestProcessor.ts`) where module workers can't be
  constructed — required for the DS bundle and for claude.ai/design. All 19 stories verified
  (12 `close` for the /c/ class icons, 7 match). If the worker pool code changes, keep
  panelWorker.ts a thin wrapper over panelRequestProcessor.ts or the fallback drifts.
- `/c/` public assets (class icons, loading screens, logos) remain app-served: PlayerMetricChart
  and RaidCard are permanently `close` until the app serves them from a CDN or imports them.
- ParticleEffect pixels are nondeterministic per mount (canvas randomness) — recaptures always
  differ in particle positions; composition is the thing to judge.
- Reference storybook (`.design-sync/sb-reference`) must be rebuilt whenever src or stories
  change: `cd frontend/chronicle && npx storybook build -c .storybook -o "$(git rev-parse --show-toplevel)/.design-sync/sb-reference"`.
- Toolchain assumption: node 22 + pnpm 10 + system chromium via `DS_CHROMIUM_PATH` (NixOS).

- App-shaped repo, not a component-library package: no library dist. The bundle compiles from
  source via `frontend/chronicle/design-sync.entry.ts` (committed barrel re-exporting every
  storied component) with `cfg.entry` pointing at it and `cfg.tsconfig: tsconfig.app.json`
  for `@/*` alias resolution. There is no `buildCmd` — esbuild compiles TS directly.
- [GENERAL] esbuild resolves extension-less relative imports case-INsensitively against directory
  entries. Case-colliding sibling stems (`consumablesTotal.ts` next to `ConsumablesTotal.tsx`,
  same for `eventTimelinePreview` and `floatingIncomingEventsBreakout` in
  `src/pages/Instance/EventsPanels/`) resolved to the wrong file. Fixed in APP SOURCE by adding
  explicit `.ts` extensions at the 4 import sites (repo has `allowImportingTsExtensions: true`;
  vite build unaffected). New case-colliding filename pairs will break the sync build the same way.
- NixOS host: playwright's downloaded chromium doesn't run; use the system browser via
  `DS_CHROMIUM_PATH=$(which chromium)` for validate/compare/capture.
- BROKEN STORIES IN THE REPO'S OWN STORYBOOK (stale fixtures vs current component APIs) —
  skipped via `cfg.overrides.*.skip`; unskip when the app fixes them:
  - `LogsListView` Empty / With Logs / Single Log / With Parsed Instances / No Parsed Output:
    "Invalid time value" render error.
  - `UploadView` Authenticated / With Files Selected / Upload In Progress / Upload Failed:
    `defaultProps` in Upload.stories.tsx lacks the newer `availableFormats`/`flavorTags`/... props →
    "Cannot read properties of undefined (reading 'length')".
  - (EventsPanel fixture errors were fixed in the app on 2026-08-03 — see the EventsPanel bullet.)
- `cfg.storyImports.shim: ["react-router-dom"]` + router re-exports in the entry barrel: story
  `MemoryRouter` decorators and component `useLocation()` must share ONE react-router copy
  (context identity), so router primitives ship in the bundle.
- `cfg.provider: DsProvider` — committed `frontend/chronicle/design-sync.provider.tsx` (QueryClient
  retry:false + `.dark` class on <html>). The storybook decorator auto-bundle fails on
  `src/index.css`'s absolute `/c/fonts/...` urls, hence the manual provider.
- `"types": "design-sync.entry.ts"` added to frontend/chronicle/package.json — feeds ts-morph
  prop extraction (exportedNames/propsBodyFor) in this app-shaped repo; inert for the app build.
- [GENERAL] Play-function test stories (tagged `!dev`/`!autodocs` in CSF but still in the index) render
  post-interaction state in storybook and initial state in previews — skipped via config:
  Checkbox should-toggle-check, Input should-enter-text, Collapsible should-open-close,
  Switch should-toggle, Sonner should-show-toast/should-close-toast.
- [GENERAL] MSW-driven stories (state fetched inside the component, mocked per-story in storybook):
  previews can't run MSW, so they render real fetch-failure branches — skipped: NavBar
  loading/logged-in, Layout logged-in, Login loading/multiple-providers, RecentRaids all but
  `error`. Props-driven stories (LogsListView, UploadView) preview perfectly — if the app team
  converts msw stories to props-driven args, re-sync picks them up automatically.
- [GENERAL] Repo `public/` root-relative assets (`/c/...`: chronicle logos, RaidCard
  `/c/images/loadingscreens/*.webp`, PlayerMetricChart `/c/icons/class_*.png`) are app-served —
  neither the preview pages nor claude.ai/design serve them, so those visuals are absent in
  designs. RaidCard + PlayerMetricChart graded `close` with this documented; TenantBanner/
  BlockingDialog fixed via owned previews inlining the logo prop as a data URI (prop-driven,
  so legitimate). Durable fix would be repo-level: serve these from the icon CDN.
- [GENERAL] EventsPanel: story fixtures import Vite `?url` `.bin` assets → `cfg.storyImports.loaders
  {".bin": "dataurl"}`; bundle EventsPanel reads app-private `InstanceEventsContext` → the barrel
  exports `src/hooks/instanceEvents` and `cfg.storyImports.shim` includes it so fixture provider and
  bundle share one context. The 6 damage-panel stories error in the repo's OWN storybook
  ("No fixture available for stream type: unit_classification") — skipped; fix the fixture upstream to unskip.
- HARNESS BUG (report upstream, re-check after skill updates): `.ds-sync/storybook/http-serve.mjs`
  MIME map lacks `.svg` (also `.webp`) — the sb-reference panel misrenders `<img src="*.svg">`
  during compare captures. Did not affect final verdicts here (the affected logos are `/c/` assets,
  absent from previews regardless).
- Layout footer icons from `cdn.brandfetch.io` 302→`docs.brandfetch.com`→404 — broken remote asset
  in the app itself, not a sandbox artifact.
- ParticleEffect canvas particle positions are random per mount — graded `close`; pixels can never
  be stable between captures (Re-sync risk: recaptures will always differ in particle positions).
- Storybook decorators: `QueryClientProvider` (fresh QueryClient, retry: false) +
  `withThemeByClassName` (themes light=""/dark="dark", default dark) + MSW (`msw-storybook-addon`).
  Stories for data-driven pages (LogsList, LogDetail, RecentRaids, Upload) rely on MSW request
  mocks and may not render statically — expect skips.
