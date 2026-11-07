# Achievement system proposal

Status: exploratory product specification

## Summary

Chronicle can use achievements as a guided tour of the product. The system should reward users for learning useful workflows, not for repeatedly clicking controls or producing unnecessary data.

The proposed model uses:

- WoW-style categories for navigation.
- Tiered achievement series for increasing proficiency in one concept.
- Optional set achievements for selected collections where completing the set is meaningful.
- Achievement points as a record of breadth, with cosmetics as the primary reward.
- A visible global completion percentage for every achievement.
- Semantic product events so achievements are independent of individual React components.

This document inventories the current product, proposes an initial achievement catalog, and identifies the product and engineering decisions needed before implementation.

## Goals

1. Teach users that Chronicle's deeper analysis and customization features exist.
2. Turn feature discovery into an optional progression system.
3. Recognize meaningful use without encouraging spam, excessive uploads, or competitive manipulation.
4. Support related achievements as tiered series without requiring a capstone for every category or series.
5. Reuse Chronicle's existing character cosmetics where possible.
6. Keep achievement evaluation deterministic, idempotent, and auditable.
7. Allow the catalog to grow without changing the meaning of achievements already earned.

## Non-goals

- Gate core analysis features behind achievements.
- Reward high parses, leaderboard placement, or raid performance in the first version.
- Require a supporter tier to complete a category.
- Treat every button, panel, or filter type as a separate achievement.
- Require a capstone or set-completion award for every category or series.
- Add custom presets. Chronicle has built-in presets and saved layouts, but no custom preset inventory.
- Add or limit saved-filter slots. Filters are panel state and currently have no independent slot model.
- Replace the separate player Mastery and Renown rating proposal.

## Terminology

| Term | Meaning |
| --- | --- |
| Achievement | A one-time award for satisfying a versioned criterion. |
| Series | A group of achievements that represent increasing proficiency in one concept. |
| Tier | An achievement's level within a series. Tiers do not need to be completed in order unless the criterion naturally requires it. |
| Category | A WoW-style navigation group such as Layouts, Analysis, or Keybinds. |
| Set achievement | An optional achievement earned by completing a specifically defined collection of other achievements. |
| Achievement points | A non-spendable total representing completed achievements. |
| Mark | Proposed achievement terminology for a cosmetic treatment or badge. Existing character cosmetics use name, background, and border treatments. |
| Feat of Strength | A hidden, time-limited, retired, or unusual achievement outside the normal catalog. |

Chronicle already uses **Mastery** for a proposed player-performance rating. Achievement terminology should reserve **Mastery** for that rating system.

## Current product landscape

The repository already contains many stable actions suitable for achievements:

- Instance analysis supports encounter and time-range selection, totals and per-second modes, focus, comparison, metric breakouts, panel explainers, replay, and video synchronization.
- Panels can be added, replaced, copied, pasted, focused on supported entities, filtered, rearranged, resized, and opened in separate windows.
- Layouts can be edited, saved in the Layout Book, assigned to action-bar slots, imported, exported, shared, and opened in a separate window.
- Built-in presets are static product definitions. Saved Layout Book layouts are not custom presets.
- Keybind help currently documents layout, focus, inspect, compare, replay, map, and rotation-timeline controls.
- Chronicle also has uploads, rankings, character and guild discovery, guild pages, talent builds, gear lists, raid planning, and simulation workflows.

### Current implementation limits relevant to rewards

Chronicle currently enforces the following API and persistence limits. This inventory does not endorse them as permanent product policy or decide whether saved-layout capacity should become an achievement reward:

| Resource | Current limit |
| --- | ---: |
| Owned and tracked saved layouts combined | 30 |
| Panels in one saved layout | 8 |
| Saved layout payload | 10 KB |
| Action-bar layout-reference slots | 10, mapped to keys 1 through 0 |
| Default layouts | One desktop and one mobile |
| Custom panel installations | 32 |

There is no independent saved-filter quota.

Changing any of these values is a product and API contract change, not merely a cosmetic reward. The first achievement release should not vary these limits by account.

