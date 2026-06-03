# @chronicle/wow-tooltip-renderer

Pure TypeScript renderer for World of Warcraft spell and item tooltips built from
DBC-style records. **No React, no fetch, no styling** — data in, strings (and hex
colors) out. The React tooltip components and data fetching live in a separate
package / the consuming app.

## Why

Chronicle and Chronicle Wiki both render tooltips from spell/item records whose
text contains template variables (`$s1`, `$o1`, `$d`, `$23455s1`, `$lpoint:points;`,
`${$m1*3}`, …). This package owns the deterministic resolution of those templates
and the static game-data lookup tables, so consumers don't hand-roll their own.

## Usage

```ts
import {
  extractReferencedSpellIds,
  resolveSpellDescription,
} from "@chronicle/wow-tooltip-renderer";

// 1. Find cross-spell references the template needs.
const refIds = extractReferencedSpellIds(template); // e.g. [23455]

// 2. The app fetches those spells (app owns tenant-aware API base URLs) and
//    builds a Map<number, WoWSpell>.

// 3. Resolve. The resolver never fetches.
const text = resolveSpellDescription(spell, template, referencedSpells, 60);
```

Item tooltips use the same spell resolver for Use/Equip/Chance-on-hit effects,
socket bonuses, and set bonuses, plus pure formatters/constants:

```ts
import {
  formatItemStat,   // (statType, value) -> { text, green }
  calculateDPS,     // (damageRange, delayMs) -> number | null
  getQualityColor,  // quality level -> hex
  STAT_DISPLAY, INVENTORY_TYPE_TEXT, SOCKET_INFO, /* ... */
} from "@chronicle/wow-tooltip-renderer";
```

## Design rules

1. The resolver is pure and deterministic; it never fetches.
2. The consuming app owns tenant-aware API base URLs and data fetching.
3. Colors are exported as **hex values**, not CSS-framework classes.
4. Missing cross-referenced spells leave the placeholder visible (for diagnosis).

## Template grammar

The resolver is a single left-to-right pass (see `src/spell/resolver.ts` for the
documented grammar). Supported escapes:

| Variable | Meaning |
| --- | --- |
| `$s1`/`$m1`, `$s2`, `$s3` | Effect value (single or `min to max` range) |
| `$o1`/`$o2`/`$o3` | Periodic total over the spell duration |
| `$d`, `$dN` | Duration |
| `$t`, `$tN` | Tick interval (seconds) |
| `$a1` | AOE radius |
| `$r`, `$n`, `$h`, `$u`, `$v`, `$x1`, `$b1`, `$e1` | range / charges / proc chance / stacks / etc. |
| `$NNNNs1` | Cross-spell reference (e.g. `$23455s1`) |
| `$*N;s1`, `$/N;s1` | Multiply / divide a value |
| `${expr}` | Inline arithmetic (variables resolve first, then evaluate) |
| `$lsingular:plural;` | Pluralization (uses the most recent number) |
| `$gmale:female;` | Gender (defaults to male — no caster gender at tooltip time) |

## Tests

```sh
pnpm install
pnpm test        # unit + golden fixture tests
pnpm typecheck
```

A **parity test** in the Chronicle frontend
(`frontend/chronicle/src/api/wowdb.parity.test.ts`) asserts this package produces
byte-for-byte identical output to Chronicle's incumbent resolver across every
generated DBC vector, for all servers. That incumbent resolver
(`frontend/chronicle/src/api/wowdb.ts`) is retained during the migration as the
comparison baseline.
