---
name: ad-placements
description: >
  Adds, moves, and maintains Chronicle advertising placements through the shared AdSlot component.
  Use when adding an ad block, changing ad layout or eligibility, integrating live AdSense serving,
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

`responsive` is the default format. A placement ID is a stable, kebab-case description of the page region, not the advertiser, campaign, or current dimensions.

## Ownership boundary

### Callers own

- The location in page flow.
- Product-specific eligibility, such as only showing the encounter placement for short encounter lists.
- Surrounding spacing through `className`.
- A stable `placement` name for reporting and placement-specific policy.

### `AdSlot` owns now

- Local preview rendering.
- Shared format dimensions and responsive breakpoints.
- Stable placement metadata.

### `AdSlot` must own when live serving is added

- Effective tenant and deployment enablement.
- Consent state and personalized/non-personalized behavior.
- Loading the provider script once.
- Mapping formats or placements to configured provider slot IDs.
- Requesting and refreshing an ad safely.
- Empty, blocked, or unfilled-ad behavior.
- Provider-specific markup and CSP-compatible attributes.

If a proposed change makes a caller aware of an AdSense client ID, slot ID, `adsbygoogle`, consent API, `siteConfig.ads_enabled`, or the provider script URL, move that behavior into `AdSlot` or its Ads-directory runtime instead.

## Add a placement

1. Choose a stable ID in the form `<page>-<region>`, for example `logs-list-between-pages`. The `AdPlacement` template-literal type requires at least one hyphen; code review still owns full kebab-case validation, uniqueness, and typo detection.
2. Insert `AdSlot` at the intended point in normal document flow.
3. Use the default responsive format unless the surrounding layout reserves a permanent rail.
4. Keep product eligibility outside the component only when it depends on page data.
5. Start the frontend with `pnpm run dev --with-ads` or `CHRONICLE_PREVIEW_ADS=true pnpm run dev`.
6. Verify the preview on `localhost` at every applicable breakpoint.
7. Run the focused component test and lint the changed files.

Do not create a placement-specific wrapper merely to render `AdSlot`. A wrapper is justified only when it encapsulates reusable product eligibility or layout used by more than one caller.

## Formats

| Format | Component usage | Current layout contract |
|---|---|---|
| Responsive | `<AdSlot placement="..." />` | Hidden below `lg`; fills available width; minimum preview height 7rem |
| Rail | `<AdSlot placement="..." format="rail" />` | Hidden below `2xl`; 160px wide; 600px minimum height; sticky below navigation |

Add a new format only when neither existing format can represent the required dimensions or breakpoint behavior. Format changes belong in `AdSlot.tsx` and require component tests plus a Storybook story.

## Current placements

| Placement | Caller | Eligibility |
|---|---|---|
| `leaderboards-right-rail` | `pages/Leaderboards/LeaderboardsPage.tsx` | Leaderboard landing and detail layouts; visible at `2xl` |
| `statistics-encounter-sidebar` | `pages/Rankings/InstanceView.tsx` | Explicitly non-mobile statistics detail with 1–8 encounter rows; rendered after the keybind help text |
| `recent-right-rail` | `pages/Recent/RecentRaids.tsx` | Recent uploads; visible at `2xl` |
| `recent-left-rail` | `pages/Recent/RecentRaids.tsx` | Recent uploads; visible with the right rail at 1800px and wider |

## Enablement model

The backend already computes effective `SiteConfig.ads_enabled`. It is true only when:

1. The deployment configures `CHRONICLE_ADS_TXT_URL`.
2. The deployment configures a valid `CHRONICLE_ADSENSE_CLIENT_ID` (`ca-pub-...`).
3. The resolved tenant has `ads_enabled = true`.

Eligible tenant HTML includes the `google-adsense-account` verification meta tag, and site config exposes the public client ID for the future shared ad runtime. Neither path loads the AdSense provider script. The current `AdSlot` remains preview-only and returns `null` unless the frontend is running in dev mode, `CHRONICLE_PREVIEW_ADS=true`, and the hostname is `localhost` or `127.0.0.1`. `pnpm run dev --with-ads` sets that flag for convenience. When live serving is implemented, preserve the three-part backend gate and make `AdSlot` consume the effective result. Do not replace production eligibility with a frontend-only environment flag.

## Live-serving implementation order

When implementing the provider integration, keep each step centralized:

1. Add deployment configuration for the publisher client and format/placement slot IDs.
2. Expose only the public configuration needed by `AdSlot` through site config.
3. Configure the certified consent flow before requesting ads where consent rules apply.
4. Update and test CSP deliberately; prefer nonce-based strict CSP and report-only rollout over a guessed permanent domain allowlist.
5. Load the provider script once, only when an eligible placement can serve.
6. Have each mounted `AdSlot` request its ad without exposing provider APIs to callers.
7. Keep localhost previews deterministic and prevent real ad requests during tests, Storybook, and local development.

## Tests

At minimum, `AdSlot.test.tsx` must cover:

- Responsive preview defaults.
- Rail preview dimensions and breakpoint class.
- Stable `data-ad-placement` output.
- No rendering without the preview flag or on a non-local hostname while live serving is unavailable.
- Any future effective enablement and consent branches before production serving is enabled.

Page tests should cover product eligibility only. They should not retest provider behavior owned by `AdSlot`.

## Evaluation scenarios

Use these scenarios when revising this skill or the component contract:

1. A developer adds a responsive ad between two guild panels using only one `AdSlot` import and JSX element.
2. A developer moves the statistics sidebar ad without touching provider, tenant, consent, or CSP code.
3. A future AdSense integration makes every existing `AdSlot` live for eligible tenants without editing the placement callers.

## Gotchas

- The tenant toggle alone does not currently render production ads; the shared component is still preview-only.
- Do not expose publisher or slot identifiers as page-level props.
- Do not put the provider script in `index.html`; disabled tenants and pages without placements should not load it.
- Do not reserve blank production space when a placement is disabled or unfilled unless product design explicitly requests it.
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