### Existing cosmetic and storage systems

Chronicle has a real character-cosmetic catalog with three slots:

- Name treatment
- Background treatment
- Border treatment

Cosmetic authorization currently derives from supporter tiers. Achievement-earned marks can reuse the rendering and selection experience, but they need an additive unlock source so achievements do not replace or weaken supporter entitlements. Achievement reward IDs should be distinct from supporter-only IDs, or catalog entries must explicitly support multiple unlock sources.

Account log storage is also entitlement-backed. New accounts receive a base grant, and supporter tiers add storage. Achievement storage grants are technically possible through the existing additive grant model, but they overlap a paid benefit. Storage should not be an initial achievement reward until the free and supporter progression policies are explicit.

## Product principles

### Reward learning, not opening menus

An introductory achievement may fire when a user discovers a feature. Higher tiers should require a completed, meaningful action.

Examples:

- Opening layout editing can be Tier I.
- Saving the edited layout is a higher tier.
- Sharing a layout that another account tracks is an advanced tier.

### Prefer breadth to repetition

“Use three different analysis tools” teaches more than “open the same breakout 100 times.” Count achievements should be rare and should reflect natural milestones rather than grind.

### Do not reward destructive or wasteful behavior

Avoid achievements for:

- Uploading arbitrary numbers of logs.
- Creating and deleting layouts repeatedly.
- Generating unused share links.
- Applying meaningless filters solely to increase a counter.
- Inflating page views, future live-collaboration joins, or tracked-layout counts with alternate accounts.

### Keep core capability available

Achievements may unlock cosmetics, profile presentation, or modest convenience. Core reporting, filtering, layouts, and sharing should remain available based on normal product permissions.

### Use account-wide progress by default

Most achievements describe learning Chronicle and should belong to the account. Character-specific rewards can be displayed on any linked character after the account unlocks them.

Guild achievements should record the account that performed the action. A guild can later have a separate achievement system if guild-level progression becomes desirable.

## Achievement shape

Each definition should include:

```text
id
version
category
series
tier
name
description
criteria
points
visibility
requirements
required_achievement_ids (set achievements only)
reward_ids
introduced_at
retired_at
```

Definitions should be immutable after release. A material criteria change creates a new version or replacement achievement. Names and descriptions can be corrected without changing earned state when the criterion remains identical.

### Eligibility and requirement indicators

Some achievements depend on account reputation, permissions, supporter access, report capabilities, or an unreleased feature. These prerequisites belong in structured `requirements` metadata and must be visible anywhere the achievement is shown.

Examples include `Requires Honored reputation`, `Requires guild-page edit permission`, or `Available after Live Collaboration launches`. A prerequisite is not achievement progress. The UI should distinguish a locked requirement from an incomplete criterion, and the global completion percentage still uses the catalog-wide account cohort.

### Point values

| Type | Points |
| --- | ---: |
| Discovery or simple first use | 5 |
| Completed workflow | 10 |
| Advanced workflow | 15 |
| Social or cross-feature workflow | 20 |
| Optional set achievement | 15 to 50 |
| Feat of Strength | 0 unless explicitly included in progression |

Points are not a currency. Spending points would make catalog changes and retired achievements much harder to reason about.

## Proposed category catalog

The catalog below is intentionally broader than a first release. Third-level headings are categories, and nested fourth-level headings are series within that category. The **Phase** column distinguishes a practical launch set from later instrumentation or product work.

- **Phase 1:** Existing action with a clear client or server completion boundary.
- **Phase 2:** Existing workflow that needs stronger durable instrumentation or cross-account attribution.
- **Future:** Depends on additional product behavior or a policy decision.

### Getting Started

| Achievement | Points | Criterion | Phase |
| --- | ---: | --- | --- |
| Welcome to Chronicle | 5 | Sign in for the first time. | Phase 1 |
| Known by Name | 10 | After reaching Honored reputation, link and verify a character. | Phase 1 |
| The First Record | 10 | Complete the first successful combat-log parse owned by the account. | Phase 1 |
| Open the Books | 5 | Open one of the account's successfully parsed reports. | Phase 1 |

