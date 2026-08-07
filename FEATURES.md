# Chronicle Features

Chronicle is a combat-log analysis platform for Classic World of Warcraft. It
turns uploaded or server-recorded logs into interactive raid reports, character
profiles, rankings, guild pages, and game-data tools.

## Combat logs

- Upload combat-log files for parsing.
- Ingest logs directly from supported server integrations.
- Browse recent raids and a user's uploaded logs.
- Inspect each log's parsing state, instances, encounters, and metadata.
- Detect supported raids and dungeons, including tracked bosses and trash.
- Track parser, log-format, addon, and data-version compatibility.
- Reprocess logs when newer parsing logic or game data becomes available.

## Raid and encounter analysis

- Select one or more encounters from an instance.
- View an instance overview with:
  - Raid summary statistics.
  - Clear time.
  - Encounter kill times.
  - Raid composition and time composition.
  - Incoming-damage summaries.
  - Deadliest abilities.
  - Population comparisons against other raids.
- Select a time range and apply it across the report.
- Replay a fight with play, pause, seek, and playback-speed controls.
- Synchronize replay with an embedded YouTube video.
- Focus on players, enemies, pets, abilities, and targets for deeper breakouts.
- Display totals or per-second values where supported.
- Compare selected metrics and entities.
- Open panels in separate popup windows.
- View educational explainers for supported panels.

### Analysis panels

Chronicle currently registers 46 analysis panel types. One, Rotations, is hidden
from the normal selector while it is under development.

#### Damage and healing

- Damage Done.
- Vulnerability Effect.
- Enemy Damage.
- Pet Damage.
- Friendly Fire.
- Damage Taken.
- Enemy Damage Taken.
- Healing Done.
- Healing Taken.

#### Survivability and resources

- Mitigation.
- Absorbed Damage.
- Resists.
- Extra Attacks.
- Resource Gains.
- Consumables Log.
- Consumes Total.

#### Deaths and utility actions

- Deaths.
- Death Log and death recaps.
- Dispels Done.
- Dispels Received.
- Dispel Log.
- Interrupts.
- Interrupt Log.
- Aura Uptime.

#### Class-specific analysis

- Innervate tracking for druids.
- Sunder Armor tracking for warriors.
- Judgement tracking for paladins.

#### Replay, charts, and comparison

- Status.
- Healer Casts.
- Line Chart.
- Comparison.
- Periods.
- Possession.
- Pulls & Idle Time.
- Rotations (currently hidden).

#### Raid and log information

- Roles.
- Leaderboard.
- Unit Lookup.
- Equipment.
- Loot.
- Guilds.
- Addon Relay Stats.
- Logging Metadata.
- Metrics.
- All Activity.
- Empty placeholder panels for custom layouts.

## Filters, layouts, and sharing

- Build panel filters using boolean AND, OR, and NOT groups.
- Filter by:
  - Ability name or ID.
  - Ability school.
  - Hit type.
  - Event type or value.
  - Source or target type.
  - Specific players or enemies.
  - Time range.
- Drag, resize, rearrange, duplicate, copy, paste, and replace panels.
- Use preset layouts or build a layout from scratch.
- Save reusable layouts in the Layout Book.
- Experiment with layouts in the Layout Lab.
- Encode encounters, filters, panels, layout, and time range in the URL.
- Create short share links that reproduce the same report view.

## Rankings and performance

- View encounter parse rankings.
- View speedrun and clear-time leaderboards.
- Filter leaderboards by realm, instance, encounter, class, and other supported
  dimensions.
- Enforce log/parser version requirements for competitive rankings.
- Show ranking and parse information inside raid reports, character profiles,
  and guild pages.

## Armory and characters

- Search for characters by realm and name.
- View character identity, class, race, guild, and recent activity.
- Inspect current and historical gear.
- View talents and saved talent builds.
- Review loot history, gear progression, raid attendance, recent raid nights,
  first kills, progression, and raid scores.
- Link verified characters to a Chronicle account.
- Choose and manage account-linked characters.

## Guilds

- Search for guilds.
- View public guild pages with custom tabs and layouts.
- Browse a guild roster.
- Edit guild information and page settings with the required permissions.
- Build guild pages with drag-and-drop panels.
- Configure recruitment information and application links.
- Submit and manage guild join requests where applications are enabled.

### Guild page panels

Chronicle currently provides 12 guild-page panel types:

- Recent raids.
- Roster.
- Top parses.
- Recruitment.
- Progression.
- Best performance.
- Quote board.
- Raid schedule.
- Text/Markdown block.
- Calendar.
- Compact calendar.
- Raid clears.

## Talent calculator and DPS simulator

- Browse class talent trees.
- Create, edit, save, and share talent builds.
- Configure a simulated character and equipment.
- Build and compare combat rotations.
- Run browser-based DPS simulations.
- Inspect simulated events through Chronicle's analysis-panel system.

## Game database and reference tools

- Browse and search items.
- Browse and search spells.
- Browse creatures.
- Browse item sets and set details.
- Open individual item and spell pages.
- Select tenant-specific game-data datasets.
- View technical reference lists for:
  - Periodic spells.
  - Extra-attack spells.
  - Vulnerability effects.
  - Aura-duration modifiers.
  - Class spells.
  - Pet-targeting abilities.
  - Talent trees.
  - Consumables.
  - Cooldowns.

## Census and discovery

- Browse recently uploaded raids.
- Browse supported raids and dungeons.
- View realm census and player population data.
- View population distributions exposed by the active server dataset.

## Accounts and preferences

- Sign in through Discord OAuth.
- Manage profile settings.
- Manage linked characters.
- Review account storage usage.
- Configure notification preferences.
- Configure privacy preferences.
- Configure appearance preferences.
- Manage saved layouts.
- Create and manage saved talent builds.

## Developer and integration features

- Interactive browser-based API explorer.
- External API support.
- Server-side combat-log upload integration for AzerothCore deployments.
- Upload-key management for configured servers.
- Multi-tenant routing and tenant-specific datasets.
- Vanilla, TBC, and Wrath game-data import support for relevant datasets and
  deployments.
- WDB, DBC, and AzerothCore SQL game-data import tools.

## Administrative and operator features

These features require elevated permissions and are not part of the normal
public experience:

- User, role, grant, and retention management.
- Log search, bulk deletion, and bulk reparsing.
- Parse snapshot and ranking refresh controls.
- Leaderboard version-requirement management.
- Site configuration.
- Storage inspection.
- Cache statistics and invalidation.
- Outdated-instance discovery.
- Server application review.
- Parse queue and cohort inspection.
- Regression-test tools.
- Server, tenant, upload-key, dataset, and retention management.

## Internal and debug tools

- Protobuf event decoder.
- Raw all-activity and metrics panels.
- Parsing diagnostics and cohort viewer.
- Dedicated YouTube synchronization development pages.
