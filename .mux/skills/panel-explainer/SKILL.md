---
name: panel-explainer
description: |
  Building and maintaining panel explainer pages (?explain=<panel>): the lesson-based
  learning shell, per-panel lesson sets with capability-aware states, and Remotion
  lesson videos played in-app via @remotion/player. Covers the lesson contract,
  authoring a scripted video against the demo harness (controlled props, measured
  geometry, the intro title card), the storybook+chromium verification loop, the
  data-lesson-target hover-linking scheme, and every registration point that must
  stay in sync (lessons.ts durations, Studio Root.tsx, stories).
---

# Panel Explainer Pages

## When to Use This Skill

- Adding a lesson set (explainer page) to a panel that only has the summary/tips fallback
- Adding a new lesson video to an existing lesson set
- Fixing/adjusting an existing lesson video (cursor positions, captions, beats)
- Extending the demo harness with new scripted-state props
- Wiring lesson↔panel hover highlighting for new lessons

Related skills: `remotion-markup` (frame-driven animation rules — read before writing any
composition), `remotion-best-practices`, `events-panels` (panel/processor architecture).

## Architecture Map

```
frontend/chronicle/src/pages/Instance/PanelExplainer/   # generic shell (panel-agnostic)
├── types.ts               # Lesson / LessonSet / LessonVideo / PanelExplainer contracts
├── PanelExplainerView.tsx  # LessonShell, LessonTargetOverlay, example banner, fallback
├── LessonSidebar.tsx       # playlist rows (numbered thumb → play glyph), state pills
├── LessonPlayer.tsx        # lazy @remotion/player (bundle rule lives here)
└── ExplainerTopBar.tsx

frontend/chronicle/src/pages/Instance/EventsPanels/<Panel>/explain/   # per-panel content
├── index.ts               # explainer object: summary, tips, lessonSet
├── capabilities.ts        # pure deriveCapabilities(result, durationMs, instance)
├── lessons.ts             # the lesson roster (id, copy, deriveState, video metadata)
├── fixture.ts             # deterministic example-raid data
├── Example<Panel>Panel.tsx # renders the REAL content component on the fixture
├── useParseAvailability.ts # example of a live-query capability extra
└── videos/
    ├── shared.tsx          # VideoStage, Cursor, RegionHighlight, StepCaption,
    │                       #   VideoHeader, LessonIntro
    ├── animation.ts        # clamp, entranceEasing, INTRO_FRAMES (constants only —
    │                       #   react-refresh forbids them in component files)
    └── <Name>.video.tsx    # one composition per lesson, default export

frontend/chronicle/src/components/ui/PlayerMetricChart/PlayerMetricChart.demo.tsx
                            # the demo harness videos render (see below)
videos/damage-done-breakout/src/Root.tsx
                            # Remotion Studio registration (authoring/preview only)
frontend/chronicle/src/pages/Instance/EventsPanels/explainers/index.ts
                            # PANEL_EXPLAINERS registry, hasExplainer/getExplainer
```

Entry: `?explain=<panel_type>` (InstancePageView early-return), `?lesson=<id>` deep-links a
lesson. Exiting deletes both params.

## The Lesson Contract

```ts
Lesson<TCaps> {
  id, title, group: "essentials" | "deeper" | "more",
  description: (caps) => string,        // adapts copy to the user's data
  deriveState: (caps) => "available" | "limited" | "example-required",
  instruction: string,                  // fallback copy when no bullets
  bullets?: string[],                   // shown under the player; keep 2–4, match captions
  learnMore?: { href, label },
  video?: { load: () => import("./videos/X.video"), durationInFrames, fps: 30,
            width: 1280, height: 720 },
  exampleOnly?: boolean,
}
```

- **States**: `available` shows NO badge (normal case). Only `limited` and
  `example-required` get pills. Example-forced lessons open in example mode automatically.
- **Capabilities** come from a pure `deriveCapabilities` over the panel's live result.
  Anything needing a query (e.g. parse availability) goes through the optional
  `lessonSet.useLiveCapabilityExtras(context)` hook, merged over the pure derivation
  (see `useDamageDoneLiveExtras`).