The first version should not add achievements for upload counts. The successful parse is the useful outcome and is naturally durable.

### Report Explorer

#### Report Navigation

| Achievement | Points | Criterion | Phase |
| --- | ---: | --- | --- |
| Choose Your Battles | 5 | Change the selected encounters in a report. | Phase 1 |
| Pick Your Players | 5 | Select specific players or enemies for report analysis. | Phase 1 |
| A Matter of Time | 5 | Apply a custom time range. | Phase 1 |
| Rate of Change | 5 | Switch a supported panel between totals and per-second display. | Phase 1 |
| Read the Manual | 5 | Open a panel explainer. | Phase 1 |
| Follow the Action | 10 | Enter focus mode for a player, enemy, or other supported entity. | Phase 1 |
| Side by Side | 10 | Open a Comparison panel and select at least two source panels. | Phase 1 |

Opening a report is covered by Getting Started. This category begins when the user changes the report to answer a question.

#### Panel Craft

Panel Craft is a series within Report Explorer. It covers configuring the panels used to investigate a report, while saved layouts remain a separate concept.

| Achievement | Points | Criterion | Phase |
| --- | ---: | --- | --- |
| New Perspective | 5 | Apply a different built-in preset. | Phase 1 |
| Panel Craft I: Renovation | 5 | Replace one panel with a different panel type. | Phase 1 |
| Panel Craft II: Copy That | 10 | Copy a panel and paste it into another panel position. | Phase 1 |
| Panel Craft III: Single Subject | 10 | Focus a supported panel on one player. | Phase 1 |
| Panel Craft IV: Window Shopping | 10 | Open a single panel in a separate window. | Phase 1 |

Copy and paste should count only when the paste succeeds with a valid serialized panel configuration.

#### Filter Craft

| Achievement | Points | Criterion | Phase |
| --- | ---: | --- | --- |
| Filter Craft I: Narrow It Down | 5 | Apply a valid filter to a panel. | Phase 1 |
| Filter Craft II: The Exception | 10 | Use a negated filter. | Phase 1 |
| Filter Craft III: Both Things | 10 | Apply an expression with at least two AND-connected filters or groups. | Phase 1 |
| Filter Craft IV: Either Works | 10 | Apply an expression containing an OR-connected filter group. | Phase 1 |
| Filter Craft V: Fine Print | 15 | Apply a filter equivalent to `A AND (B OR C)`. | Phase 1 |

The system should evaluate the filter expression when it is successfully applied to a panel or persisted as part of a saved layout, not each intermediate editor change. Filter type completion should not be required because some streams and panels do not support every filter type.

### Layouts

| Achievement | Points | Criterion | Phase |
| --- | ---: | --- | --- |
| Layouts I: Move Things Around | 5 | Finish a layout edit that moves or resizes at least one panel. | Phase 1 |
| Layouts II: Strip It Down | 5 | Add and use a strip in a layout. | Phase 1 |
| Layouts III: Group Project | 5 | Add a group and place a panel or strip inside it. | Phase 1 |
| Layouts IV: Make Yourself at Home | 10 | Save a custom layout in the Layout Book. | Phase 1 |
| Layouts V: Ready for Action | 10 | Assign a saved layout to an action-bar slot. | Phase 1 |
| Layouts VI: Another Point of View | 10 | Open a full layout in a separate window. | Phase 1 |
| Layouts VII: Pack It Up | 10 | Export or copy a valid layout payload. | Phase 1 |
| Layouts VIII: Unpack It | 10 | Successfully import a valid layout payload. | Phase 1 |
| Layouts IX: Trendsetter | 20 | Another account tracks the user's shared layout. | Phase 2 |

Trendsetter needs server-observed attribution. Copying a share link alone is not sufficient. Self-use and repeated imports by the same recipient should not count.

### Keybinds

