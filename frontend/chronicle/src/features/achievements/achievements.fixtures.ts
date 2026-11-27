import type {
  Achievement,
  AchievementCategory,
  AchievementProgress,
  AchievementRequirement,
  AchievementReward,
  AchievementSeries,
  AchievementsResponse,
} from "@/api/typesGenerated";

/**
 * The proposed catalog from docs/achievement-system.md, as API responses.
 * Story-only data: production reads GET /api/v1/achievements.
 */

export type Phase = "Phase 1" | "Phase 2" | "Future";

const ELIGIBLE = 48_210;
const CALCULATED_AT = "2026-11-07T12:00:00Z";
const INTRODUCED_AT = "2026-12-01T00:00:00Z";

export const CATEGORIES: AchievementCategory[] = [
  { id: "getting-started", name: "Getting Started", description: "Your first steps: sign in, link a character, and parse a log.", icon: "book-open" },
  { id: "report-explorer", name: "Report Explorer", description: "Change a report to answer a question: encounters, players, time, panels, and filters.", icon: "telescope" },
  { id: "layouts", name: "Layouts", description: "Arrange panels, save layouts, and take them anywhere.", icon: "layout-grid" },
  { id: "keybinds", name: "Keybinds", description: "Faster ways to do things you already know how to do.", icon: "keyboard" },
  { id: "breakouts", name: "Breakouts and Comparison", description: "Drill into a number until you know why it happened.", icon: "search" },
  { id: "replay", name: "Replay and Map", description: "Watch the fight play out on the map.", icon: "compass" },
  { id: "sharing", name: "Sharing", description: "Send a view to someone else.", icon: "link" },
  { id: "live-collaboration", name: "Live Collaboration", description: "Review a report together in real time.", icon: "users" },
  { id: "guild-builder", name: "Guild Builder", description: "Build your guild's page on Chronicle.", icon: "flag" },
  { id: "rankings", name: "Rankings and Discovery", description: "Find players, guilds, and history worth studying.", icon: "trophy" },
  { id: "theorycraft", name: "Planning and Theorycraft", description: "Builds, gear plans, simulations, and raid compositions.", icon: "cog" },
];

export const SERIES: AchievementSeries[] = [
  { id: "report-navigation", category_id: "report-explorer", name: "Report Navigation", description: "Shape a report around the question you are asking." },
  { id: "panel-craft", category_id: "report-explorer", name: "Panel Craft", description: "Configure the panels you investigate with." },
  { id: "filter-craft", category_id: "report-explorer", name: "Filter Craft", description: "From a single filter to full boolean expressions." },
  { id: "layouts", category_id: "layouts", name: "Layouts", description: "From moving a panel to sharing a layout others adopt." },
  { id: "keybinds", category_id: "keybinds", name: "Keybinds", description: "Use the registered keyboard path, not the click." },
  { id: "deeper-look", category_id: "breakouts", name: "Deeper Look", description: "Breakouts, drill-downs, deaths, and comparisons." },
  { id: "replay", category_id: "replay", name: "Replay", description: "Replay, playback, camera, and video sync." },
  { id: "guild-builder", category_id: "guild-builder", name: "Guild Builder", description: "Saved, authorized guild-page changes." },
  { id: "scout", category_id: "rankings", name: "Scout", description: "Use discovery tools; your own ranking does not matter here." },
  { id: "theorycraft", category_id: "theorycraft", name: "Theorycraft", description: "Plan before the pull." },
];

const HONORED: AchievementRequirement = { kind: "reputation", label: "Requires Honored reputation", met: false };
const GUILD_EDIT: AchievementRequirement = { kind: "permission", label: "Requires guild-page edit permission", met: false };
const LIVE_COLLAB: AchievementRequirement = { kind: "unreleased", label: "Available after Live Collaboration launches", met: false };

const reward = (id: string, kind: AchievementReward["kind"], name: string): AchievementReward => ({ id, kind, name });

