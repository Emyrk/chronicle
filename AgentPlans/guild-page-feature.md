# Guild Page Feature - Design Plan

> **Status:** Ready for implementation  
> **Created:** 2026-02-13  
> **Scope:** Modular, customizable guild pages for Chronicle  

---

## Quick Start for Implementation

When picking this up later, run these commands to understand current state:

```bash
# Check current guild schema
cat database/migrations/000016_guild_instances.up.sql

# See existing guild queries
cat database/queries/guilds.sql

# Check frontend patterns
ls frontend/chronicle/src/pages/

# Run tests to ensure baseline works
make test
```

**Key investigation reports are embedded below** - no need to re-explore.

---

## Context & Goals

Design a **modular, customizable Guild Page system** for Chronicle that allows guild leaders to:
- **Recruit** - Showcase progression, class needs, and guild culture
- **Show off** - Highlight impressive raids, speed kills, achievements
- **Communicate** - Announcements, calendar, upcoming raids
- **Track** - Attendance, sign-ups, performance trends

**Phased approach:**
- **MVP (Phase 1):** Read-only auto-generated guild pages from existing data
- **Phase 2:** Editable panels, customization, premium tiers ($5/$15)
- **Phase 3:** Calendar, sign-ups, advanced features

---

## Evidence / Investigation Summary

| Area | Current State |
|------|--------------|
| Guild DB | Minimal: `guilds` table with `(id, realm_id, name, created_at)` only |
| User-Guild Link | ❌ Deferred - owner handles verification/linking manually |
| Raid Data | ✅ Rich: instances, encounters, attendance, damage/healing via event streams |
| Premium System | ❌ None - but storage limits exist and SpiceDB for permissions |
| Frontend Patterns | React + TanStack Query, Tailwind, Radix UI components |
| SR Integration | External only - embed softres.it links |

<details>
<summary>Detailed Investigation: Current Guild Data Model</summary>

### Current `guilds` Table (Migration 000016)

```sql
CREATE TABLE guilds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  realm_id UUID NOT NULL REFERENCES wow_server_realms(id),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(realm_id, name)
);
```

### Guild Associations

- `log_instances.guild_id` - Links raids to guilds (set when >50% of players share a guild)
- `log_instance_players.guild_id` - Links individual players to their guild

### Existing Queries

Only one query exists in `database/queries/guilds.sql`:
```sql
-- name: UpsertGuild :one
INSERT INTO guilds (realm_id, name, created_at)
VALUES ($1, $2, $3)
ON CONFLICT (realm_id, name) DO UPDATE
  SET realm_id = EXCLUDED.realm_id
RETURNING *;
```

### What Data Is Available for Guild Pages

From existing tables, we can aggregate:
1. **Guild Raids** - via `log_instances.guild_id`
2. **Boss Progression** - via `log_instance_encounters` (kill/wipe, timestamps)
3. **Attendance/Roster** - via `log_instance_players` (name, class, race, level)
4. **Performance Metrics** - via event streams (damage, healing, deaths)

**NOT available:**
- Soft reserves (no SR tracking)
- Historical progression (first kills tracked per-boss though)
- Aggregate statistics over time

</details>

<details>
<summary>Detailed Investigation: Frontend Patterns</summary>

### Page Structure Pattern

```tsx
// Standard page structure (e.g., RecentRaids.tsx)
export function PageName() {
  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
          <Icon className="h-7 w-7" />
          Page Title
        </h1>
        <p className="text-muted-foreground mt-1">Description text</p>
      </div>
      
      {loading && <LoadingSpinner />}
      {error && <ErrorCard />}
      {!loading && items.length === 0 && <EmptyState />}
      {!loading && items.length > 0 && <ContentGrid />}
    </div>
  );
}
```

### Data Fetching (TanStack Query)

Location: `frontend/chronicle/src/api/queries.ts`

