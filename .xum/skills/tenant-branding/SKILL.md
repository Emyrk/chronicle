---
name: tenant-branding
description: |
  Chronicle's multi-tenant branding and CSS theming system. Covers the Branding struct,
  server-side CSS injection via Go templates, the ThemeEditor component, and how branding
  flows from database → API → HTML template → React components. Use when: modifying
  branding fields, adding theme knobs, changing how logos/colors/titles render, or
  debugging tenant vs site-level branding resolution.
---

# Tenant Branding & CSS Theming

## Overview

Chronicle supports per-tenant and per-site visual branding: custom logos, page titles, favicons, taglines, and a full CSS color theme. Branding is stored as JSONB in the database and flows through two paths:

1. **Server-side (Go template):** Title, favicon, and CSS color overrides are injected into `index.html` before the browser sees any content — zero flash of default colors.
2. **Client-side (React):** Logos, display name, and tagline are read from `siteConfig` via React Query and rendered in NavBar, Footer, and Login components.

## Branding Struct

**File:** `api/chroniclesdk/tenant.go`

```go
type Branding struct {
    SquareLogo       string            `json:"square_logo,omitempty"`
    LogoWide         string            `json:"logo_wide,omitempty"`
    Favicon          string            `json:"favicon,omitempty"`
    DisplayName      string            `json:"display_name,omitempty"`
    Tagline          string            `json:"tagline,omitempty"`
    Description      string            `json:"description,omitempty"`
    BackgroundBanner string            `json:"background_banner,omitempty"`
    Tags             []string          `json:"tags,omitempty"`
    Theme            map[string]string `json:"theme,omitempty"` // CSS color overrides, hex "#RRGGBB"
}
```

Stored in the `branding` JSONB column on both the `tenants` table and the `site_config` table. No migration needed when adding new JSON keys.

## Branding Resolution (priority order)

```
Request arrives → servicetenant.Middleware extracts tenant from Host header
    ↓
1. Tenant branding (siteConfig.tenant.branding)  — if on a tenant subdomain
2. Site-level branding (siteConfig.branding)      — fallback for root domain
3. Defaults (hardcoded in CSS / index.html)       — when no branding configured
```

**Frontend pattern (used in NavBar, Footer, Login):**
```typescript
const branding = siteConfig?.tenant?.branding ?? siteConfig?.branding ?? null;
```

## Server-Side CSS Injection (Theme Colors)

Theme colors are injected **before first paint** via Go template → inline style attribute. No FOUC.

### Data flow

```
brandingResolver(r) → buildThemeCSS(branding) → HTMLBranding.ThemeCSS
    → htmlState.ThemeCSS → <html style="{{ .ThemeCSS }}">
```

### Key files

| File | Role |
|------|------|
| `api/api.go` | `brandingResolver()` — resolves branding per request (tenant-first, site fallback) |
| `api/api.go` | `buildThemeCSS()` — validates hex, expands theme map to CSS variable declarations |
| `api/api.go` | `themeKnobs` — maps knob names to CSS custom properties |
| `frontend/frontend.go` | `HTMLBranding` struct (Title, Favicon, ThemeCSS) |
| `frontend/frontend.go` | `htmlState` struct — passed to Go template execution |
| `frontend/chronicle/index.html` | `<html style="{{ .ThemeCSS }}">` — injection point |

### Theme Knobs

Each knob maps to one or more CSS custom properties. The backend `themeKnobs` map (in `api/api.go`) must stay in sync with the frontend `KNOBS` array (in `ThemeEditor.tsx`).

| Knob key | Default hex | CSS variables set | Method |
|----------|-------------|-------------------|--------|
| `primary` | `#5F8FA6` | `--primary`, `--tertiary` | Direct |
| `primary` | | `--primary-darker`, `--sidebar-primary` | `color-mix(in oklch, <hex> 60%, black)` |
| `primary` | | `--ring`, `--sidebar-ring` | `color-mix(in oklch, <hex> 75%, black)` |
| `accent` | `#89744D` | `--secondary`, `--accent`, `--sidebar-accent` | Direct |
| `background` | `#2B2B2B` | `--background` | Direct |
| `card` | `#262626` | `--card`, `--muted`, `--sidebar`, `--popover` | Direct |
| `border` | `#383838` | `--border`, `--input`, `--sidebar-border` | Direct |
| `foreground` | `#E6E8EA` | `--foreground`, `--card-foreground`, `--popover-foreground`, `--secondary-foreground`, `--accent-foreground`, `--sidebar-foreground`, `--sidebar-accent-foreground` | Direct |
| `muted_text` | `#B4B0AC` | `--muted-foreground` | Direct |
| `link` | `#26A9F1` | `--link` | Direct |
| `destructive` | `#EF4444` | `--destructive` | Direct |