Keybind achievements should be their own category rather than higher tiers of unrelated feature series. They recognize a more efficient way to perform an already available action.

| Achievement | Points | Criterion | Phase |
| --- | ---: | --- | --- |
| Keybinds I: Quick Edit | 5 | Use `Shift+E` to enter or finish layout editing. | Phase 1 |
| Keybinds II: Focused | 5 | Use `Shift+F` to enter or leave focus mode. | Phase 1 |
| Keybinds III: At Your Fingertips | 10 | Apply an assigned layout with a `0` through `9` action-bar key. | Phase 1 |
| Keybinds IV: Inspect Element | 10 | Open an entity menu with `Alt/Option+click`. | Phase 1 |
| Keybinds V: Big Picture | 10 | Use a registered fullscreen keybind for a supported view. | Phase 1 |
| Keybinds VI: Playback Control | 10 | Use a registered replay keyboard control to change playback. | Phase 1 |
| Keybinds VII: Hands on the Timeline | 15 | Use a registered rotation-timeline keyboard or modified-mouse command. | Phase 1 |

The event must originate from the registered keybind path. Performing the equivalent action by clicking should award the feature achievement, but not the Keybind achievement.

Keybind descriptions should be platform-aware. Display `Option` and `Cmd` on macOS where appropriate.

### Breakouts and Comparison

| Achievement | Points | Criterion | Phase |
| --- | ---: | --- | --- |
| Deeper Look I: Break It Out | 5 | Open a metric breakout from a supported row. | Phase 1 |
| Deeper Look II: Source Material | 10 | Where supported, drill from a breakout into an ability, source, or target detail view. | Phase 1 |
| Deeper Look III: Cause of Death | 10 | Open a death or incoming-events analysis for a selected entity. | Phase 1 |
| Deeper Look IV: Keep It in View | 10 | Pin or expand a supported breakout. | Phase 1 |
| Deeper Look V: Compare Notes | 15 | Open a breakout from a source panel selected in a Comparison panel. | Phase 1 |

Criteria should be capability-based. A report that lacks the required stream should not advertise an impossible next step.

### Replay and Map

| Achievement | Points | Criterion | Phase |
| --- | ---: | --- | --- |
| Replay I: Rewind | 5 | Open replay for a supported report. | Phase 1 |
| Replay II: Action | 10 | Start, pause, or seek replay with a registered playback control. | Phase 1 |
| Replay III: Walk the Battlefield | 10 | Enter walk or free-camera mode and move the camera. | Phase 1 |
| Replay IV: Time and Place | 10 | For a report with map or replay entity selection, select an event or entity and inspect related report data. | Phase 2 |
| Replay V: Director's Cut | 15 | Use replay with synchronized video. | Phase 2 |

Replay achievements must only be shown when the selected report supports the relevant replay capability.

### Sharing

| Achievement | Points | Criterion | Phase |
| --- | ---: | --- | --- |
| Pass It On | 5 | Copy a valid shareable report view link. | Phase 1 |
| Fresh Eyes | 10 | Open a shared report view created by another account. | Phase 2 |

Shared-link opens must exclude the creator, automated previews, and known crawlers.

### Future: Live Collaboration

Live Collaboration is not released. These achievements are product ideas only and must remain unavailable until the feature launches.

| Achievement | Points | Criterion | Phase |
| --- | ---: | --- | --- |
| Assemble the Group | 10 | Start a live collaboration session and create an invite link. | Future |
| Company | 15 | Have another account join a live collaboration session created by the user. | Future |
| In Sync | 20 | Change synchronized session state while at least one other account is present. | Future |

### Guild Builder

| Achievement | Points | Criterion | Phase |
| --- | ---: | --- | --- |
| Guild Builder I: Put Up a Sign | 10 | Save an eligible guild page for the first time. | Phase 1 |
| Guild Builder II: Room to Grow | 10 | Add and save a new guild-page panel. | Phase 1 |
| Guild Builder III: Turn the Page | 10 | Add and save a new guild-page tab. | Phase 1 |
| Guild Builder IV: Make It Yours | 10 | Save a guild-page header or theme customization. | Phase 1 |
| Guild Builder V: Now Recruiting | 15 | Save a guild page with a configured recruitment or application destination. | Phase 1 |