```tsx
export function useInstance(instanceId: string, options?) {
  return useQuery({
    queryKey: ["instance", instanceId],
    queryFn: async () => {
      const response = await fetch(`/api/v1/raidlogs/instances/${instanceId}`);
      if (!response.ok) throw new Error("Failed to fetch instance");
      return response.json() as Promise<WoWParsedInstance>;
    },
    retry: false,
    ...options,
  });
}
```

### Component Library

| Component | Path |
|-----------|------|
| `Button` | `components/ui/button.tsx` |
| `Card` | `components/ui/Card/Card.tsx` |
| `Tabs` | `components/ui/tabs.tsx` |
| `Table` | `components/ui/Table/Table.tsx` |

### Styling

- Tailwind CSS v4 with CSS variables for theming
- `cn()` utility for class merging
- Dark mode via `.dark` class

</details>

<details>
<summary>Detailed Investigation: Premium/Monetization</summary>

### Current State

No subscription system exists. However:

1. **Storage limits exist** - `data_limit` table with `max_storage_bytes` per user
2. **SpiceDB permissions** - Role-based access control already in place
3. **Discord-gated access** - Users must be in Discord server

### Recommended Approach

Add a `guild_subscriptions` table:

```sql
CREATE TYPE subscription_tier AS ENUM ('free', 'premium', 'patron');

CREATE TABLE guild_subscriptions (
  id UUID PRIMARY KEY,
  guild_profile_id UUID NOT NULL UNIQUE REFERENCES guild_profiles(id),
  tier subscription_tier NOT NULL DEFAULT 'free',
  stripe_subscription_id TEXT,
  stripe_customer_id TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Stripe Integration Points

- `POST /api/v1/stripe/checkout` - Create checkout session
- `POST /api/v1/webhooks/stripe` - Handle events
- `POST /api/v1/stripe/portal` - Billing portal redirect

</details>

---

## Phase 1: MVP (Read-Only Guild Pages)

Auto-generated guild pages that display aggregated data from uploaded logs. No editing, no claiming - just a public view of any guild's raid history.

### 1.1 Database Schema (Minimal)

```sql
-- Extend guilds table with computed/cached stats
-- No new tables needed for MVP! Just new queries against existing data.

-- Optional: Add a slug column to guilds for nicer URLs
ALTER TABLE guilds ADD COLUMN slug TEXT UNIQUE;
CREATE INDEX idx_guilds_slug ON guilds(slug);

-- Add comment for clarity
COMMENT ON COLUMN guilds.slug IS 'URL-friendly identifier, auto-generated from name if not set';
```

### 1.2 API Endpoints (MVP)

```
# Public Guild Pages (read-only)
GET /api/v1/g                    # List all guilds (with basic stats)
GET /api/v1/g/:slug              # Guild page data (or by ID if no slug)
GET /api/v1/g/:slug/raids        # Paginated raid history
GET /api/v1/g/:slug/progression  # Boss kill progression
GET /api/v1/g/:slug/roster       # Active raiders (from logs)
```

### 1.3 SDK Types (MVP)

```go
// api/chroniclesdk/guild.go

type GuildSummary struct {
    ID          uuid.UUID `json:"id"`
    Name        string    `json:"name"`
    Slug        string    `json:"slug"`
    RealmID     uuid.UUID `json:"realm_id"`
    RealmName   string    `json:"realm_name"`
    
    // Aggregated stats
    TotalRaids      int        `json:"total_raids"`
    LastRaidDate    *time.Time `json:"last_raid_date,omitempty"`
    ActiveRaiders   int        `json:"active_raiders"`  // Unique players in last 30 days
    
    CreatedAt   time.Time `json:"created_at"`
}

type GuildPageData struct {
    Guild       GuildSummary           `json:"guild"`
    Progression []GuildProgressionTier `json:"progression"`
    RecentRaids []GuildRaidSummary     `json:"recent_raids"`
    TopRaiders  []GuildRaiderSummary   `json:"top_raiders"`
}