- **Bundle rule**: nothing may statically import remotion or a composition. Compositions
  are referenced ONLY via the dynamic `load:` import; `LessonPlayer` lazy-loads the Player.

## Authoring a Lesson Video

### Composition structure (every video follows this)

```tsx
export default function XVideo() {
  return (
    <VideoStage>
      <Sequence from={INTRO_FRAMES - 10}>
        <Content />
      </Sequence>
      <LessonIntro title="..." bullets={["...", "...", "..."]} />
    </VideoStage>
  );
}
function Content() { /* all choreography, local frame 0 = global frame 50 */ }
```

- **The intro card is mandatory.** Frame 0 is the player's paused preview — before the
  card existed, previews were blank (entrance opacity 0). `LessonIntro` is fully opaque
  at frame 0, holds ~1.7s, fades over the content's entrance. Keep intro bullets short
  (they compress the step captions).
- **Total duration = content frames + 50.** The same number goes in THREE places:
  `lessons.ts` (`durationInFrames`), Studio `Root.tsx`, and implicitly your caption
  fade-out timings. Grep for the old value when changing.
- **Frame-driven only**: `useCurrentFrame()` + `interpolate`/`spring`, easing via
  `entranceEasing`, `{...clamp}` on every interpolate. No CSS animations inside
  compositions. `interpolate` input ranges must be strictly increasing — a reversed
  range crashes the whole composition with an error-triangle overlay.
- **Stage geometry**: 1280x720. The demo panel mounts at `left-[72px] top-[132px]`
  (620x430 card). Pinned breakouts go to the right at ~`{x: 706, y: 96}`.
- **Portals**: `VideoStage` provides a local `PortalContainerProvider` — pinned
  breakouts/tooltips render inside the frame instead of escaping to the page. Any new
  floating UI in a video must respect `usePortalContainer`.
- **Choreography idiom**: named frame constants (`MENU_FRAME`, `EXPAND_FRAME`, …),
  cursor paths as one `interpolate` over waypoint arrays, click pulses
  `[F-4, F, F+10] → [0,1,0]`, state flips via `frame >= F`. Captions: `StepCaption`
  with step derived from the same constants; opacity `[8, 18, END-14, END]`.
- **Determinism**: no `Date.now()`/`Math.random()`. All data hardcoded in the demo.

### The demo harness (`PlayerMetricChart.demo.tsx`)

Videos never drive real interactions — they render the harness with **controlled props**
that mirror real behavior, flipped per-frame:

- `pinnedPlayers: Map<id, {x,y}>` — pin/drag breakouts (positions may animate per frame;
  the pin SET re-keys the chart). Pin at frame ≥ ~20, never frame 0 — portaled breakouts
  skip the chart's entrance fade and would float over an invisible chart.
- `perSecond`, `parsePills`, `showRanks`, `breakoutDetail {expanded, viewMode, tab}`,
  `filterStage` + `filterEditor {typed, chip, caret, enterFlash}` — existing examples of
  the pattern. Add new ones the same way: optional prop, defaults to real-app behavior.
- When adding controlled state to a REAL component (e.g. `AbilityTable.expanded`), use
  the controlled-or-internal pattern already there: `const x = controlled ?? internal`.
  Internal setters keep working; app behavior is untouched.
- **Fidelity is the point.** Mirror the real UI exactly: real placeholder text, chip
  inputs commit on Enter, the editor's exit is its real "Reset"/"Back" buttons, the
  panel header disappears when the card flips to the filter editor. When unsure, read
  the real component first (`EventsPanel.tsx`, `PanelFilterEditor.tsx`, `FilterBlock.tsx`).
- Typing simulation: `TYPED.slice(0, floor(interpolate(frame, [START, END], [0, len])))`
  + caret blink `floor(frame/16) % 2 === 0` + an `↵ Enter` keycap flash at commit.

### Measure, never guess (the verification loop)

Cursor targets and highlight boxes use MEASURED stage coordinates. The loop:

1. Build storybook to the scratchpad:
   `cd frontend/chronicle && npx storybook build -o <scratchpad>/sb-check`