Only successful, authorized saves count. Opening the editor or making unsaved changes does not count.

### Rankings and Discovery

| Achievement | Points | Criterion | Phase |
| --- | ---: | --- | --- |
| Scout I: The Standings | 5 | Open an encounter ranking or leaderboard. | Phase 1 |
| Scout II: Know Your Competition | 5 | Open a character from search or a ranking. | Phase 1 |
| Scout III: Guild Research | 5 | Open a guild from search or a ranking. | Phase 1 |
| Scout IV: Through the Years | 10 | Open a supported character, guild, or raid history view. | Phase 1 |
| Scout V: Keep an Eye on This | 10 | Add a supported entity or report to favorites. | Phase 1 |

These achievements recognize using discovery tools. They do not reward the user's own leaderboard position.

### Planning and Theorycraft

| Achievement | Points | Criterion | Phase |
| --- | ---: | --- | --- |
| Theorycraft I: Build a Build | 10 | Save a talent build. | Phase 1 |
| Theorycraft II: Show Your Work | 10 | Copy a valid share link for a talent build. | Phase 1 |
| Theorycraft III: Run the Numbers | 10 | Complete a supported simulation. | Phase 1 |
| Theorycraft IV: Dressed for the Occasion | 10 | Save a gear list or progression plan. | Phase 1 |
| Theorycraft V: Assemble the Raid | 10 | Save a raid-planner composition. | Phase 1 |
| Theorycraft VI: No Need to Type It Twice | 15 | Successfully import a supported raid-plan or roster format. | Phase 1 |

### Optional set achievements

Set achievements are available when a collection creates a distinct accomplishment that is more meaningful than its parts. They are not the default ending for a category or series.

Potential examples:

| Achievement | Points | Criterion | Phase |
| --- | ---: | --- | --- |
| Command Center | 20 | Earn Panel Craft IV, Layouts V, and Layouts VI. | Phase 1 |
| Chronicle Field Guide | 25 | Earn a deliberately selected cross-category set of discovery achievements. | Future |

A set achievement should have its own identity, icon, and reason to exist. Do not add one merely because a category has several achievements. Its required achievement IDs and versions must be frozen when released so later catalog growth does not revoke or silently change it.

## Feats of Strength

Feats of Strength can recognize unusual or retired moments without affecting the normal catalog.

Potential examples:

- Participated in an achievement-system beta.
- Used a feature before a major redesign or retirement.
- Participated in an official Live Collaboration test event before release.
- Imported a layout format that was later retired.
- Completed an official Chronicle community challenge.

These should be rare. Product usage that every new user can still perform belongs in normal categories.

## Rewards

### Initial recommendation

Use rewards in this order:

1. Achievement points and achievement completion presentation.
2. Marks attached to selected achievements.
3. Profile titles, badges, or a small achievement showcase.
4. Point-threshold cosmetics.
5. Only later, modest account convenience or storage grants.

### Achievement mark directions

Selected achievements can award a themed treatment or badge. A category does not automatically need a capstone or cosmetic. These are art directions, not IDs that exist in the current catalog. Implementing them requires new name, background, or border treatment IDs, or a new badge/title renderer:

| Category | Cosmetic direction |
| --- | --- |
| Getting Started | Chronicle quill or open book |
| Report Explorer | Spyglass or map |
| Panel Craft | Framed grid |
| Filter Craft | Funnel or precision reticle |
| Layouts | Architect's grid |
| Keybinds | Keyboard or crossed keys |
| Breakouts and Comparison | Magnifying lens |
| Replay and Map | Compass or director's frame |
| Sharing | Linked rings |
| Guild Builder | Banner or guild hall |
| Rankings and Discovery | Laurel or scouting eye |
| Planning and Theorycraft | Blueprint or cog |