interface Def {
  id: string;
  category: string;
  series?: string;
  tier?: number;
  name: string;
  points: number;
  description: string;
  phase: Phase;
  /** Share of eligible accounts that earned it, in percent. */
  rate: number;
  keybind?: string;
  requirements?: AchievementRequirement[];
  rewards?: AchievementReward[];
  set?: string[];
  featureURL?: string;
  visibility?: Achievement["visibility"];
}

const DEFS: Def[] = [
  // Getting Started
  { id: "welcome", category: "getting-started", name: "Welcome to Chronicle", points: 5, description: "Sign in for the first time.", phase: "Phase 1", rate: 100 },
  { id: "known-by-name", category: "getting-started", name: "Known by Name", points: 10, description: "After reaching Honored reputation, link and verify a character.", phase: "Phase 1", rate: 9.3, requirements: [HONORED] },
  { id: "first-record", category: "getting-started", name: "The First Record", points: 10, description: "Complete the first successful combat-log parse owned by the account.", phase: "Phase 1", rate: 41.7, featureURL: "/upload" },
  { id: "open-the-books", category: "getting-started", name: "Open the Books", points: 5, description: "Open one of the account's successfully parsed reports.", phase: "Phase 1", rate: 39.2, featureURL: "/logs" },

  // Report Explorer: Report Navigation (untiered series)
  { id: "choose-your-battles", category: "report-explorer", series: "report-navigation", name: "Choose Your Battles", points: 5, description: "Change the selected encounters in a report.", phase: "Phase 1", rate: 63.4 },
  { id: "pick-your-players", category: "report-explorer", series: "report-navigation", name: "Pick Your Players", points: 5, description: "Select specific players or enemies for report analysis.", phase: "Phase 1", rate: 51.0 },
  { id: "a-matter-of-time", category: "report-explorer", series: "report-navigation", name: "A Matter of Time", points: 5, description: "Apply a custom time range.", phase: "Phase 1", rate: 22.8 },
  { id: "rate-of-change", category: "report-explorer", series: "report-navigation", name: "Rate of Change", points: 5, description: "Switch a supported panel between totals and per-second display.", phase: "Phase 1", rate: 34.1 },
  { id: "read-the-manual", category: "report-explorer", series: "report-navigation", name: "Read the Manual", points: 5, description: "Open a panel explainer.", phase: "Phase 1", rate: 12.6 },
  { id: "follow-the-action", category: "report-explorer", series: "report-navigation", name: "Follow the Action", points: 10, description: "Enter focus mode for a player, enemy, or other supported entity.", phase: "Phase 1", rate: 27.5 },
  { id: "side-by-side", category: "report-explorer", series: "report-navigation", name: "Side by Side", points: 10, description: "Open a Comparison panel and select at least two source panels.", phase: "Phase 1", rate: 6.4 },

  // Report Explorer: Panel Craft
  { id: "new-perspective", category: "report-explorer", series: "panel-craft", name: "New Perspective", points: 5, description: "Apply a different built-in preset.", phase: "Phase 1", rate: 44.9 },
  { id: "panel-craft-1", category: "report-explorer", series: "panel-craft", tier: 1, name: "Panel Craft I: Renovation", points: 5, description: "Replace one panel with a different panel type.", phase: "Phase 1", rate: 38.0 },
  { id: "panel-craft-2", category: "report-explorer", series: "panel-craft", tier: 2, name: "Panel Craft II: Copy That", points: 10, description: "Copy a panel and paste it into another panel position.", phase: "Phase 1", rate: 4.2 },
  { id: "panel-craft-3", category: "report-explorer", series: "panel-craft", tier: 3, name: "Panel Craft III: Single Subject", points: 10, description: "Focus a supported panel on one player.", phase: "Phase 1", rate: 18.7 },
  { id: "panel-craft-4", category: "report-explorer", series: "panel-craft", tier: 4, name: "Panel Craft IV: Window Shopping", points: 10, description: "Open a single panel in a separate window.", phase: "Phase 1", rate: 2.9 },

  // Report Explorer: Filter Craft
  { id: "filter-craft-1", category: "report-explorer", series: "filter-craft", tier: 1, name: "Filter Craft I: Narrow It Down", points: 5, description: "Apply a valid filter to a panel.", phase: "Phase 1", rate: 15.3 },
  { id: "filter-craft-2", category: "report-explorer", series: "filter-craft", tier: 2, name: "Filter Craft II: The Exception", points: 10, description: "Use a negated filter.", phase: "Phase 1", rate: 3.8 },
  { id: "filter-craft-3", category: "report-explorer", series: "filter-craft", tier: 3, name: "Filter Craft III: Both Things", points: 10, description: "Apply an expression with at least two AND-connected filters or groups.", phase: "Phase 1", rate: 2.6 },
  { id: "filter-craft-4", category: "report-explorer", series: "filter-craft", tier: 4, name: "Filter Craft IV: Either Works", points: 10, description: "Apply an expression containing an OR-connected filter group.", phase: "Phase 1", rate: 1.1 },
  { id: "filter-craft-5", category: "report-explorer", series: "filter-craft", tier: 5, name: "Filter Craft V: Fine Print", points: 15, description: "Apply a filter equivalent to A AND (B OR C).", phase: "Phase 1", rate: 0.4, rewards: [reward("ach-badge-precision-reticle", "badge", "Precision Reticle")] },

  // Layouts
  { id: "layouts-1", category: "layouts", series: "layouts", tier: 1, name: "Layouts I: Move Things Around", points: 5, description: "Finish a layout edit that moves or resizes at least one panel.", phase: "Phase 1", rate: 19.4 },
  { id: "layouts-2", category: "layouts", series: "layouts", tier: 2, name: "Layouts II: Strip It Down", points: 5, description: "Add and use a strip in a layout.", phase: "Phase 1", rate: 5.5 },
  { id: "layouts-3", category: "layouts", series: "layouts", tier: 3, name: "Layouts III: Group Project", points: 5, description: "Add a group and place a panel or strip inside it.", phase: "Phase 1", rate: 4.1 },
  { id: "layouts-4", category: "layouts", series: "layouts", tier: 4, name: "Layouts IV: Make Yourself at Home", points: 10, description: "Save a custom layout in the Layout Book.", phase: "Phase 1", rate: 11.2 },
  { id: "layouts-5", category: "layouts", series: "layouts", tier: 5, name: "Layouts V: Ready for Action", points: 10, description: "Assign a saved layout to an action-bar slot.", phase: "Phase 1", rate: 6.0, rewards: [reward("ach-bg-architects-grid", "background", "Architect's Grid")] },
  { id: "layouts-6", category: "layouts", series: "layouts", tier: 6, name: "Layouts VI: Another Point of View", points: 10, description: "Open a full layout in a separate window.", phase: "Phase 1", rate: 1.9 },
  { id: "layouts-7", category: "layouts", series: "layouts", tier: 7, name: "Layouts VII: Pack It Up", points: 10, description: "Export or copy a valid layout payload.", phase: "Phase 1", rate: 3.3 },
  { id: "layouts-8", category: "layouts", series: "layouts", tier: 8, name: "Layouts VIII: Unpack It", points: 10, description: "Successfully import a valid layout payload.", phase: "Phase 1", rate: 2.4 },
  { id: "layouts-9", category: "layouts", series: "layouts", tier: 9, name: "Layouts IX: Trendsetter", points: 20, description: "Another account tracks the user's shared layout.", phase: "Phase 2", rate: 0.06 },
  { id: "command-center", category: "layouts", name: "Command Center", points: 20, description: "Earn Panel Craft IV, Layouts V, and Layouts VI.", phase: "Phase 1", rate: 0.8, set: ["panel-craft-4", "layouts-5", "layouts-6"], rewards: [reward("ach-title-commander", "title", "the Commander")] },

  // Keybinds
  { id: "keybinds-1", category: "keybinds", series: "keybinds", tier: 1, name: "Keybinds I: Quick Edit", points: 5, description: "Use Shift+E to enter or finish layout editing.", phase: "Phase 1", rate: 8.8, keybind: "Shift+E" },
  { id: "keybinds-2", category: "keybinds", series: "keybinds", tier: 2, name: "Keybinds II: Focused", points: 5, description: "Use Shift+F to enter or leave focus mode.", phase: "Phase 1", rate: 7.1, keybind: "Shift+F" },
  { id: "keybinds-3", category: "keybinds", series: "keybinds", tier: 3, name: "Keybinds III: At Your Fingertips", points: 10, description: "Apply an assigned layout with a 0 through 9 action-bar key.", phase: "Phase 1", rate: 3.0, keybind: "1" },
  { id: "keybinds-4", category: "keybinds", series: "keybinds", tier: 4, name: "Keybinds IV: Inspect Element", points: 10, description: "Open an entity menu with Alt/Option+click.", phase: "Phase 1", rate: 5.6, keybind: "Alt+Click" },
  { id: "keybinds-5", category: "keybinds", series: "keybinds", tier: 5, name: "Keybinds V: Big Picture", points: 10, description: "Use a registered fullscreen keybind for a supported view.", phase: "Phase 1", rate: 2.2 },
  { id: "keybinds-6", category: "keybinds", series: "keybinds", tier: 6, name: "Keybinds VI: Playback Control", points: 10, description: "Use a registered replay keyboard control to change playback.", phase: "Phase 1", rate: 1.7, keybind: "Space" },
  { id: "keybinds-7", category: "keybinds", series: "keybinds", tier: 7, name: "Keybinds VII: Hands on the Timeline", points: 15, description: "Use a registered rotation-timeline keyboard or modified-mouse command.", phase: "Phase 1", rate: 0.5, rewards: [reward("ach-badge-crossed-keys", "badge", "Crossed Keys")] },

  // Breakouts and Comparison
  { id: "deeper-look-1", category: "breakouts", series: "deeper-look", tier: 1, name: "Deeper Look I: Break It Out", points: 5, description: "Open a metric breakout from a supported row.", phase: "Phase 1", rate: 47.3 },
  { id: "deeper-look-2", category: "breakouts", series: "deeper-look", tier: 2, name: "Deeper Look II: Source Material", points: 10, description: "Where supported, drill from a breakout into an ability, source, or target detail view.", phase: "Phase 1", rate: 21.0 },
  { id: "deeper-look-3", category: "breakouts", series: "deeper-look", tier: 3, name: "Deeper Look III: Cause of Death", points: 10, description: "Open a death or incoming-events analysis for a selected entity.", phase: "Phase 1", rate: 16.4 },
  { id: "deeper-look-4", category: "breakouts", series: "deeper-look", tier: 4, name: "Deeper Look IV: Keep It in View", points: 10, description: "Pin or expand a supported breakout.", phase: "Phase 1", rate: 9.9 },
  { id: "deeper-look-5", category: "breakouts", series: "deeper-look", tier: 5, name: "Deeper Look V: Compare Notes", points: 15, description: "Open a breakout from a source panel selected in a Comparison panel.", phase: "Phase 1", rate: 1.4, rewards: [reward("ach-border-magnifying-lens", "border", "Magnifying Lens")] },

  // Replay and Map
  { id: "replay-1", category: "replay", series: "replay", tier: 1, name: "Replay I: Rewind", points: 5, description: "Open replay for a supported report.", phase: "Phase 1", rate: 24.6 },
  { id: "replay-2", category: "replay", series: "replay", tier: 2, name: "Replay II: Action", points: 10, description: "Start, pause, or seek replay with a registered playback control.", phase: "Phase 1", rate: 13.0 },
  { id: "replay-3", category: "replay", series: "replay", tier: 3, name: "Replay III: Walk the Battlefield", points: 10, description: "Enter walk or free-camera mode and move the camera.", phase: "Phase 1", rate: 7.7 },
  { id: "replay-4", category: "replay", series: "replay", tier: 4, name: "Replay IV: Time and Place", points: 10, description: "For a report with map or replay entity selection, select an event or entity and inspect related report data.", phase: "Phase 2", rate: 3.1 },
  { id: "replay-5", category: "replay", series: "replay", tier: 5, name: "Replay V: Director's Cut", points: 15, description: "Use replay with synchronized video.", phase: "Phase 2", rate: 0.3 },
  // Illustrative only: the spec defines hidden achievements but lists none.
  { id: "replay-hidden", category: "replay", name: "Off the Edge of the Map", points: 10, description: "Fly the free camera beyond the instance boundary.", phase: "Phase 2", rate: 0.9, visibility: "hidden" },

  // Sharing
  { id: "pass-it-on", category: "sharing", name: "Pass It On", points: 5, description: "Copy a valid shareable report view link.", phase: "Phase 1", rate: 17.8 },
  { id: "fresh-eyes", category: "sharing", name: "Fresh Eyes", points: 10, description: "Open a shared report view created by another account.", phase: "Phase 2", rate: 12.1 },

  // Future: Live Collaboration
  { id: "assemble-the-group", category: "live-collaboration", name: "Assemble the Group", points: 10, description: "Start a live collaboration session and create an invite link.", phase: "Future", rate: 0, requirements: [LIVE_COLLAB] },
  { id: "company", category: "live-collaboration", name: "Company", points: 15, description: "Have another account join a live collaboration session created by the user.", phase: "Future", rate: 0, requirements: [LIVE_COLLAB] },
  { id: "in-sync", category: "live-collaboration", name: "In Sync", points: 20, description: "Change synchronized session state while at least one other account is present.", phase: "Future", rate: 0, requirements: [LIVE_COLLAB] },

  // Guild Builder
  { id: "guild-builder-1", category: "guild-builder", series: "guild-builder", tier: 1, name: "Guild Builder I: Put Up a Sign", points: 10, description: "Save an eligible guild page for the first time.", phase: "Phase 2", rate: 1.6, requirements: [GUILD_EDIT], featureURL: "/guilds" },
  { id: "guild-builder-2", category: "guild-builder", series: "guild-builder", tier: 2, name: "Guild Builder II: Room to Grow", points: 10, description: "Add and save a new guild-page panel.", phase: "Phase 2", rate: 1.2, requirements: [GUILD_EDIT] },
  { id: "guild-builder-3", category: "guild-builder", series: "guild-builder", tier: 3, name: "Guild Builder III: Turn the Page", points: 10, description: "Add and save a new guild-page tab.", phase: "Phase 2", rate: 0.7, requirements: [GUILD_EDIT] },
  { id: "guild-builder-4", category: "guild-builder", series: "guild-builder", tier: 4, name: "Guild Builder IV: Make It Yours", points: 10, description: "Save a guild-page header or theme customization.", phase: "Phase 2", rate: 0.9, requirements: [GUILD_EDIT] },
  { id: "guild-builder-5", category: "guild-builder", series: "guild-builder", tier: 5, name: "Guild Builder V: Now Recruiting", points: 15, description: "Save a guild page with a configured recruitment or application destination.", phase: "Phase 2", rate: 0.2, requirements: [GUILD_EDIT] },

  // Rankings and Discovery
  { id: "scout-1", category: "rankings", series: "scout", tier: 1, name: "Scout I: The Standings", points: 5, description: "Open an encounter ranking or leaderboard.", phase: "Phase 1", rate: 71.5, featureURL: "/leaderboards" },
  { id: "scout-2", category: "rankings", series: "scout", tier: 2, name: "Scout II: Know Your Competition", points: 5, description: "Open a character from search or a ranking.", phase: "Phase 1", rate: 58.2, featureURL: "/armory" },
  { id: "scout-3", category: "rankings", series: "scout", tier: 3, name: "Scout III: Guild Research", points: 5, description: "Open a guild from search or a ranking.", phase: "Phase 1", rate: 33.6, featureURL: "/guilds" },
  { id: "scout-4", category: "rankings", series: "scout", tier: 4, name: "Scout IV: Through the Years", points: 10, description: "Open a supported character, guild, or raid history view.", phase: "Phase 1", rate: 10.4, featureURL: "/guild-history" },
  { id: "scout-5", category: "rankings", series: "scout", tier: 5, name: "Scout V: Keep an Eye on This", points: 10, description: "Add a supported entity or report to favorites.", phase: "Phase 1", rate: 14.8, rewards: [reward("ach-badge-scouting-eye", "badge", "Scouting Eye")] },

  // Planning and Theorycraft
  { id: "theorycraft-1", category: "theorycraft", series: "theorycraft", tier: 1, name: "Theorycraft I: Build a Build", points: 10, description: "Save a talent build.", phase: "Phase 2", rate: 8.3 },
  { id: "theorycraft-2", category: "theorycraft", series: "theorycraft", tier: 2, name: "Theorycraft II: Show Your Work", points: 10, description: "Copy a valid share link for a talent build.", phase: "Phase 2", rate: 3.4 },
  { id: "theorycraft-3", category: "theorycraft", series: "theorycraft", tier: 3, name: "Theorycraft III: Run the Numbers", points: 10, description: "Complete a supported simulation.", phase: "Phase 2", rate: 2.0 },
  { id: "theorycraft-4", category: "theorycraft", series: "theorycraft", tier: 4, name: "Theorycraft IV: Dressed for the Occasion", points: 10, description: "Save a gear list or progression plan.", phase: "Phase 2", rate: 6.6, featureURL: "/gear" },
  { id: "theorycraft-5", category: "theorycraft", series: "theorycraft", tier: 5, name: "Theorycraft V: Assemble the Raid", points: 10, description: "Save a raid-planner composition.", phase: "Phase 2", rate: 4.5, featureURL: "/raidplanner" },
  { id: "theorycraft-6", category: "theorycraft", series: "theorycraft", tier: 6, name: "Theorycraft VI: No Need to Type It Twice", points: 15, description: "Successfully import a supported raid-plan or roster format.", phase: "Phase 2", rate: 0.6 },

  // Feats of Strength
  { id: "feat-beta", category: "getting-started", name: "Achievement Beta Tester", points: 0, description: "Participated in the achievement-system beta.", phase: "Phase 1", rate: 0.04, visibility: "feat_of_strength" },
];

