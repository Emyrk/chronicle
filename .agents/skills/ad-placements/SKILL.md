---
name: ad-placements
description: >
  Adds, moves, and maintains Chronicle advertising placements through the shared AdSlot component.
  Use when adding an ad block, changing ad layout or eligibility, integrating live NitroPay serving,
  or modifying tenant ad enablement, consent, ads.txt, or advertising CSP behavior.
advertise: true
metadata:
  type: workflow
  binding: advisory
---

# Chronicle ad placements

All frontend advertising enters through `frontend/chronicle/src/components/Ads/AdSlot.tsx`. Page code chooses where an ad belongs; `AdSlot` owns its preview plus provider, tenant, consent, and serving eligibility. Never add Google ad markup, scripts, account IDs, consent checks, or hostname checks directly to a page.

## Quick start

Responsive desktop placement:

```tsx
import { AdSlot } from "@/components/Ads/AdSlot"

<AdSlot placement="guild-overview-summary" className="mt-5" />
```

Wide-screen rail:

```tsx
<AdSlot placement="leaderboards-right-rail" format="rail" />
```

Tall-screen stacked rail:

```tsx
import { AdRailStack } from "@/components/Ads/AdRailStack"

<AdRailStack
  primaryPlacement="leaderboards-right-rail"
  secondaryPlacement="leaderboards-right-rail-lower"
/>
```

`AdRailStack` keeps both units in one sticky column and mounts the lower placement only when the viewport is at least 1360px tall. Use it instead of rendering two sticky `AdSlot` siblings, which would overlap while scrolling.

Use `railLayout="paired"` when a page renders rails on both sides. Single rails reserve 300px at 1920px; paired rails wait until 2080px so the page can reserve 300px on both sides without reducing the primary content width. Pages whose primary content is no wider than 72rem may use `railLayout="paired-wide"` to reserve 300px on both sides at 1840px. Use `railLayout="compact"` for a rail that must remain fixed at 160×600 at every eligible viewport width.

Fixed-width content sidebar:

```tsx
<AdSlot placement="statistics-encounter-sidebar" format="sidebar" />
```

The sidebar format reserves 250px and measures the scrollable sidebar's viewport height. It offers 250×250, 240×400, and 160×600 only when each creative can fit in that viewport after scrolling below the preceding content.

`responsive` is the default format. A placement ID is a stable, kebab-case description of the page region, not the advertiser, campaign, or current dimensions.

## Ownership boundary

### Callers own

- The location in page flow.
- Product-specific eligibility, such as requiring a non-empty encounter list.
- Surrounding spacing through `className`.
- A stable `placement` name for reporting and placement-specific policy.

### `AdSlot` owns now

- Local preview rendering.
- Shared format dimensions and responsive breakpoints.
- The visible `Advertisement` label above every preview and live placement.
- Stable placement metadata.

### `AdSlot` must own when live serving is added

- Effective tenant and deployment enablement.
- Consent state and personalized/non-personalized behavior.
- Loading the provider script once.
- Mapping formats or placements to configured provider slot IDs.
- Requesting and refreshing an ad safely.
- Empty, blocked, or unfilled-ad behavior.
- Reserving the 600px live target height required for rail unit creation.
- Provider-specific markup and CSP-compatible attributes.

If a proposed change makes a caller aware of a NitroPay site ID, `nitroAds`, consent API, `siteConfig.ads_enabled`, or the provider script URL, move that behavior into `AdSlot` or its Ads-directory runtime instead.

## Add a placement

1. Choose a stable ID in the form `<page>-<region>`, for example `logs-list-between-pages`. The `AdPlacement` template-literal type requires at least one hyphen; code review still owns full kebab-case validation, uniqueness, and typo detection.
2. Insert `AdSlot` at the intended point in normal document flow.
3. Use the default responsive format unless the surrounding layout reserves a permanent rail or a 250px content sidebar.
4. Keep product eligibility outside the component only when it depends on page data.
5. Start the frontend with `pnpm run dev --with-ads` or `CHRONICLE_PREVIEW_ADS=true pnpm run dev`.
6. Verify the preview on `localhost` at every applicable breakpoint.
7. Run the focused component test and lint the changed files.

Do not create a placement-specific wrapper merely to render `AdSlot`. A wrapper is justified only when it encapsulates reusable product eligibility or layout used by more than one caller.

## Formats