Achievement cosmetics should use a distinct unlock source while sharing the existing cosmetic catalog and renderer where the treatment model fits. Achievement reward IDs must remain distinct from supporter-only IDs unless a catalog item explicitly supports multiple unlock sources. Supporter and achievement permissions should combine as a union.

### Point thresholds

Point-threshold rewards are future product work. If adopted, the initial thresholds should award presentation rather than product capacity:

| Points | Suggested reward |
| ---: | --- |
| 100 | First achievement profile badge |
| 250 | Achievement showcase slot |
| 500 | Name-treatment mark |
| 750 | Background-treatment mark |
| 1,000 | Border-treatment mark or Chronicle Expert title |

Exact thresholds should be selected after the launch catalog's total points are known. A threshold should represent an understandable fraction of the available core points.

### Deferred rewards

#### Layout capacity

Chronicle currently allows 30 owned and tracked layouts combined. Increasing that limit is possible, but it introduces account-specific quota behavior and makes shared-layout tracking harder to explain. Do not use layout capacity as a launch reward.

If revisited, the reward should say exactly what changes, such as “increase the combined owned-and-tracked layout maximum from 30 to 35.” It must also say whether tracked shared layouts continue consuming the same combined quota. It should not say “more layout slots” because action-bar references, saved layouts, defaults, and panel count are separate limits.

#### Storage

Achievement-earned storage could be represented as a permanent additive data grant. Before adopting it, decide:

- Whether it stacks with supporter storage.
- Whether it is permanent.
- Whether points or achievements can ever be revoked.
- How much free storage can be earned without weakening supporter value.
- Whether abuse through duplicate accounts is acceptable.

A small one-time grant attached to an intentionally broad set achievement is safer than repeated grants for upload-related achievements.

#### Feature unlocks

Do not gate filters, presets, panel types, breakouts, comparison, or core layout editing behind achievements. These features are the curriculum the system is teaching.

## Event model

Achievements should consume semantic events rather than import or call UI code directly.

Example envelope:

```json
{
  "event_id": "01J...",
  "event_type": "layout.edit_finished",
  "event_version": 1,
  "account_id": "...",
  "subject_type": "report",
  "subject_id": "...",
  "occurred_at": "...",
  "properties": {
    "method": "keyboard_shortcut",
    "moved_panels": 1,
    "resized_panels": 0
  }
}
```

### Candidate event families

These names are proposed instrumentation. Chronicle does not currently expose a universal achievement event ledger, and each accepted family must be added at its authoritative action boundary.

```text
account.signed_in
character.linked
log.parse_completed
report.opened
report.encounters_changed
report.time_range_applied
report.display_rate_changed
report.focus_changed
comparison.source_panels_changed
panel.type_changed
panel.clipboard_pasted
panel.filter_applied
panel.breakout_opened
panel.popup_opened
layout.edit_started
layout.edit_finished
layout.saved
layout.action_slot_assigned
layout.action_slot_cast
layout.popup_opened
layout.exported
layout.imported
layout.share_opened
keybind.invoked
replay.opened
replay.playback_changed
replay.camera_moved
guild_page.saved
ranking.opened
entity.opened_from_search
favorite.created
talent_build.saved
simulation.completed
gear_plan.saved
raid_plan.saved
```

Not every client event needs to be stored forever. The server can evaluate simple one-time events immediately and retain only the durable completion record. Events used for cross-account attribution, counts, or audit should have durable identifiers.

### Idempotency

- Every accepted event has a unique `event_id`.
- Achievement completion has a unique key on account, achievement ID, and definition version.
- Replaying an event cannot grant points or rewards twice.
- Cross-account events identify both actor and recipient where privacy rules allow it.
- A server-authoritative event wins over a client claim for uploads, layout sharing, guild saves, account links, and other durable actions.

### Client and server authority

