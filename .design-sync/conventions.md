# Chronicle conventions (read before building)

Chronicle is a **dark-first** WoW combat-log analytics UI: shadcn-style Radix primitives + Tailwind 4 utilities over CSS custom-property tokens.

## Wrapping and setup — required

Wrap every screen you build in `DsProvider`:

```jsx
const { DsProvider, Card, CardHeader, CardTitle, CardContent, Button } = window.Chronicle;

<DsProvider>
  <div className="min-h-screen bg-background text-foreground p-6">
    <Card>
      <CardHeader><CardTitle>Raid Summary</CardTitle></CardHeader>
      <CardContent className="flex items-center gap-4">
        <Button>View encounters</Button>
        <Button variant="secondary">Export</Button>
      </CardContent>
    </Card>
  </div>
</DsProvider>
```

Without it: components that fetch (`NavBar`, `RecentRaids`, `LogsListView`, tooltips with data) crash with "No QueryClient set", and the dark theme class is missing so everything renders in the wrong (light) palette. `DsProvider` accepts `theme="dark" | "light"` (default dark — the product's real look).

Routing components (`NavBar`, `Layout`, `Login`, `RecentRaids`, `RaidCard`, anything with links) also need a router: wrap in `MemoryRouter` (exported, as are `BrowserRouter`, `Link`, `NavLink`, `Outlet`, `Routes`, `Route`):

```jsx
<DsProvider><MemoryRouter><NavBar /></MemoryRouter></DsProvider>
```

## Styling idiom — Tailwind utilities over semantic tokens

Style YOUR layout glue with Tailwind utility classes over the theme tokens — never hex colors, never inline color styles:

- Surfaces: `bg-background`, `bg-card`, `bg-popover`, `bg-muted`, `bg-accent`, `bg-primary`, `bg-secondary`
- Text: `text-foreground`, `text-muted-foreground`, `text-primary-foreground`, `text-accent-foreground`, `text-destructive`
- Borders/radius: `border-border`, `rounded-lg` (radius comes from `--radius`)
- Fonts: default is Inter (loads via `styles.css`); `font-mono` for Roboto Mono; `font-wow` for the Friz Quadrata WoW display face (use it for spell/instance titles only)

Domain tokens (this is a WoW analytics product — use them for game-colored data):
- Class colors: `text-class-druid`, `text-class-mage`, `text-class-warrior`, … (`hunter`, `paladin`, `priest`, `rogue`, `shaman`, `warlock`, `deathknight`, `enemy`, `creature`)
- Spell schools: `text-school-fire`, `text-school-frost`, `text-school-nature`, `text-school-shadow`, `text-school-holy`, `text-school-arcane`, `text-school-physical`
- Charts: CSS vars `--chart-1` … `--chart-5`

**The stylesheet is compiled Tailwind 4 — only classes already in `_ds_bundle.css` exist.** Standard layout/spacing utilities (`flex`, `grid`, `gap-*`, `p-*`, `m-*`, `w-*`, `items-*`, `justify-*`, `text-sm/base/lg`) are all present; before using an exotic utility, check it appears in `_ds_bundle.css`. If a class is missing, compose from CSS vars (`style={{ background: "var(--card)" }}`) rather than inventing class names.

## Where the truth lives

- `styles.css` → imports `fonts/fonts.css` + `_ds_bundle.css` (all tokens, all component styles). Read `_ds_bundle.css` for the exact token/utility vocabulary.
- Per component: `components/<group>/<Name>/<Name>.prompt.md` (usage + variants) and `<Name>.d.ts` (props contract).
- Component variants follow shadcn conventions: e.g. `Button` has `variant` (`default | destructive | outline | secondary | ghost | link | button-bright`) and `size` (`default | sm | lg | icon`).

## Domain pieces worth reaching for

`SpellTooltip` (WoW spell tooltip card), `PlayerMetricChart` (DPS/HPS bar chart with ability breakdown), `RaidCard` / `RecentRaids` (raid summaries), `EventsPanel` (encounter event feeds), `Table` family, `TenantBanner`/`BlockingDialog` (instance gating). Spell/ability icons load from `https://icons.chronicleclassic.com/turtle/<name>.webp`.