type GuildProgressionTier struct {
    InstanceName  string            `json:"instance_name"`
    BossCount     int               `json:"boss_count"`
    BossesKilled  int               `json:"bosses_killed"`
    Status        string            `json:"status"` // "progressing", "on_farm", "cleared"
    FirstClear    *time.Time        `json:"first_clear,omitempty"`
    Bosses        []GuildBossStatus `json:"bosses"`
}

type GuildBossStatus struct {
    BossName      string     `json:"boss_name"`
    Killed        bool       `json:"killed"`
    KillCount     int        `json:"kill_count"`
    FirstKillDate *time.Time `json:"first_kill_date,omitempty"`
}

type GuildRaidSummary struct {
    InstanceID    uuid.UUID  `json:"instance_id"`
    InstanceName  string     `json:"instance_name"`
    Date          time.Time  `json:"date"`
    BossCount     int        `json:"boss_count"`
    BossKills     int        `json:"boss_kills"`
    PlayerCount   int        `json:"player_count"`
    DurationMs    *int64     `json:"duration_ms,omitempty"`
}

type GuildRaiderSummary struct {
    PlayerName  string `json:"player_name"`
    PlayerClass string `json:"player_class"`
    RaidCount   int    `json:"raid_count"`
    LastSeen    time.Time `json:"last_seen"`
}
```

### 1.4 SQL Queries (MVP)

```sql
-- name: GetGuildBySlug :one
SELECT g.*, wsr.name as realm_name
FROM guilds g
JOIN wow_server_realms wsr ON g.realm_id = wsr.id
WHERE g.slug = $1 OR g.id::text = $1;

-- name: ListGuilds :many
SELECT 
  g.*,
  wsr.name as realm_name,
  COUNT(DISTINCT li.id) as total_raids,
  MAX(li.created_at) as last_raid_date,
  COUNT(DISTINCT lip.name) FILTER (WHERE li.created_at > NOW() - INTERVAL '30 days') as active_raiders
FROM guilds g
JOIN wow_server_realms wsr ON g.realm_id = wsr.id
LEFT JOIN log_instances li ON li.guild_id = g.id
LEFT JOIN log_instance_players lip ON lip.instance_id = li.id
GROUP BY g.id, wsr.name
ORDER BY MAX(li.created_at) DESC NULLS LAST
LIMIT $1 OFFSET $2;

-- name: GetGuildRaids :many
SELECT 
  li.id as instance_id,
  li.name as instance_name,
  li.created_at as date,
  (SELECT COUNT(*) FROM log_instance_encounters lie 
   WHERE lie.instance_id = li.id AND lie.boss = true) as boss_count,
  (SELECT COUNT(*) FROM log_instance_encounters lie 
   WHERE lie.instance_id = li.id AND lie.boss = true AND lie.kill = true) as boss_kills,
  (SELECT COUNT(DISTINCT lip.name) FROM log_instance_players lip 
   WHERE lip.instance_id = li.id) as player_count,
  (SELECT EXTRACT(EPOCH FROM (MAX(lie.end_time) - MIN(lie.start_time))) * 1000 
   FROM log_instance_encounters lie WHERE lie.instance_id = li.id) as duration_ms
FROM log_instances li
WHERE li.guild_id = $1
ORDER BY li.created_at DESC
LIMIT $2 OFFSET $3;

-- name: GetGuildProgression :many
SELECT 
  li.name as instance_name,
  lie.name as boss_name,
  lie.boss,
  MAX(CASE WHEN lie.kill THEN 1 ELSE 0 END)::boolean as killed,
  COUNT(*) FILTER (WHERE lie.kill) as kill_count,
  MIN(lie.end_time) FILTER (WHERE lie.kill) as first_kill_date
FROM log_instances li
JOIN log_instance_encounters lie ON lie.instance_id = li.id
WHERE li.guild_id = $1 AND lie.boss = true
GROUP BY li.name, lie.name, lie.boss
ORDER BY li.name, MIN(lie.start_time);

-- name: GetGuildTopRaiders :many
SELECT 
  lip.name as player_name,
  lip.class::text as player_class,
  COUNT(DISTINCT lip.instance_id) as raid_count,
  MAX(li.created_at) as last_seen