| Format | Component usage | Current layout contract |
|---|---|---|
| Responsive | `<AdSlot placement="..." />` | Hidden below `lg`; fills available width; minimum preview height 7rem |
| Adaptive | `<AdSlot placement="..." format="adaptive" />` | Centered 300×100 below `lg`; fills available width at `lg` and offers 728×90, 970×90, 970×250, and 300×250 |
| Rail | `<AdSlot placement="..." format="rail" />` | Hidden below `2xl` by default, or below `xl` with `railBreakpoint="xl"`; 160px wide by default; expands to 300px when its layout has spare viewport width unless `railLayout="compact"`; 600px minimum height; sticky below navigation |
| Card | `<AdSlot placement="..." format="card" />` | Fixed 300×100 below `lg`, fixed 300×250 at `lg` and wider; centered within a content-grid cell |
| Sidebar | `<AdSlot placement="..." format="sidebar" />` | Hidden below `lg`; fixed at 250px wide; offers 250×250, 240×400, and 160×600 according to the scrollable sidebar's viewport height |

Add a new format only when neither existing format can represent the required dimensions or breakpoint behavior. Format changes belong in `AdSlot.tsx` and require component tests plus a Storybook story.

## Current placements

| Placement | Caller | Eligibility |
|---|---|---|
| `instance-right-rail` | `pages/Instance/InstancePage.tsx` | Upper instance-detail rail outside focus mode; fixed 160×600 and visible at `2xl`; suppressed when the upload owner is ad-free |
| `instance-right-rail-lower` | `pages/Instance/InstancePage.tsx` | Lower instance-detail rail; fixed 160×600 and mounted only at `2xl` with at least 1360px viewport height; suppressed when the upload owner is ad-free |
| `leaderboards-right-rail`, `leaderboards-right-rail-lower` | `pages/Leaderboards/LeaderboardsPage.tsx` | Leaderboard landing and detail layouts; upper visible at `2xl`, lower also requires at least 1360px viewport height |
| `statistics-encounter-sidebar` | `pages/Rankings/InstanceView.tsx` | Non-mobile statistics detail with any non-empty encounter list; fixed 250px width and scrolls below the encounters |
| `recent-right-rail`, `recent-right-rail-lower` | `pages/Recent/RecentRaids.tsx` | Recent uploads; upper visible at `2xl`, lower also requires at least 1360px viewport height |
| `recent-left-rail`, `recent-left-rail-lower` | `pages/Recent/RecentRaids.tsx` | Recent uploads; upper visible with the right rail at 1800px and wider, lower also requires at least 1360px viewport height |
| `recent-grid-card-*` | `pages/Recent/RecentRaids.tsx` | Recent uploads; 300×100 on mobile and 300×250 on desktop, inserted after pseudo-random groups of 4 to 8 raids |
| `census-left-rail`, `census-left-rail-lower` | `pages/Census/CensusPage.tsx` | Census statistics; paired left rail visible at `2xl`, lower also requires at least 1360px viewport height |
| `census-right-rail`, `census-right-rail-lower` | `pages/Census/CensusPage.tsx` | Census statistics; paired right rail visible at `2xl`, lower also requires at least 1360px viewport height |
| `armory-left-rail`, `armory-left-rail-lower` | `pages/ArmoryPage/ArmoryPage.tsx` | Character armory outside Activity; joins the right rail at `2xl`, widening at 1840px; lower also requires at least 1360px viewport height; suppressed when the linked account is ad-free |
| `armory-right-rail`, `armory-right-rail-lower` | `pages/ArmoryPage/ArmoryPage.tsx` | Character armory outside Activity; single rail from `xl`, paired at `2xl`, widening at 1840px; lower also requires at least 1360px viewport height; suppressed when the linked account is ad-free |
| `armory-search-left-rail`, `armory-search-left-rail-lower` | `pages/ArmorySearch/ArmorySearchPage.tsx` | Armory character and guild search; joins the right rail at `2xl`, widening at 1840px; lower also requires at least 1360px viewport height |
| `armory-search-right-rail`, `armory-search-right-rail-lower` | `pages/ArmorySearch/ArmorySearchPage.tsx` | Armory character and guild search; single rail from `xl`, paired at `2xl`, widening at 1840px; lower also requires at least 1360px viewport height |
| `armory-search-empty` | `pages/ArmorySearch/ArmorySearchPage.tsx` | Centered adaptive placement on the Characters tab before a valid search value is entered; 300×100 on mobile and responsive sizes through 970×250 from `lg` |

## Enablement model

The backend computes effective `SiteConfig.ads_enabled`. It is true only when:

1. The deployment configures `CHRONICLE_ADS_TXT_URL`.
2. The deployment configures a valid numeric `CHRONICLE_NITROPAY_SITE_ID`.
3. The resolved tenant has `ads_enabled = true`.

