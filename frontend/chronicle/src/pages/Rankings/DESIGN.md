# Rankings Page — Design Document

## Overview

The Rankings page (`/rankings`) provides cross-instance DPS performance analysis for Classic World of Warcraft (Turtle WoW). It lets raid leaders scan class DPS distributions across all recorded boss encounters and drill into specific instances or bosses.

All data is currently **mocked** with a seeded PRNG. The frontend UX is being nailed down before any backend plumbing is built.

See also: `chronicle_dps_summary_view_spec.md` at the repo root for the full product spec (raid-leader scan page philosophy, gear bands, confidence labels, etc.).

---

## Navigation Flow

Three levels of specificity, each accessible via URL params:

```
DpsOverview (landing)          ?instance=&period=&classes=
    │
    ├─ click "View Instance →"
    ▼
InstanceView                   ?view=instance&instance=Molten+Core&period=&classes=
    │
    ├─ click boss "View All →"
    ▼
RankingsView (per-boss)        ?boss=molten-core--ragnaros&period=&classes=
```

Back navigation: Boss → Instance (if came from instance view) → Overview.

### URL State

| Param     | Values                              | Purpose                                   |
|-----------|-------------------------------------|-------------------------------------------|
| `boss`    | boss slug (e.g. `molten-core--ragnaros`) | When set, renders per-boss RankingsView |
| `view`    | `"instance"`                        | When `"instance"` + `instance` is set, renders InstanceView |
| `instance`| Instance name (e.g. `Molten Core`)  | Filters data to one instance (overview dropdown) or selects instance (instance view) |
| `period`  | `"all"` \| `"90d"` \| `"30d"` \| `"7d"` | Time period filter (omitted = `"all"`)  |
| `classes` | Comma-separated class names         | Class filter (omitted = all classes)      |

Routing priority in `RankingsPage.tsx`: `boss` → RankingsView | `view=instance` + `instance` → InstanceView | else → DpsOverview.

---

## Design Decisions

### DPS-Only

Rejected multi-metric tabs (HPS, Damage Done, Healing Done, Dispels, Interrupts). The original implementation had 6 tabs and a `MetricType` union — all stripped out. Rationale: DPS is the primary metric raid leaders care about for performance comparison. Other metrics can be added later if needed but add complexity without proportional value at this stage.

### Box Plots as Landing View

Rejected two alternatives:
- **Boss browser** (showed no data until drill-down — empty landing page)
- **Global leaderboard table** (too specific, not a useful overview)

Box plots give an immediate visual read of DPS distribution by class across all recorded encounters. They answer "how does Warrior DPS spread compare to Mage?" at a glance.

### Encounter Categorization — Unsolved

Considered splitting bosses into "Single Target" vs "Multi Target" categories but it doesn't map cleanly (e.g., Four Horsemen is 4 single targets). Raw DPS numbers across different encounters aren't directly comparable without normalization.

**Proposed but uncommitted**: Percentile normalization — compute each player's percentile within their boss kill, then aggregate percentiles across bosses. This makes cross-boss comparison meaningful but adds backend complexity.

### Box Plot Aggregation Limitation

Pre-computed box plot stats (min, q1, median, q3, max) **cannot be merged** across bosses — you need raw values or histograms. Current mock uses raw values with on-demand recomputation (fine for client-side mocked data).

**Backend recommendation**: Use histograms with fixed-width DPS bins and counts. Histogram bins can be summed across bosses, making aggregation feasible without storing every raw value.

---

## Component Architecture

| File | Purpose |
|------|---------|
| `RankingsPage.tsx` | Top-level router. Manages all URL state, dispatches to Overview/Instance/Boss views |
| `DpsOverview.tsx` | Landing page: instance dropdown, time/class filters, box plot chart, "Browse by Boss" section with instance links |
| `InstanceView.tsx` | Per-instance drill-down: summary cards, box plot scoped to instance, top-5 leaderboard cards per boss |
| `RankingsView.tsx` | Per-boss detail: summary cards, class/time filters, full rankings table, class breakdown chart |
| `BoxPlotChart.tsx` | Shared box plot visualization (rows with whisker/box/median + x-axis ticks + hover tooltips). Used by DpsOverview and InstanceView |
| `RankingsTable.tsx` | Desktop table + mobile card layout for individual boss rankings (medals, class colors, duration, guild, date) |
| `RankingsSummaryCards.tsx` | 4-card stat grid (Record DPS, Median, Total Records, Classes). Used by RankingsView |
| `ClassBreakdownChart.tsx` | Horizontal bar chart of average DPS by class with record counts. Used by RankingsView |
| `RankingsFilters.tsx` | Class toggle badges + time period segmented control. Used by RankingsView and InstanceView |
| `mockData.ts` | Seeded PRNG data generation, types, query/lookup functions, display helpers |
| `timePeriod.ts` | `TimePeriod` type and `getTimePeriodDays()` utility |
| `index.ts` | Re-exports `RankingsPage` |

