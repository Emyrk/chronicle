# Layout Editor Skills (Reusable)

This document explains how Chronicle's shared layout editor works so it can be reused for both:
- user-facing layout tooling (Layout Lab), and
- guild page layout tooling.

## Core Component

- File: `GridLayoutEditor.tsx`
- Primitive: `react-grid-layout`
- Grid defaults:
  - `cols = 12`
  - `rowHeight = 110` (caller can override)
  - `minW` fallback = `4`
  - `minH` fallback = `4`
  - `maxW` fallback = `cols`
  - `maxH` fallback = `20`

## Data Contract

`GridEditorItem` is the portable layout item shape:

- `id: string` – stable slot id (`panel-1`, `panel-2`, etc.)
- `title: string` – optional display label (header mode)
- `x, y, w, h: number` – grid position + size
- optional constraints:
  - `minW`, `minH`, `maxW`, `maxH`

The editor maps this directly into `react-grid-layout` items and sends updates back through `onItemsChange`.

## Rendering Model

`GridLayoutEditor` is intentionally generic:

- It owns drag/resize and layout state translation.
- It does **not** know about panel business logic.
- Callers provide tile content with:
  - `renderItem: (item) => ReactNode`

This keeps layout behavior reusable across any page that needs draggable/resizable blocks.

## Container Sizing

The component measures its container width with `ResizeObserver` and passes width into grid layout. This allows responsive behavior without page-specific hacks.

## Interaction Rules

- Drag handle selector: `.grid-layout-editor-handle`
- `editable` toggles drag/resize on/off.
- `showItemHeader` controls whether the shared title/header chrome is rendered.

Layout Lab currently uses `showItemHeader={false}` and overlays its own controls.

## Layout Lab Integration Pattern

In `Settings.tsx` (`LayoutLabSettings`):

1. Keep `items` in local React state.
2. Pass `items` + `setItems` into `GridLayoutEditor`.
3. Keep separate panel-type state keyed by `item.id`.
4. For new items (`handleAddPanel`), set explicit constraints:
   - `minW: 4`
   - `minH: 4`
5. Imported layouts can omit constraints; editor fallbacks enforce safe minimums.

## Reuse Guidance for Guild Page

When reusing for guild pages:

1. Reuse `GridEditorItem` shape for persisted layout configs.
2. Reuse `GridLayoutEditor` as the only drag/resize surface.
3. Keep guild-specific metadata (panel settings, visibility, permissions) outside the editor state, keyed by `item.id`.
4. If guild layouts require stricter bounds, set per-item `min/max` values in the caller.
5. Keep serialization versioned (as Layout Lab does) for migration safety.

## Why This Structure Works

- Shared interaction model, page-specific content.
- Minimal coupling between grid mechanics and product features.
- Easy to apply the same editor to user and guild workflows.