export const PHASE_BY_ID = new Map(DEFS.map((def) => [def.id, def.phase]));

function toAchievement(def: Def): Achievement {
  return {
    id: def.id,
    version: 1,
    category_id: def.category,
    series_id: def.series,
    tier: def.tier ?? 0,
    visibility: def.visibility ?? "visible",
    name: def.name,
    description: def.description,
    points: def.points,
    keybind: def.keybind,
    requirements: def.requirements ?? [],
    required_achievement_ids: def.set,
    rewards: def.rewards ?? [],
    feature_url: def.featureURL,
    completion_rate: {
      earned_account_count: Math.round((def.rate / 100) * ELIGIBLE),
      eligible_account_count: ELIGIBLE,
      calculated_at: CALCULATED_AT,
    },
    introduced_at: INTRODUCED_AT,
  };
}

export const ALL_ACHIEVEMENTS: Achievement[] = DEFS.map(toAchievement);

export interface Persona {
  /** Earned achievement IDs mapped to "days ago". Negative days mark retroactive awards. */
  earned: Record<string, number>;
  /** Requirement labels the viewer satisfies. */
  metRequirements?: string[];
}

const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

export const PERSONAS = {
  newAccount: { earned: { welcome: 0.01 } },
  explorer: {
    earned: {
      welcome: 40,
      "first-record": -120,
      "open-the-books": 40,
      "choose-your-battles": 39,
      "pick-your-players": 39,
      "rate-of-change": 30,
      "follow-the-action": 12,
      "new-perspective": 38,
      "panel-craft-1": 20,
      "panel-craft-3": 11,
      "panel-craft-4": 2,
      "filter-craft-1": 9,
      "filter-craft-2": 1,
      "layouts-1": 15,
      "layouts-4": -200,
      "layouts-5": -200,
      "keybinds-1": 5,
      "keybinds-4": 0.2,
      "deeper-look-1": 38,
      "deeper-look-3": 25,
      "replay-1": 18,
      "scout-1": 41,
      "scout-2": 41,
      "scout-4": 7,
    },
    metRequirements: [HONORED.label],
  },
  completionist: {
    earned: Object.fromEntries(
      DEFS.filter((def) => def.phase !== "Future").map((def, index) => [def.id, index % 7 === 0 ? -300 : 1 + index * 2]),
    ),
    metRequirements: [HONORED.label, GUILD_EDIT.label],
  },
} satisfies Record<string, Persona>;