FROM log_instance_players lip
JOIN log_instances li ON lip.instance_id = li.id
WHERE li.guild_id = $1
  AND li.created_at > NOW() - INTERVAL '90 days'
GROUP BY lip.name, lip.class
ORDER BY COUNT(DISTINCT lip.instance_id) DESC
LIMIT $2;
```

### 1.5 Frontend (MVP)

```
frontend/chronicle/src/pages/Guild/
├── GuildPage.tsx           # Main guild page
├── GuildList.tsx           # Browse all guilds
└── components/
    ├── GuildHeader.tsx     # Name, realm, stats summary
    ├── ProgressionCard.tsx # Boss kill progression display
    ├── RaidHistory.tsx     # Recent raids list
    └── RosterCard.tsx      # Top raiders display
```

**Key Component: GuildPage.tsx**
```tsx
export function GuildPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data, isLoading, error } = useGuildPage(slug);
  
  if (isLoading) return <LoadingSpinner />;
  if (error || !data) return <ErrorCard />;
  
  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8">
      <GuildHeader guild={data.guild} />
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        {/* Left column: Progression */}
        <div className="lg:col-span-2 space-y-6">
          <ProgressionCard progression={data.progression} />
          <RaidHistory raids={data.recentRaids} guildSlug={slug} />
        </div>
        
        {/* Right column: Roster */}
        <div className="space-y-6">
          <RosterCard raiders={data.topRaiders} />
        </div>
      </div>
    </div>
  );
}
```

### 1.6 Routes

```tsx
// App.tsx
<Route path="/guilds" element={<GuildList />} />
<Route path="/g/:slug" element={<GuildPage />} />
```

---

## Phase 2: Editable Guild Pages (Future)

<details>
<summary>Full schema for editable panels and premium features</summary>

### Database Schema (Phase 2)

```sql
-- Guild profiles (extends minimal guilds table)
CREATE TABLE guild_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id UUID NOT NULL UNIQUE REFERENCES guilds(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL REFERENCES users(id),
  
  -- Basic Info
  description TEXT,
  faction TEXT CHECK (faction IN ('alliance', 'horde')),
  
  -- Styling (premium)
  theme_preset TEXT DEFAULT 'default',
  custom_colors JSONB,  -- {primary, secondary, accent}
  banner_url TEXT,
  logo_url TEXT,
  
  -- Settings
  is_public BOOLEAN DEFAULT true,
  recruitment_open BOOLEAN DEFAULT false,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Panel configuration storage
CREATE TABLE guild_page_panels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_profile_id UUID NOT NULL REFERENCES guild_profiles(id) ON DELETE CASCADE,
  
  -- Panel type and config
  panel_type TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  
  -- Layout (CSS Grid based)
  grid_column TEXT NOT NULL DEFAULT 'span 1',
  grid_row TEXT NOT NULL DEFAULT 'span 1',
  sort_order INTEGER NOT NULL DEFAULT 0,
  visible BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Premium subscriptions
CREATE TYPE subscription_tier AS ENUM ('free', 'premium', 'patron');

CREATE TABLE guild_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_profile_id UUID NOT NULL UNIQUE REFERENCES guild_profiles(id) ON DELETE CASCADE,
  tier subscription_tier NOT NULL DEFAULT 'free',
  stripe_subscription_id TEXT,
  stripe_customer_id TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Recruitment needs
CREATE TABLE guild_recruitment_needs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_profile_id UUID NOT NULL REFERENCES guild_profiles(id) ON DELETE CASCADE,
  class TEXT NOT NULL,
  spec TEXT,
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  note TEXT,
  UNIQUE(guild_profile_id, class, spec)
);