2. Probe with chromium + the playwright checkout at `.ds-sync/node_modules/playwright`.
   NixOS: playwright's own chromium won't run — always
   `DS_CHROMIUM_PATH=$(which chromium)` and pass it as `executablePath`.
3. Serve `sb-check` with a tiny inline http server; open
   `iframe.html?id=instance-panelexplainer--<story>&viewMode=story`.
4. Convert DOM rects to stage coordinates:
   ```js
   const pr = document.querySelector('.__remotion-player').getBoundingClientRect()
   const scale = pr.width / 1280
   stageX = (rect.left - pr.left) / scale   // etc.
   ```
   Give probe-able elements data attributes (`data-demo-*`) rather than text-matching.
5. **Playback**: click the CENTER OF THE VIDEO (page ≈ (900, 430) at 1600x1000), not
   (400,300) — that's the sidebar. Global seconds = (local frame + 50) / 30. Screenshot
   each beat at its computed time and actually look at every image.
6. States that change layout need their own measurements (e.g. expanding "More detail"
   moves the controls row; removing the panel header shifts the editor up 40px).

Write probes as `.mjs` files in the scratchpad (session-specific, no permission prompts).

## Hover Linking (lesson ↔ panel regions)

Real UI elements carry `data-lesson-target="<lesson-id>"`. The shell does the rest:
hovering a lesson row draws pulsing boxes over matching elements in the live/example
area (`LessonTargetOverlay`), and hovering a tagged element lights up + scrolls to the
lesson row (`closest('[data-lesson-target]')` on mouseover).

When adding a lesson: tag its UI with the lesson's id (one attribute per element; several
elements may share an id — all get boxed). Missing targets degrade to "no boxes", so
conditional UI (breakout tabs, parse pills) is fine. Tag REAL components, not the demo —
the example panel renders real components and inherits the tags.

## Registration Checklist (new lesson)

1. `explain/videos/<Name>.video.tsx` — composition (intro card + Content sequence)
2. `explain/lessons.ts` — lesson entry (id, copy, bullets, deriveState, video metadata)
3. `videos/damage-done-breakout/src/Root.tsx` — `<Composition>` with the same duration
4. `PanelExplainerView.stories.tsx` — deep-linked story
   (`parameters: { routerEntries: ["/?lesson=<id>"] }`) — you need it for probing
5. `data-lesson-target="<id>"` on the relevant real UI
6. Verify every beat via the probe loop; run gates

## New Panel Checklist

1. Create `EventsPanels/<Panel>/explain/` with `capabilities.ts`, `lessons.ts`,
   `fixture.ts`, `Example<Panel>Panel.tsx`, `index.ts` (mirror DamageDone's).
2. The example panel renders the REAL content component on fixture data — add
   `*Override` props to the real component only where queries would fire.
3. Point the panel's entry in `explainers/index.ts` at the new explainer object with
   `lessonSet`. Panels without a lessonSet keep the summary/tips fallback automatically.
4. Reuse `videos/shared.tsx` + `animation.ts` by extracting them if a second panel needs
   them (they're currently DamageDone-local).

## Gates & Pitfalls

- Gates: `pnpm exec tsc -b --pretty false`, `pnpm test`, and eslint SCOPED to touched
  files (`pnpm exec eslint <paths>`) — repo-wide lint has pre-existing failures.
- `react-hooks/set-state-in-effect`: no synchronous setState in effect bodies. Use the
  keyed-staleness pattern (`LessonPlayer`, `LessonTargetOverlay`): store
  `{key, value}`, render only when `key` matches current props; populate via
  rAF/subscription callbacks.
- `react-refresh/only-export-components`: constants live in `animation.ts`, never in
  component files under `videos/`.
- `<Sequence premountFor={fps}>` must NOT combine with `layout="none"` (type error).
- Shell `cd` drifts between Bash calls — always `cd` absolute paths per command.
- Run `git` from the repo root (relative pathspecs break after a `cd frontend/chronicle`).
- Remotion free tier applies while the team is ≤3 people; revisit licensing if that changes.