| Action type | Preferred authority |
| --- | --- |
| Keybind use, panel popup, local breakout, editor interaction | Client event validated against current account/session context |
| Upload and parse completion | Server |
| Saved layout and layout tracking | Server |
| Shared-link recipient open | Server redirect or authenticated landing event |
| Character link | Server |
| Guild-page save | Server |
| Future live-collaboration join and synchronized state | Session service/server after feature release |
| Simulation completion | Server when remote, client result event when browser-only |

Client-only achievements are inherently easier to spoof. That is acceptable for low-stakes cosmetics if the threat model is explicit. Capacity, storage, or paid-equivalent rewards require server authority.

## Progress and evaluation

Achievements fall into four evaluator shapes:

1. **One-shot:** The first accepted matching event completes the achievement.
2. **Multi-action:** The account must complete several distinct actions.
3. **Counter:** Distinct qualifying subjects or events reach a threshold.
4. **Achievement set:** A specifically declared list of achievement IDs and versions is complete.

The launch catalog should prefer one-shot and multi-action evaluators. Achievement-set evaluators should be used selectively, and counters introduce the most abuse and backfill complexity.

For expression-based criteria, store a compact progress projection rather than replaying all historical events on every request.

## Completion percentage

Every achievement must display the percentage of users who have earned it. The standard label is:

```text
12.4% of users have this achievement
```

The percentage is part of the achievement contract, not an optional analytics view. It appears on achievement cards, detail views, search results, earned-achievement views, and set-achievement entries.

### Calculation

For a normal achievement:

```text
completion_percentage = earned_eligible_accounts / eligible_accounts * 100
```

Use one consistent account cohort across the active catalog so percentages remain comparable between achievements. The cohort should:

- Count accounts, not characters.
- Exclude deleted, banned, internal, test, and identified automated accounts.
- Include accounts that have used an achievement-bearing Chronicle surface during the catalog's measurement window.
- Include both supporters and non-supporters.
- Apply the same retroactive-credit policy used by the achievement evaluator.

Do not change the denominator per achievement based on the current report, device, server capabilities, or whether the account has discovered the feature. Those constraints can affect completion, but a custom denominator would make two displayed percentages mean different things.

Retired achievements and Feats of Strength should freeze their percentage and denominator when they retire. Versioned replacement achievements begin a new percentage rather than inheriting the old definition's rate.

### Display rules

- Show one decimal place from `0.1%` through `99.9%`.
- Show `Less than 0.1%` for a nonzero rate below `0.1%`.
- Show `0%` only when no eligible account has earned the achievement.
- Show `100%` only when every eligible account has earned it.
- Hidden achievements still expose their completion percentage. Their name and criteria may remain hidden until earned.
- Aggregate percentages never reveal which accounts earned an achievement.
- Cache aggregate counts and update them asynchronously. Achievement completion itself must not wait for global percentage recomputation.

The aggregate projection should retain at least:

```text
achievement_id
achievement_version
earned_eligible_account_count
eligible_account_count
completion_percentage
calculated_at
frozen_at
```

## Retroactive credit

Retroactive awards are desirable when Chronicle already has authoritative evidence:

- Linked characters
- Successful owned parses
- Saved layouts
- Layout action-bar assignments
- Guild-page saves or ownership
- Saved talent builds, gear plans, or raid plans

Do not infer retroactive completion from ambiguous state:

- A saved layout containing a filter does not prove the user intentionally learned filter editing.
- A currently focused report does not prove the user used a keybind.
- A shareable object does not prove another account opened the share link.
- Existing cosmetics do not prove an achievement was completed.

The achievement UI should identify retroactively awarded achievements without pretending their completion timestamp is exact. Use the earliest authoritative evidence timestamp when available, otherwise the migration award timestamp.

## Privacy and social attribution

- Public achievement display should be opt-in or follow the existing profile visibility model.
- Do not expose who opened another user's share link without consent.
- Social achievements only need to say that a qualifying recipient action occurred.
- Anonymous users may contribute to aggregate product analytics, but should not satisfy identity-dependent recipient criteria unless abuse protections are sufficient.
- Deleting an account should remove personal progress and public presentation according to Chronicle's normal deletion policy.