-- Highlighted raids
CREATE TABLE guild_highlighted_raids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_profile_id UUID NOT NULL REFERENCES guild_profiles(id) ON DELETE CASCADE,
  instance_id UUID NOT NULL REFERENCES log_instances(id) ON DELETE CASCADE,
  title TEXT,
  highlight_type TEXT DEFAULT 'featured',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(guild_profile_id, instance_id)
);
```

</details>

---

## Phase 3: Calendar & Sign-ups (Future)

<details>
<summary>Calendar and event sign-up schema</summary>

```sql
-- Calendar events
CREATE TABLE guild_calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_profile_id UUID NOT NULL REFERENCES guild_profiles(id) ON DELETE CASCADE,
  created_by_user_id UUID REFERENCES users(id),
  
  title TEXT NOT NULL,
  description TEXT,
  event_type TEXT DEFAULT 'raid' CHECK (event_type IN ('raid', 'meeting', 'social', 'other')),
  instance_name TEXT,
  
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  
  signups_enabled BOOLEAN DEFAULT true,
  max_signups INTEGER,
  
  -- SR integration (external link)
  softres_url TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Event sign-ups
CREATE TABLE guild_event_signups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES guild_calendar_events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  status TEXT DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'tentative', 'declined')),
  character_name TEXT,
  character_class TEXT,
  note TEXT,
  
  signed_up_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_id, user_id)
);
```

</details>

---

## Panel Types Reference (Future Phases)

<details>
<summary>All planned panel types with configuration options</summary>

### Panel Type Registry

| Panel Type | Description | Free | Premium ($5) | Patron ($15) |
|------------|-------------|------|--------------|--------------|
| `text` | Rich text with markdown | ✅ Basic | Custom fonts/colors | ✅ |
| `recent_raids` | List of recent guild raids | 5 raids | Unlimited + filters | ✅ |
| `highlighted_raids` | Manually pinned showcase raids | 1 | 5 | Unlimited |
| `recruitment` | Class needs matrix | Basic | Specs, priorities, notes | ✅ |
| `progression` | Raid progression tracker | Current tier | All tiers + graphs | ✅ |
| `calendar` | Upcoming events | View only | Sign-ups | + Reminders |
| `attendance` | Attendance leaderboard | ❌ | ✅ | ✅ |
| `roster` | Guild roster/members | Basic | Roles, notes | ✅ |
| `stats` | Guild-wide statistics | ❌ | ✅ | ✅ |
| `announcement` | Pinned announcement banner | 1 | Multiple + styling | ✅ |
| `social_links` | Discord, streams, etc. | ✅ | ✅ | ✅ |
| `media` | Image gallery/embeds | ❌ | ✅ | ✅ |
| `custom_embed` | iframe/YouTube/softres.it | ❌ | ✅ | ✅ |

### Premium Tier Summary

| Feature | Free | Premium ($5/mo) | Patron ($15/mo) |
|---------|------|-----------------|-----------------|
| Custom URL slug | ❌ Auto-generated | ✅ | ✅ |
| Panel limit | 4 | 12 | Unlimited |
| Custom colors | ❌ | ✅ | ✅ |
| Custom banner/logo | ❌ | ✅ | ✅ |
| Theme presets | 2 | 10 | + custom CSS |
| Remove "Powered by Chronicle" | ❌ | ❌ | ✅ |
| Priority in guild directory | ❌ | ✅ | ✅✅ (featured) |
| Webhook/API access | ❌ | ❌ | ✅ |

### Upsell Touchpoints

1. **Panel add button** - "Unlock X more panel types with Premium"
2. **Color picker** - Disabled with premium badge
3. **Highlighted raids** - "Add more highlights with Premium"
4. **Calendar sign-ups** - "Enable sign-ups with Premium"
5. **Attendance tab** - Blurred preview + upgrade CTA
6. **Banner upload** - "Upload custom banner with Premium"

### Panel Configuration TypeScript Types

```typescript
// frontend/chronicle/src/types/guildPanels.ts

interface PanelConfig {
  title?: string;
  showTitle?: boolean;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
}

interface TextPanelConfig extends PanelConfig {
  content: string;  // Markdown
  textColor?: string;
  backgroundColor?: string;
  fontSize?: 'sm' | 'base' | 'lg' | 'xl';
  textAlign?: 'left' | 'center' | 'right';
}