---

## Mock Data (`mockData.ts`)

### Generation

Uses `mulberry32(42)` seeded PRNG for deterministic data. Generates 50–80 entries per boss with:
- **Weighted class distribution**: more Warriors (18), Rogues (14), Mages (14); fewer Druids (6), Paladins (8), Shamans (8)
- **DPS ranges per class**: Warriors 500–1200, Rogues 500–1100, Mages 400–1000, down to Priests 200–500
- **4 instances, 37 total bosses**: Molten Core (10), Blackwing Lair (8), Ahn'Qiraj (9), Naxxramas (10)
- 15 guild names, 10 character names per class, dates spread over 90 days

### Types

| Type | Fields |
|------|--------|
| `RankingEntry` | rank, playerName, className, value (DPS), durationMs, guildName, date, instanceId |
| `BossInfo` | id (slug), name, instanceName, totalKills |
| `InstanceInfo` | name, bosses[], totalRecords |
| `ClassAverage` | className, average, count |
| `RankingSummary` | record {value, playerName, className}, median, totalRecords, classCount |
| `BoxPlotStats` | className, min, q1, median, q3, max, count |

### Key Exports

| Export | Purpose |
|--------|---------|
| `INSTANCES` | Array of all `InstanceInfo` |
| `INSTANCE_NAMES` | String array of instance names |
| `ALL_DPS_CLASSES` | Array of 9 DPS class names |
| `CLASS_DISPLAY` | `WARRIOR` → `"Warrior"` display map |
| `CLASS_CSS_VAR` | `WARRIOR` → `"var(--color-class-warrior)"` |
| `getBossInfo(id)` | Lookup boss by slug |
| `getRankings(bossId)` | All entries for a boss (sorted desc) |
| `getTopEntries(bossId, n)` | Top N entries for a boss |
| `getInstanceByName(name)` | Lookup instance by name |
| `getAllEntries(instanceName?)` | All entries, optionally filtered to one instance |
| `computeBoxPlotStats(entries)` | Compute box plot stats grouped by class |
| `getClassAverages(entries)` | Compute average DPS per class |
| `getRankingSummary(entries)` | Compute summary stats (record, median, counts) |

---

## Visual Design

- **Dark mode only** — all components assume dark background
- **Brand color**: `#5F8FA6` (muted teal) for active states, links, accents
- **WoW class colors**: CSS custom properties (`var(--color-class-warrior)`, etc.)
- **Typography**: `font-mono` for all numeric values, Inter for body text
- **Border radius**: very tight (`rounded-md`, `rounded-xl` for cards)
- **Cards**: `rounded-xl border bg-card p-4/p-5`
- **Segmented controls**: `rounded-lg border border-white/10 bg-black/30`, active: `bg-[#5F8FA6] text-white`
- **Tables**: `rounded-xl border overflow-hidden`, header `bg-muted/50`, zebra `bg-muted/20`, hover `hover:bg-muted/40`
- **Medals**: 🥇🥈🥉 emoji for top 3 ranks
- **Tooltips**: Radix-based via `@/components/ui/Tooltip/tooltip`, box plot rows show detailed stats on hover (Min, Q1, Median, Q3, Max, IQR, Count)
- **Utilities**: `cn()` from `@/lib/utils` (clsx + tailwind-merge), Lucide React icons

---

## Open Questions

1. **Encounter normalization** — How to meaningfully compare DPS across different bosses? Percentile normalization is proposed but not committed. Affects whether the overview box plots show raw DPS or normalized percentiles.

2. **Backend data strategy** — Raw values won't scale. Histograms (fixed-width DPS bins with counts) are recommended since bins can be summed across bosses. Need to decide bin width and storage format.

3. **Spec alignment** — The `chronicle_dps_summary_view_spec.md` defines gear bands, confidence labels, and expandable player rows that haven't been implemented yet. These are future work.

4. **Per-boss view from instance context** — When navigating Boss → Back from an instance view, we preserve the instance context. Should the per-boss view also show instance-scoped data or always show global data?
