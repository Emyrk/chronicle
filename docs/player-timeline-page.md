# Player Timeline Page

Status: design, not started. Design source of truth:
[Rotation comparison panel design](https://claude.ai/design/p/b0b8fd1d-db97-44d3-b079-13426992b4a6?file=Rotations.dc.html),
option **2a** ("Stacked casts with interleaved auras"). The mockup is a structure
and a goal, not a pixel spec. Where real data disagrees with it, real data wins
and this doc records the deviation.

## Goal

A first-class full-page view on `/instances/:id` that compares the rotation of
two players (A and B) on one shared, zoomable timeline: casts, idle time, auto
attacks, cooldowns, buff uptime, and debuffs on a chosen target.

It is the first `kind: "page"` preset (see `presetLayouts.ts`). A page, not a
panel, because section heights grow and shrink with expand/collapse toggles,
which the panel grid cannot do.

The timeline half of the page (everything above "Buffs & debuffs") must be
reusable later as a trimmed EventsPanel. That constraint shapes the module
split below.

## Scope

### v1

- Players A and B from the **same** selected encounter.
- Header: A/B pickers, swap, ignored-spell tray, Align (Pull / First cast),
  zoom out/in/fit with span label.
- Overview strip: A/B DPS lines, cumulative damage lead bars, viewport box,
  drag-to-brush zoom, hover readout.
- Ruler with ticks and a crosshair synced across all lanes; per-player
  "at cursor" text (current cast or idle).
- Per player: header (name in class color, DPS, casts, idle), cast lane
  (icon, cast-time bar by school, damage, hatched idle gaps), auto-attack lane
  (main/off hand, outcome colors), cooldown lane.
- Cast tooltip: spell, time, cast time, damage, crit, target, active buffs.
- Collapsible "Buffs & debuffs": key buffs, "Other buffs" (sorted by A/B
  uptime gap, pin/unpin), target picker, target strip, key debuffs on target,
  "Other debuffs".
- Ctrl+click a spell to ignore it everywhere on the page.
- Page state survives share links.

### Later

- A and B from different encounters (data model supports it from day one).
- Trimmed `RotationTimeline` EventsPanel; then delete the old hidden
  `EventsPanels/Rotations/` panel. The old panel is not touched or reused by
  this work.
- Shift+click "flip" of the page to show and edit the curated aura/cooldown
  lists in place (today they are edited on `/technical/cooldowns` and
  `/technical/class-buffs`).
- Healer comparison (heal stream instead of damage).

## Architecture

```
pages/Instance/EventsPanels/RotationTimeline/
  rotationTimeline.processor.ts  worker-safe; collects raw per-(player, encounter) data
  derive.ts                      pure functions over processor output + spell metadata
  derive.test.ts
  auraClassification.ts          curated-set rules (pure) + tests
  useRotationView.ts             view state: window, brush, pan, align, ignored, cursor
  RotationTimeline.tsx           header controls, overview, ruler, cast/swing/CD lanes
  RotationOverview.tsx           custom SVG DPS + lead strip with brush
  lanes/*.tsx                    CastLane, SwingLane, CooldownLane, IdleGaps
pages/Instance/Pages/
  InstanceContentPage.tsx        switch on InstancePageType (moved out of InstancePageView)
  PlayerTimelinePage/PlayerTimelinePage.tsx  composes RotationTimeline + AuraSection
  PlayerTimelinePage/AuraSection.tsx   buffs/debuffs, pins, target picker
```

Rules that keep the timeline reusable as a panel:

- `RotationTimeline` takes data and view state as props. It does not read
  page-only context. The page owns the A/B selection and the aura section.
- `useRotationView` owns interaction state and returns setters. The page and
  the future panel both call it; the panel serializes a subset into its panel
  option.
- Each section of `RotationTimeline` can be switched off by props
  (`showOverview`, `showSwings`, `showCooldowns`, `compactHeader`) for the
  trimmed panel.

### Running the processor

The page calls `usePanelAggregation` with a processor definition, as
`Timeline.tsx` and `HealerCastsContent.tsx` already do outside the grid. The
processor is registered in `processors/index.ts` so the worker can find it.
Use `syncDataMode: "full"`: replay time only moves a playhead, it does not
cut data.

The worker cannot fetch API data, so curated sets and spell metadata are
joined on the React side in `derive.ts`, the same split Cooldown Usage uses.

## Data

### Processor output (worker)

Keyed by `encounterId` then player GUID, so cross-pull comparison only changes
which keys the page reads. Only players in `context.entitySelection` (or the
page's A/B GUIDs passed through `panelContext`) are collected.

Per player per encounter:

- `casts`: `{ offsetMs, spellId, targetGuid, castTimeMs, channelTimeMs, outcome: "go" | "fail" }`,
  built from `spell_start`, `spell_go` and `spell_fail`. For logs with only
  the text `cast` stream, use `Casts` / `BeginsToCast` and leave cast time
  unknown (filled from spell metadata in derive).
- `damage`: compact records `{ offsetMs, spellId, targetGuid, amount, hitType, periodic }`
  for the player and the player's pets (via `context.unitState`).
- `swings`: auto attacks (`spellId === 6603`), with `offHand = hitType & 0x1`
  and outcome from `lib/hittype`. Heroic Strike/Cleave are flagged in derive.
- `auras`: segments `{ spellId, name, isBuff, casterGuid, targetGuid, startMs, endMs, maxStacks }`
  for auras **on** the player (buffs) and auras **cast by** the player on
  any unit (debuffs), using `processors/auraProcessor.ts`. Close open auras
  at encounter end, as `materializeActiveAuraUptime` does.
- `targetWindows`: per enemy, when the player was dealing damage to it.

Events are reused by the cursors; copy fields, never keep references.

### Derived (React, `derive.ts`, all pure and unit-tested)

- **Cast to damage link.** No cast ID exists in the log. A direct-damage
  event is linked to the most recent `spell_go` with the same caster,
  `spellId` and target within a window (default 3 s; travel time). Periodic
  ticks link to the latest application of the same spell on the same target.
  AoE uses `spell_go.numHits` as a hint and sums all targets. The tooltip
  says "approx." when the link was ambiguous.
- **Cast slot.** `max(castTime, gcd)`, where `gcd` comes from
  `start_recovery_time` (ns) on `WoWSpell`. If missing, assume 1.5 s for
  spells and 1.0 s for rogue/cat energy abilities.
- **Idle gaps.** The time between one cast slot's end and the next cast's
  start, if at least the threshold (default 0.4 s). Counted the same way for
  every class, including melee: it is a consistent, comparable metric between
  two players of the same class. The threshold is a page option.
- **DPS series.** 1 s bins of the player's damage plus pets, smoothed with
  the existing `rolling_avg` (5 s) aggregation from `Timeline/aggregations.ts`.
- **Lead.** Cumulative A damage minus cumulative B damage, binned.
- **Align offset.** Pull: 0. First cast: the offset of the player's first
  non-ignored cast. Applied to every lane of that player.
- **Uptime.** Segment length clipped to the visible encounter, divided by
  encounter duration.
- **Stats.** DPS over encounter duration, cast count, idle total.

### Spell metadata

`useSpell` is one request per spell (24 h cache). A rotation has about 20 to
60 distinct spells. v1 fetches them in parallel with `useQueries`. If that is
slow on real logs, add a batch endpoint (`/api/v1/wowdb/spells?ids=`) as a
follow-up.

## Aura and cooldown classification

Sources:

- Cooldowns: `useCooldownSpells()`, keyed by class, admin-editable on
  `/technical/cooldowns` (has `ignored`).
- Class buffs: `useFriendlyClassBuffs()`, keyed by class plus a `Generic`
  pseudo-class, admin-editable on `/technical/class-buffs`.

For player P with class C, each spell (aura or cooldown cast) is classified:

| Spell belongs to | Aura on P / cast by P | Cooldown cast by P |
| --- | --- | --- |
| C (P's class) | **show** | **show** |
| Another class | **hide** | **show** (external cooldown, e.g. Power Infusion) |
| Generic (no class) | **show** | **show** |
| No curated set | goes to "Other" | n/a (not a cooldown) |

"Belongs to" is looked up by spell ID first, then by lowercase name to collapse
ranks (as `buildCooldownIndex` does).

"Show" means a key row (buffs and debuffs) or a marker (cooldown lane). The
"Other buffs" / "Other debuffs" groups hold everything not shown as key and
not hidden, sorted by the absolute A/B uptime gap. User pins move a row into
the key list.

Open points in the rules (decide with real data):

- Admin `ignored` entries move to "Other" (decided). They stay
  discoverable and pinnable.
- Class buffs mark self-targeted spells `default_ignored`. That default is
  about raid buff coverage and does not apply here: self procs (Flurry,
  Enrage, Combustion, Clearcasting) are key rows. Only an explicit admin
  ignore (`ignored` without being a self-target default) demotes to "Other".
- The cooldown set has no `Generic` class today: `cooldownSpellFromSpell`
  drops spells without a player class set, so trinkets, racials and
  engineering items are not cooldowns. Generic cooldowns need a backend
  change in `api/gamedataapi/cooldowns.go` (and a migration/regeneration of
  `dbc_cooldown_spells`). v1 ships without them unless we decide otherwise.
- Inferring Generic cooldowns (decided: infer, do not hand-list). Signals:
  - Item on-use: `world_item_template` slot with `spelltrigger = 0`; cooldown
    and category from `spellcooldown_N` / `spellcategorycooldown_N` (item
    cooldowns usually live on the item, not the spell). Engineering:
    `required_skill = 202`. Potions share a `spellcategory`.
  - Racials: Generic, non-passive, `Attr_IsAbility`, subtext "Racial", with a
    cooldown.
  - Generic procs (Holy Strength, trinket procs): the trigger spell of a
    passive proc aura (42/43) on an item slot with trigger 1/2 or on a
    `dbc_spell_item_enchantment` effect. These are auras, shown by the
    Generic rule, not cooldowns.
  - Runtime signal: vanilla pipe-format `SPELL_GO` carries `itemId`; other
    formats do not.
  - Derivation must rerun on item uploads too, like `deriveConsumables`
    (`database/queries/consumables.sql`). Needs a Generic bucket in
    `api/gamedataapi/cooldowns.go`, `servicewowdb/cooldowns.go`, and the
    frontend class lookup.
- Key target debuffs (Sunder, Faerie Fire, Curse of Elements, Judgements)
  are hardcoded inside individual panels today. With the rules above they
  classify by class like any other aura, so no new list is needed for v1.

## View state and persistence

`useRotationView` state:

```ts
{
  players: { a: guid | null; b: guid | null };
  encounterId: string;          // v1: the single selected encounter
  window: { startMs: number; endMs: number };  // visible range, in aligned time
  align: "pull" | "first_cast";
  ignoredSpellIds: number[];
  pinnedAuraIds: number[];
  debuffTargetGuid: guid | null;
  sections: { auras: boolean; otherBuffs: boolean; otherDebuffs: boolean };
  cursorMs: number | null;      // not persisted
}
```

Defaults: A and B are the top two DPS players of the most common class in the
selection (or of the class of the first selected player). Debuff target is the
enemy with the most damage taken from A and B combined. Window is the full
encounter.

Instance view state no longer lives in the URL. Persistence is through the
share payload (`buildSharedViewPayload` / `applySharedViewPayload`): page
layouts get an optional `pageState` object, validated per page type in
`sharedViewImport.ts`. Zoom window and cursor are not shared in v1.

Ignored spells are a per-viewer convenience as well: store them in
`localStorage` keyed by class (try/catch, optional), so a warrior's ignore list
follows them across logs.

### Multiple encounters selected

v1 needs exactly one encounter. With zero or several selected, the page shows
an encounter picker in place of the timeline (one click selects that
encounter). This replaces the old panel's silent empty result.

## Page plumbing

- `InstancePageType` becomes `"empty" | "player_timeline"`. Keep one exported
  `INSTANCE_PAGE_TYPES` array and derive the type and the share-link
  validation from it, so adding a page is one place.
- The placeholder `page` preset becomes the `player_timeline` preset,
  labeled "Player Timeline", in slot 1 and as `DEFAULT_PRESET_ID` while it
  is built (handy for testing). When it is done it moves to a later slot and
  `summary` is the default again. The `"empty"` page type stays as the
  fallback content for unknown/unbuilt pages.
- Move `InstanceContentPage` out of `InstancePageView.tsx` into
  `pages/Instance/Pages/`.
- Page mode hides export / pop out / Layout Lab already. Reset view should
  also reset `useRotationView`.

## Rendering notes

- Positions are percentages of the visible window, as in the mockup. Lanes
  render only items inside the window plus a margin.
- Overview strip is a small custom SVG, not Nivo: it needs a brush, lead
  bars, a viewport box and a crosshair shared with the lanes. Nivo stays for
  existing panels.
- One crosshair state on the page; lanes and overview read it.
- Colors: A uses `--primary`, B uses `--accent`; casts by
  `--color-school-*`; player names by `--color-class-*`; idle hatching by
  `--destructive`; cursor by `--color-school-holy`. All existing tokens.
- Use `SpellIconWithTooltip` for icons. The cast tooltip is a custom
  `tooltipHeader`/`tooltipFooter` around it.
- Scroll containers use `styled-scrollbar`.
- Mobile: stack A and B, hide the overview brush, keep pan and zoom buttons.

## Phases

Each phase lands as its own commit with tests and a screenshot check on a
real log (see the frontend verify workflow).

1. **Plumbing.** Page type list, `player_timeline` preset, `pageState` in the share
   payload, `InstanceContentPage` moved, encounter picker for 0/2+ encounters.
   Tests: share payload round trip, unknown page type rejected.
2. **Data.** Processor plus `derive.ts` and `auraClassification.ts` with unit
   tests over hand-built event fixtures: cast pairing, cast-to-damage links
   (direct, periodic, AoE), idle gaps, align, lead, classification table.
   Then check numbers against an existing panel (Damage Done DPS) on a real
   log.
3. **Timeline.** `RotationTimeline` with header, overview, ruler, cast,
   swing and cooldown lanes, tooltip, crosshair, zoom/pan/brush.
4. **Auras.** `AuraSection`: key/other buffs, target picker and strip,
   key/other debuffs, pin/unpin, collapse.
5. **Polish.** Ignore tray and Ctrl+click, defaults, empty/loading states,
   share state, mobile, performance on a long (10 min+) encounter.

## Risks

- **Cast-log formats.** Logs without `spell_start` have no cast durations;
  cast bars and idle time use base cast time from spell metadata and are less
  accurate. The UI should not pretend otherwise.
- **Damage attribution** is a heuristic. Wrong links show up as damage on the
  wrong cast; tests must cover travel time, misses (no damage event) and
  procs that share a spell ID.
- **Idle definition for melee.** "Not casting" is not true idle for a
  warrior waiting for rage, but it is applied the same way to every player,
  so it is still a fair comparison between two warriors (decided). Absolute
  idle numbers across classes are not meaningful; the UI compares A to B,
  never to a fixed target.
- **Spell metadata fan-out** (one request per spell) may be slow.
- **Long encounters.** A 10 minute fight is about 600 casts per player and
  thousands of swings. Render only the visible window.