interface RecentRaidsPanelConfig extends PanelConfig {
  limit: number;
  showBossProgress?: boolean;
  showDuration?: boolean;
  showPlayerCount?: boolean;
  filterByInstance?: string[];
  sortBy?: 'date' | 'duration' | 'boss_kills';
}

interface RecruitmentPanelConfig extends PanelConfig {
  layout: 'grid' | 'list' | 'compact';
  showSpecs?: boolean;
  showNotes?: boolean;
  groupByPriority?: boolean;
}

interface ProgressionPanelConfig extends PanelConfig {
  instances: string[];
  showFirstKillDate?: boolean;
  showKillCount?: boolean;
  showBestTime?: boolean;
  layout: 'compact' | 'detailed';
}

interface CalendarPanelConfig extends PanelConfig {
  view: 'list' | 'week' | 'month';
  daysAhead: number;
  showSignups?: boolean;
  showDescription?: boolean;
}

interface AttendancePanelConfig extends PanelConfig {
  timeRange: '30d' | '60d' | '90d' | 'all';
  minRaids: number;
  showClass?: boolean;
  sortBy?: 'attendance_rate' | 'total_raids' | 'name';
}

interface AnnouncementPanelConfig extends PanelConfig {
  content: string;
  variant: 'info' | 'warning' | 'success' | 'urgent';
  customColors?: { bg: string; text: string; border: string };
  dismissible?: boolean;
  expiresAt?: string;
}

interface SocialLinksPanelConfig extends PanelConfig {
  links: Array<{
    type: 'discord' | 'twitch' | 'youtube' | 'twitter' | 'website' | 'custom';
    url: string;
    label?: string;
  }>;
  layout: 'icons' | 'buttons' | 'list';
}
```

</details>

---

## File Changes Summary

### Phase 1 (MVP) Files

| File | Change |
|------|--------|
| `database/migrations/000XXX_guild_slug.up.sql` | Add slug column to guilds |
| `database/queries/guilds.sql` | New aggregation queries |
| `api/chroniclesdk/guild.go` | SDK types |
| `api/guild.go` | Guild API handlers |
| `api/api.go` | Route registration |
| `frontend/chronicle/src/pages/Guild/` | New page components |
| `frontend/chronicle/src/api/queries.ts` | Guild query hooks |
| `frontend/chronicle/src/App.tsx` | Add routes |
| `frontend/chronicle/src/components/NavBar/` | Add "Guilds" nav |

### Future Phase Files (deferred)

<details>
<summary>Files for Phase 2-3</summary>

| File | Change |
|------|--------|
| `database/migrations/000XXX_guild_profiles.up.sql` | Profile/panel tables |
| `database/migrations/000XXX_guild_calendar.up.sql` | Calendar tables |
| `database/queries/guild_panels.sql` | Panel CRUD |
| `database/queries/guild_calendar.sql` | Calendar queries |
| `api/guild_panels.go` | Panel handlers |
| `api/guild_calendar.go` | Calendar handlers |
| `api/stripe.go` | Stripe integration |
| `frontend/.../editor/` | Drag-drop editor |

</details>

---

## Implementation Order

### Phase 1: MVP (First Implementation)
1. Database migration - Add `slug` column to `guilds`
2. SQL queries - Guild aggregation queries
3. SDK types - `GuildSummary`, `GuildPageData`, etc.
4. API handlers - Read-only guild endpoints
5. Frontend - `GuildPage`, `GuildList` components
6. Nav integration - Add "Guilds" link

### Future Phases (Deferred)
- Phase 2: Editable panels, profile claiming, premium gating
- Phase 3: Calendar, sign-ups, Stripe integration

---

## Design Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Guild claiming | Manual/deferred | Owner handles verification manually for now |
| MVP scope | Read-only first | Test demand before building editor |
| SR integration | External links | Embed softres.it URLs rather than build our own |
| Pricing | $5/$15 tiers | Accessible for casual guilds |
| Panel updates | Static (no real-time) | Start simple, add polling later if needed |