## Abuse and edge cases

- Exclude self-opens from social achievements.
- Count one recipient account once for a specific shared object where applicable.
- Ignore bots, link unfurlers, and known crawlers.
- Require successful persistence before awarding save/import achievements.
- Do not award on canceled layout edits or invalid filter expressions.
- Do not require a capability that the current server, report, or device cannot provide.
- A set achievement that includes keybinds must account for touch-only users or be clearly optional and platform-specific.
- Avoid achievements tied to supporter-only cosmetics or permissions.
- Define how merged, unlinked, banned, or deleted accounts affect progress before attaching valuable account capacity.

## User experience

### Achievement browser

The browser should provide:

- Category navigation.
- Earned points and total available core points.
- Series and tier presentation.
- Set-achievement progress where a set achievement exists.
- The percentage of users who have earned every listed achievement.
- Search and filters for earned, in progress, hidden, and reward-bearing achievements.
- Capability-aware descriptions so impossible actions are not promoted in the current context.
- A clear link from an achievement to the relevant Chronicle feature where practical.

### In-context discovery

Chronicle can surface a small “next step” without turning every page into a checklist:

- The first time a user opens layout editing, suggest saving the result.
- After saving a layout, mention action-bar assignment.
- After opening a breakout, mention deeper drill-down.
- After applying one filter, introduce boolean groups.

Suggestions should be dismissible and should stop after the related achievement is earned.

### Completion notifications

A completion toast should show:

- Achievement name and icon.
- Points earned.
- Series tier or set-achievement status, when applicable.
- The percentage of users who have earned it.
- Reward, if any.
- A link to inspect the category.

Multiple completions caused by migration or backfill should be summarized rather than generating a large toast queue.

## Rollout proposal

### Phase 0: Instrumentation

- Define event names and ownership rules.
- Add an internal event inspection surface.
- Measure event quality without granting achievements.
- Confirm that keybind, layout, panel, filter, breakout, and guild save events fire exactly once per completed action.

### Phase 1: Learning achievements

Launch a focused catalog of roughly 25 to 35 achievements from:

- Getting Started
- Report Explorer, including Report Navigation, Panel Craft, and Filter Craft
- Layouts
- Keybinds
- Breakouts and Comparison
- Rankings and Discovery

Include points, completion toasts, and a small set of cosmetic marks attached to selected achievements. Do not require category capstones, storage, or variable quotas.

### Phase 2: Social and advanced workflows

Add:

- Recipient-attributed layout sharing.
- Live Collaboration achievements only after that feature is released.
- Replay and video synchronization.
- Guild Builder.
- Planning and Theorycraft.
- A small number of intentional set achievements where the combined accomplishment has a clear identity.

### Phase 3: Reward expansion

After observing completion rates and supporter impact, consider:

- More achievement-only cosmetic IDs.
- Profile achievement showcases.
- A small permanent storage grant attached to a deliberately broad set achievement.
- Carefully specified layout-capacity rewards, if users actually encounter the existing quota.

## Decisions required before implementation

1. Which collections, if any, deserve a set-completion achievement?
2. What makes a set achievement meaningful enough to add instead of treating points as the breadth signal?
3. Are achievement cosmetics displayed through the existing three character-cosmetic slots, or through a new badge/title slot?
4. Can non-supporters equip achievement-earned cosmetic IDs while supporter-only IDs remain tier-gated?
5. Which achievement events must be server-authoritative?
6. How much historical progress should be backfilled?
7. Are achievements private by default, profile-visible by default, or governed by existing profile visibility?
8. Should social achievements require authenticated recipients?
9. Should points remain presentation-only permanently, or can they unlock rewards at fixed thresholds?
10. Should the existing 30-layout quota remain universal?
11. Is any storage reward worth the overlap with supporter storage benefits?

## Recommended first decision

Approve the taxonomy and a Phase 1 catalog before choosing storage or quota rewards. The feature-discovery loop is valuable on its own, and cosmetic marks provide a reward path that does not require changing Chronicle's core limits.