Eligible tenant site config exposes the public NitroPay site ID plus `disabled_ads`, an opt-out list managed in the tenant editor. `frontend/chronicle/src/components/Ads/adPolicy.ts` owns the supported group keys and matching rules: `rail` disables every rail-format slot, `recent-content` disables non-rail placements whose stable ID starts with `recent-`, and an exact placement ID disables only that slot. Preserve unknown keys in the admin form so a newer policy is not erased by an older client.

`NitroPayRuntime` loads NitroPay once on every route so its bundled CMP can collect and manage consent, while `AdSlot` requests placements only after the effective gate and placement policy pass. The advertising subset of site config is cached per origin in `localStorage` for one hour through `adSiteConfigCache.ts`; `useAdSiteConfig` returns that last known decision immediately during a reload while the canonical site-config query refreshes in parallel. Cache only the public advertising fields, validate stored data, and fail back to the API when storage is unavailable or stale.

A tenant may therefore keep ads enabled while opting out of selected groups. Fully disabled tenants do not render an ad container, load NitroPay, or receive the advertising CSP expansion. Local preview remains available only when the frontend is running in dev mode, `CHRONICLE_PREVIEW_ADS=true`, and the hostname is `localhost` or `127.0.0.1`. `pnpm run dev --with-ads` sets that flag for convenience. Do not replace production eligibility with a frontend-only environment flag.

## Live-serving contract

Keep each provider concern centralized:

1. Configure the public site ID through `CHRONICLE_NITROPAY_SITE_ID` and the managed authorization through `CHRONICLE_ADS_TXT_URL`.
2. Expose only `nitropay_site_id` through effective site config for eligible tenants.
3. Keep NitroPay's privacy-choice links in the shared footer.
4. Expand advertising CSP only for eligible tenant hosts.
5. Load the provider script once through `NitroPayRuntime` and `components/Ads/nitroPay.ts` so the CMP works on routes without placements.
6. Have each mounted `AdSlot` call `createAd` without exposing provider APIs to callers.
7. Keep localhost previews deterministic and prevent real ad requests during tests, Storybook, and local development.

## Tests

At minimum, `AdSlot.test.tsx` must cover:

- Responsive preview defaults.
- Rail preview dimensions, sticky behavior, and single/paired width breakpoints.
- NitroPay rail size eligibility: 160×600 normally and both 300×600 plus 160×600 only after 300px is reserved; the local preview label must reflect the same eligible set.
- Sidebar size eligibility: 250×250, 240×400, and 160×600 are offered only when the scrollable sidebar viewport can contain them.
- Optional minimum viewport-height eligibility prevents hidden placements from rendering or requesting ads.
- Stable `data-ad-placement` output.
- No rendering without the preview flag or on a non-local hostname while live serving is unavailable.
- Effective tenant enablement for both disabled and live NitroPay branches.
- Tenant opt-outs for format groups, page groups, and exact placement IDs.
- One-hour ad-config caching, including enabled, disabled, stale, and malformed values.

Page tests should cover product eligibility only. They should not retest provider behavior owned by `AdSlot`.

## Evaluation scenarios

Use these scenarios when revising this skill or the component contract:

1. A developer adds a responsive ad between two guild panels using only one `AdSlot` import and JSX element.
2. A developer moves the statistics sidebar ad without touching provider, tenant, consent, or CSP code.
3. A NitroPay configuration change keeps every existing `AdSlot` live for eligible tenants without editing the placement callers.

## Gotchas

- The tenant toggle alone does not render ads; the deployment must also configure NitroPay and ads.txt.
- Do not expose the NitroPay site ID as a page-level prop.
- Do not put the provider script in `index.html`; `NitroPayRuntime` must gate it with effective tenant enablement and keep the CMP available sitewide.
- Do not reserve blank production space when a placement is disabled or unfilled unless product design explicitly requests it.
- NitroPay demand partners currently require `media-src data: blob: https:` and some bidders require `'unsafe-eval'`; keep these relaxations limited to ad-enabled tenant responses.
- Keep `/speedrunning` as the speedrunning documentation route; leaderboard ads live under the leaderboard page layouts.

## Validation

```bash
pnpm -C frontend/chronicle exec vitest run src/components/Ads/AdSlot.test.tsx
pnpm -C frontend/chronicle exec eslint src/components/Ads/AdSlot.tsx src/components/Ads/AdSlot.test.tsx
pnpm -C frontend/chronicle build
```

For a skill-only edit, also run:

```bash
skills-ref validate ./.agents/skills/ad-placements
```

If `skills-ref` is unavailable, verify the frontmatter, directory/name match, description triggers, referenced paths, and examples manually.