**Validation:** Only hex values matching `^#[0-9a-fA-F]{6}$` are emitted. Invalid values are silently skipped.

**Derived values:** The `primary` knob produces darker/ring variants via CSS `color-mix()`. If Tailwind opacity modifiers (`/90`) break with `color-mix()`, replace with Go-side hex darkening to produce raw hex values.

### Adding a new theme knob

1. Add entry to `themeKnobs` in `api/api.go` with `direct` and optional `derived` CSS variable lists
2. Add entry to `KNOBS` array in `frontend/chronicle/src/components/ThemeEditor/ThemeEditor.tsx` with `key`, `label`, `defaultHex`, `description`
3. No migration or type regeneration needed — the `theme` map accepts arbitrary keys

## Server-Side Template Variables

**File:** `frontend/chronicle/index.html`

| Template variable | HTML location | Default |
|-------------------|---------------|---------|
| `.ThemeCSS` | `<html style="...">` | Empty (no overrides) |
| `.Favicon` | `<link rel="icon">` | `/c/chronicle/favicon.ico` |
| `.Title` | `<title>` | `Chronicle` |
| `.OGTitle` | `<meta og:title>` | `Chronicle - WoW Raid Log Analysis` |
| `.OGDescription` | `<meta og:description>` | Default description |
| `.OGURL` | `<meta og:url>` | Empty |

Title format when branding exists: `"<DisplayName> by Chronicle"`

## ThemeEditor Component

**File:** `frontend/chronicle/src/components/ThemeEditor/ThemeEditor.tsx`

A reusable collapsible color editor for admin forms.

**Features:**
- Collapsed by default, shows "(customized)" badge when overrides exist
- Each knob: native color picker + hex text input (paste-friendly)
- Per-knob reset button (↺ icon, appears only when overridden)
- "Reset All" button at the bottom when any knobs are customized
- Hex input accepts `#RRGGBB` or `RRGGBB`, auto-commits on valid input, lowercases

**Props:**
```typescript
interface ThemeEditorProps {
  value: Record<string, string>;  // Current theme map
  onChange: (theme: Record<string, string>) => void;
}
```

**Used in:**
- `frontend/chronicle/src/pages/Servers/ServersPage.tsx` — tenant branding form
- `frontend/chronicle/src/pages/Admin/AdminSiteSettingsPage.tsx` — site-level branding form

## Client-Side Branding (Logos, Names, Taglines)

### NavBar (`frontend/chronicle/src/components/NavBar/NavBar.tsx`)
- When branding exists: left spacer shows Chronicle icon (decorative), center shows `logo_wide` (or `square_logo` + `display_name` fallback)
- No branding: unchanged Chronicle wordmark

### Footer (`frontend/chronicle/src/components/Footer/Footer.tsx`)
- `FooterBranding` component shows wide logo (or square logo + display name) with "Powered by Chronicle" below
- On tenant subdomain: "Chronicle Discord" renamed, "Chronicle" link added

### Login (`frontend/chronicle/src/pages/Login/Login.tsx`)
- Shows tenant identity between logo and login card: square logo + display name row, tagline below
- Chronicle MagicLogo stays untouched

## Admin UI for Branding

Both admin forms have the same branding section with text inputs for:
- Display name, Tagline, Description
- Square logo URL, Wide logo URL, Favicon URL
- Background banner URL
- ThemeEditor (collapsible color editor)
- TagPicker (categorization tags)

**Tenant form:** `frontend/chronicle/src/pages/Servers/ServersPage.tsx` — `TenantForm` component
**Site settings:** `frontend/chronicle/src/pages/Admin/AdminSiteSettingsPage.tsx`

## Storage

- **Tenant branding:** `tenants.branding` (JSONB column)
- **Site branding:** `site_config.branding` (JSONB column)
- Both use `COALESCE` pattern in SQL for partial updates (only non-NULL fields overwrite)

## Tenant 404 Page

**File:** `internal/services/servicetenant/middleware.go`

When a subdomain doesn't match any tenant, a self-contained HTML 404 page is served with hardcoded Chronicle colors (`#1a1a1a` bg, `#5F8FA6` primary). This page does NOT use the branding system since no tenant exists to resolve.

## Dev Mode Compatibility

The `{{ .ThemeCSS }}` template variable is placed on the `<html style="...">` attribute (not in a `<style>` tag) because Vite's Tailwind plugin would try to parse Go template syntax inside `<style>` blocks, causing build errors in dev mode. The inline style approach is invisible to Tailwind and harmless when the template isn't rendered (dev mode sees `style="{{ .ThemeCSS }}"` literally).
