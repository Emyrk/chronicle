---
name: guild-pages
description: Guild Pages feature for Chronicle - customizable public pages for guilds with drag-drop panel editor
globs:
  - "api/guild_pages.go"
  - "api/chroniclesdk/guild_page.go"
  - "database/queries/guild_pages.sql"
  - "database/migrations/*guild_pages*"
  - "frontend/chronicle/src/pages/GuildPage/**"
---

# Guild Pages

Guild Pages allow guilds to create customizable public pages showcasing their raid progress, roster, and statistics.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend                                 │
├─────────────────────────────────────────────────────────────────┤
│  GuildPage.tsx (viewer)    │  GuildPageEditor.tsx (editor)      │
│  - Public view             │  - Drag-drop layout                │
│  - Device filtering        │  - Tab/panel management            │
│  - Tab navigation          │  - Config modals                   │
├─────────────────────────────────────────────────────────────────┤
│  components/               │  panels/                           │
│  - GuildPageCanvas         │  - RecentRaids, Roster, Progress   │
│  - TabBar                  │  - Stats, Markdown, Leaderboard    │
│  - AddPanelDrawer          │  - registry.ts (panel definitions) │
│  - PanelConfigModal        │  - types.ts (GuildPanelDefinition) │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Backend API                              │
├─────────────────────────────────────────────────────────────────┤
│  api/guild_pages.go        │  api/chroniclesdk/guild_page.go    │
│  - ListGuilds              │  - GuildPageConfig                 │
│  - GetGuildPage            │  - GuildPageTab                    │
│  - UpsertGuildPage         │  - GuildPagePanel                  │
│  - Tab CRUD                │  - DeviceVisibility                │
│  - Admin member mgmt       │  - Request/Response types          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Database                                 │
├─────────────────────────────────────────────────────────────────┤
│  guild_members      │  Links users to guilds (edit permissions) │
│  guild_pages        │  Page config (theme, is_public)           │
│  guild_page_tabs    │  Tabs with label, slug, sort_order        │
│  guild_page_panels  │  Panels with type, config JSON, position  │
└─────────────────────────────────────────────────────────────────┘
```

## Database Schema

```sql
-- guild_members: Users who can edit a guild's page
CREATE TABLE guild_members (
    id UUID PRIMARY KEY,
    guild_id UUID REFERENCES guilds(id),
    user_id UUID REFERENCES users(id),
    joined_at TIMESTAMPTZ,
    UNIQUE(guild_id, user_id)
);

-- guild_pages: Main page configuration  
CREATE TABLE guild_pages (
    id UUID PRIMARY KEY,
    guild_id UUID REFERENCES guilds(id) UNIQUE,
    theme JSONB DEFAULT '{}'
);

-- guild_page_tabs: Multiple tabs per page
CREATE TABLE guild_page_tabs (
    id UUID PRIMARY KEY,
    page_id UUID REFERENCES guild_pages(id),
    label TEXT,
    slug TEXT,
    sort_order INTEGER,
    UNIQUE(page_id, slug)
);

-- guild_page_panels: Panels with grid position
CREATE TABLE guild_page_panels (
    id UUID PRIMARY KEY,
    tab_id UUID REFERENCES guild_page_tabs(id),
    panel_type TEXT,
    config JSONB DEFAULT '{}',
    position JSONB DEFAULT '{"x":0,"y":0,"w":6,"h":2}'
);
```

## Adding a New Panel Type

1. **Create the panel file** in `frontend/chronicle/src/pages/GuildPage/panels/`:

```typescript
// MyPanel.tsx
import type { GuildPanelDefinition } from "./types";
import { SomeIcon } from "lucide-react";

interface MyPanelConfig {
  someSetting: string;
  showSomething: boolean;
}

export const myPanelDefinition: GuildPanelDefinition<MyPanelConfig> = {
  type: "my_panel",
  label: "My Panel",
  icon: <SomeIcon className="h-4 w-4" />,
  description: "Description shown in panel picker",
  
  defaultSize: { w: 6, h: 2 },
  minSize: { w: 3, h: 2 },
  maxSize: { w: 12, h: 6 },
  
  configSchema: [
    {
      name: "someSetting",
      label: "Some Setting",
      type: "text",  // "text" | "number" | "select" | "boolean" | "textarea"
      placeholder: "Enter value...",
    },
    {
      name: "showSomething",
      label: "Show Something",
      type: "boolean",
      defaultValue: true,
    },
  ],
  defaultConfig: {
    someSetting: "",
    showSomething: true,
  },
  
  render: ({ guild, config, position, isEditing }) => {
    // Return panel content JSX
    // Use fake/stub data for now - real API will come later
    return (
      <div>
        <p>Guild: {guild.name}</p>
        <p>Setting: {config.someSetting}</p>
      </div>
    );
  },
};
```

2. **Register in registry.ts**:

```typescript
import { myPanelDefinition } from "./MyPanel";

export const PANEL_REGISTRY: AnyPanelDefinition[] = [
  // ... existing panels
  myPanelDefinition,
];
```

3. **Add to AddPanelDrawer categories** if needed.

## Device Visibility

Tabs and panels support device-specific visibility:

```typescript
type DeviceVisibility = "all" | "desktop" | "mobile";
```

- **Viewer** (`GuildPage.tsx`): Filters tabs/panels based on `useIsMobile()`
- **Editor**: Shows dropdown on tabs, toggle buttons in panel config modal
- Visual indicators: Blue badge = desktop-only, Green badge = mobile-only

## API Routes

```
GET    /api/v1/g                      - List guilds (with page status)
GET    /api/v1/g/{guildID}            - Get guild info
GET    /api/v1/g/{guildID}/page       - Get full page config
PUT    /api/v1/g/{guildID}/page       - Upsert page (auth required)
POST   /api/v1/g/{guildID}/page/tabs  - Create tab
PUT    /api/v1/g/{guildID}/page/tabs/{tabID}     - Update tab + panels
DELETE /api/v1/g/{guildID}/page/tabs/{tabID}     - Delete tab
PUT    /api/v1/g/{guildID}/page/tabs/reorder     - Reorder tabs

GET    /api/v1/g/{guildID}                 - Public page endpoint

# Admin only
POST   /api/v1/admin/g/{guildID}/members          - Add member
DELETE /api/v1/admin/g/{guildID}/members/{userID} - Remove member
```

## Current State (MVP)

**Implemented:**
- Database schema and queries
- Backend API handlers
- Frontend viewer and editor
- 6 panel types with stub data
- Mobile responsiveness
- Device visibility filtering

**Using stub data:**
- All panels render fake/hardcoded data
- `fetchGuildPage()` returns `FAKE_GUILD_PAGE` constant
- No actual API calls from frontend yet

**TODO:**
- Connect frontend to backend API
- Implement real data queries for panels
- Theme customization UI
- Save functionality
- SpiceDB permissions integration

## Key Files

| File | Purpose |
|------|---------|
| `api/guild_pages.go` | API handlers |
| `api/chroniclesdk/guild_page.go` | SDK types (generates TS) |
| `database/queries/guild_pages.sql` | SQL queries |
| `frontend/.../GuildPage/GuildPage.tsx` | Public viewer |
| `frontend/.../GuildPage/GuildPageEditor.tsx` | Editor |
| `frontend/.../GuildPage/panels/registry.ts` | Panel definitions |
| `frontend/.../GuildPage/panels/types.ts` | TypeScript interfaces |