export interface ResponseOptions {
  /** Omit the viewer, as for an anonymous request. */
  signedOut?: boolean;
  persona?: Persona;
  /** Limit the catalog to these phases, as a launch catalog would. */
  phases?: Phase[];
}

/** Builds the GET /api/v1/achievements response the server would send. */
export function achievementsResponse({ signedOut = false, persona = PERSONAS.explorer, phases }: ResponseOptions = {}): AchievementsResponse {
  const met = new Set(signedOut ? [] : (persona.metRequirements ?? []));
  const included = DEFS.filter((def) => !phases || phases.includes(def.phase));
  const includedIDs = new Set(included.map((def) => def.id));
  const earned = signedOut ? {} : persona.earned;

  const achievements = included
    // Sets whose members are outside the phase filter are dropped, as the server would not release them.
    .filter((def) => !def.set || def.set.every((id) => includedIDs.has(id)))
    // Feats of Strength are only sent once earned.
    .filter((def) => def.visibility !== "feat_of_strength" || def.id in earned)
    .map(toAchievement)
    .map((achievement) => {
      const withRequirements = {
        ...achievement,
        requirements: achievement.requirements.map((requirement) => ({ ...requirement, met: met.has(requirement.label) })),
      };
      // Hidden achievements withhold name and criteria until earned.
      if (achievement.visibility === "hidden" && !(achievement.id in earned)) {
        return { ...withRequirements, name: "", description: "" };
      }
      return withRequirements;
    });

  const progress: AchievementProgress[] = Object.entries(earned)
    .filter(([id]) => achievements.some((achievement) => achievement.id === id))
    .map(([id, days]) => ({
      achievement_id: id,
      version: 1,
      earned_at: daysAgo(Math.abs(days)),
      retroactive: days < 0,
      current: 0,
      required: 0,
    }));

  const pointsOf = (ids: Iterable<string>) => {
    let total = 0;
    for (const id of ids) total += achievements.find((achievement) => achievement.id === id && achievement.visibility !== "feat_of_strength")?.points ?? 0;
    return total;
  };

  return {
    categories: CATEGORIES.filter((category) => achievements.some((achievement) => achievement.category_id === category.id)),
    series: SERIES,
    achievements,
    total_points: achievements.filter((achievement) => achievement.visibility !== "feat_of_strength").reduce((total, achievement) => total + achievement.points, 0),
    viewer: signedOut ? null : { earned_points: pointsOf(progress.map((entry) => entry.achievement_id)), progress },
  };
}
