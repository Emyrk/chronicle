import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type {
  ArmoryPlayer,
  ArmorySearchResult,
  CharacterEncounterStatsResponse,
  CharacterPerformanceResponse,
  CharacterPerformanceRun,
  SupportedInstance,
} from "@/api/typesGenerated";
import { TooltipProvider } from "@/components/ui/Tooltip/tooltip";
import { PerformanceComparisonPage } from "./AnalysisPage";

const REALM = "Nordanaar";
const DAY_MS = 24 * 60 * 60 * 1000;

const NAXX_BOSSES = [
  "Anub'Rekhan", "Grand Widow Faerlina", "Maexxna", "Noth the Plaguebringer", "Heigan the Unclean", "Loatheb",
  "Instructor Razuvious", "Gothik the Harvester", "The Four Horsemen", "Patchwerk", "Grobbulus", "Gluth",
  "Thaddius", "Sapphiron", "Kel'Thuzad",
];
const BWL_BOSSES = [
  "Razorgore the Untamed", "Vaelastrasz the Corrupt", "Broodlord Lashlayer", "Firemaw", "Ebonroc", "Flamegor",
  "Chromaggus", "Nefarian",
];
const INSTANCES = [
  { name: "Naxxramas", bosses: NAXX_BOSSES },
  { name: "Blackwing Lair", bosses: BWL_BOSSES },
];

interface MockPlayer {
  id: string;
  name: string;
  className: string;
  guild: string;
  role: "dps" | "heal";
  specs: { spec: string; subSpec?: string; weight: number }[];
  /** Typical parse at the start of the window. */
  base: number;
  /** Parse points gained across the 180-day window. */
  trend: number;
  /** Run-to-run noise in parse points. */
  noise: number;
  /** Throughput at a 90 parse. */
  throughput: number;
  deathRate: number;
  /** Raid nights per week. */
  cadence: number;
  /** Limits history, for low-data players. */
  maxRuns?: number;
  instances: string[];
}

/** A small seeded realm. Every number is invented and deterministic per player. */
const PLAYERS: MockPlayer[] = [
  { id: "0x00000000000A0001", name: "Velyndra", className: "MAGE", guild: "Ashen Covenant", role: "dps", specs: [{ spec: "Fire", weight: 3 }, { spec: "Frost", subSpec: "Frost/Fire", weight: 1 }], base: 84, trend: 8, noise: 4.5, throughput: 1280, deathRate: 0.3, cadence: 2, instances: ["Naxxramas", "Blackwing Lair"] },
  { id: "0x00000000000A0002", name: "Morthul", className: "WARLOCK", guild: "Ashen Covenant", role: "dps", specs: [{ spec: "Destruction", weight: 1 }], base: 92, trend: 1, noise: 2.5, throughput: 1310, deathRate: 0.1, cadence: 2, instances: ["Naxxramas", "Blackwing Lair"] },
  { id: "0x00000000000A0003", name: "Brakkus", className: "WARRIOR", guild: "Ironbound", role: "dps", specs: [{ spec: "Fury", weight: 1 }], base: 93, trend: -6, noise: 7, throughput: 1350, deathRate: 0.8, cadence: 2, instances: ["Naxxramas", "Blackwing Lair"] },
  { id: "0x00000000000A0004", name: "Quellin", className: "MAGE", guild: "Ironbound", role: "dps", specs: [{ spec: "Frost", weight: 1 }], base: 85, trend: 3, noise: 5, throughput: 1180, deathRate: 0.4, cadence: 1, instances: ["Naxxramas"] },
  { id: "0x00000000000A0005", name: "Sinnet", className: "ROGUE", guild: "Ashen Covenant", role: "dps", specs: [{ spec: "Combat", weight: 1 }], base: 86, trend: 5, noise: 3.5, throughput: 1240, deathRate: 0.2, cadence: 2, instances: ["Naxxramas", "Blackwing Lair"] },
  { id: "0x00000000000A0006", name: "Tavrin", className: "HUNTER", guild: "Wildfire", role: "dps", specs: [{ spec: "Marksmanship", weight: 1 }], base: 90, trend: 2, noise: 4, throughput: 1210, deathRate: 0.3, cadence: 1, instances: ["Blackwing Lair"] },
  { id: "0x00000000000A0007", name: "Holtmar", className: "WARRIOR", guild: "Wildfire", role: "dps", specs: [{ spec: "Fury", weight: 1 }], base: 94, trend: 0, noise: 3, throughput: 1330, deathRate: 0.5, cadence: 1, maxRuns: 2, instances: ["Naxxramas"] },
  { id: "0x00000000000A0008", name: "Lumessa", className: "PRIEST", guild: "Ashen Covenant", role: "heal", specs: [{ spec: "Holy", weight: 1 }], base: 88, trend: 4, noise: 4, throughput: 720, deathRate: 0.2, cadence: 2, instances: ["Naxxramas", "Blackwing Lair"] },
  { id: "0x00000000000A0009", name: "Fennick", className: "DRUID", guild: "Ironbound", role: "heal", specs: [{ spec: "Restoration", weight: 1 }], base: 83, trend: 6, noise: 5, throughput: 650, deathRate: 0.3, cadence: 2, instances: ["Naxxramas", "Blackwing Lair"] },
  { id: "0x00000000000A000A", name: "Rhovan", className: "HUNTER", guild: "Ashen Covenant", role: "dps", specs: [{ spec: "Marksmanship", weight: 1 }], base: 89, trend: -3, noise: 6, throughput: 1190, deathRate: 0.6, cadence: 2, instances: ["Naxxramas", "Blackwing Lair"] },
];

const playerById = (id: string) => PLAYERS.find((player) => player.id.toLowerCase() === id.toLowerCase());

function hashSeed(text: string): number {
  let hash = 2166136261;
  for (const char of text) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

/** mulberry32: small deterministic PRNG so every reload shows the same runs. */
function seededRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function searchResult(player: MockPlayer): ArmorySearchResult {
  return {
    id: player.id,
    realm_name: REALM,
    realm_id: "realm-nordanaar",
    name: player.name,
    class: player.className,
    race: "Human",
    gender: "Female",
    level: 60,
    guild_id: `guild-${player.guild}`,
    guild_name: player.guild,
    updated_at: new Date().toISOString(),
  };
}

function armoryPlayer(player: MockPlayer): ArmoryPlayer {
  return {
    ...searchResult(player),
    gear: {} as ArmoryPlayer["gear"],
    dataset_id: "default",
    owner_ads_free: false,
  };
}

function characterEncounters(player: MockPlayer): CharacterEncounterStatsResponse {
  const now = Date.now();
  return {
    player_guid: player.id,
    encounters: INSTANCES.filter((instance) => player.instances.includes(instance.name)).flatMap((instance, index) =>
      instance.bosses.map((encounterName) => ({
        instance_name: instance.name,
        encounter_name: encounterName,
        difficulty_name: "Normal",
        max_players: 40,
        kills: 12,
        first_killed_at: new Date(now - 170 * DAY_MS).toISOString(),
        last_killed_at: new Date(now - (index + 1) * DAY_MS).toISOString(),
      }))),
  };
}

function performanceRuns(player: MockPlayer, url: URL): CharacterPerformanceResponse {
  const instanceName = url.searchParams.get("instance_name") ?? "";
  const encounters = (url.searchParams.get("encounter_names") ?? "").split(",").filter(Boolean);
  const metric = url.searchParams.get("metric") === "hps" ? "hps" : "dps";
  if (!player.instances.includes(instanceName) || encounters.length === 0) {
    return { player_guid: player.id, metric, runs: [] };
  }

  const random = seededRandom(hashSeed(`${player.id}|${instanceName}`));
  // A small per-boss-selection offset so changing bosses visibly moves the numbers.
  const selectionOffset = (seededRandom(hashSeed(encounters.join(",")))() - 0.5) * 6;
  const offPurpose = (metric === "hps") !== (player.role === "heal");
  const totalWeight = player.specs.reduce((sum, spec) => sum + spec.weight, 0);
  const runs: CharacterPerformanceRun[] = [];
  const now = Date.now();
  const gapDays = 7 / player.cadence;

  for (let daysAgo = 2 + random() * 2; daysAgo < 178; daysAgo += gapDays * (0.7 + random() * 0.6)) {
    if (player.maxRuns !== undefined && runs.length >= player.maxRuns) break;
    const progress = 1 - daysAgo / 180;
    let pick = random() * totalWeight;
    const spec = player.specs.find((option) => (pick -= option.weight) < 0) ?? player.specs[0];
    const specPenalty = spec === player.specs[0] ? 0 : -4;
    // An occasional disaster night (disconnect, early death) gives the box plot real outliers.
    const disaster = random() < 0.05 ? -25 : 0;
    const parse = Math.max(1, Math.min(99.9,
      player.base + player.trend * progress + selectionOffset + specPenalty + disaster + (random() - 0.5) * 2 * player.noise
      - (offPurpose ? 75 : 0)));
    const throughput = Math.max(10, (offPurpose ? player.throughput * 0.08 : player.throughput) * (0.55 + parse / 200));
    const duration = encounters.length * (170 + random() * 80);
    const deaths = Math.floor(random() * (player.deathRate * 2 + 0.6));
    const startedAt = new Date(now - daysAgo * DAY_MS);
    startedAt.setHours(20, 0, 0, 0);
    runs.push({
      run_id: `${player.id}-${instanceName}-${runs.length}`,
      representative_instance_id: `instance-${runs.length}`,
      started_at: startedAt.toISOString(),
      killed_at: new Date(startedAt.getTime() + duration * 1000).toISOString(),
      player_name: player.name,
      player_class: player.className,
      player_spec: spec.spec,
      player_sub_spec: spec.subSpec,
      encounter_count: encounters.length,
      damage_done: Math.round((metric === "dps" ? throughput : throughput * 0.2) * duration),
      healing_done: Math.round((metric === "hps" ? throughput : 0) * duration),
      absorbed_done: 0,
      player_deaths: deaths,
      alive_percentage: Math.max(40, 100 - deaths * (8 + random() * 10)),
      duration_secs: duration,
      dps: metric === "dps" ? throughput : throughput * 0.2,
      hps: metric === "hps" ? throughput : 0,
      log_hashed_slug: "storybook",
      // Roughly one run in twelve is missing a cached parse, like real data.
      average_parse: random() < 0.08 ? undefined : parse,
    });
  }
  return { player_guid: player.id, metric, runs };
}

const SUPPORTED_INSTANCES: SupportedInstance[] = INSTANCES.map((instance) => ({
  name: instance.name,
  category: "raid",
  progression_bosses: instance.bosses,
}));

const handlers = [
  http.get("/api/v1/site-config", () => HttpResponse.json({ signups_enabled: true, client_uploads_disabled: false, billing_enabled: false, ads_enabled: false, tenant: null })),
  http.get("/api/v1/whoami", () => new HttpResponse(null, { status: 401 })),
  http.get("/api/v1/raidlogs/supported", () => HttpResponse.json(SUPPORTED_INSTANCES)),
  http.get("/api/v1/armory/search", ({ request }) => {
    const query = (new URL(request.url).searchParams.get("q") ?? "").toLowerCase();
    const players = PLAYERS.filter((player) => player.name.toLowerCase().includes(query)).map(searchResult);
    return HttpResponse.json({ players, count: players.length });
  }),
  http.get("/api/v1/armory/:realm/:id", ({ params }) => {
    const player = playerById(String(params.id));
    return player ? HttpResponse.json(armoryPlayer(player)) : new HttpResponse(null, { status: 404 });
  }),
  http.get("/api/v1/rankings/characters/:id/encounters", ({ params }) => {
    const player = playerById(String(params.id));
    return player ? HttpResponse.json(characterEncounters(player)) : new HttpResponse(null, { status: 404 });
  }),
  http.get("/api/v1/rankings/characters/:id/performance", ({ params, request }) => {
    const player = playerById(String(params.id));
    return player ? HttpResponse.json(performanceRuns(player, new URL(request.url))) : new HttpResponse(null, { status: 404 });
  }),
];

function pathFor(names: string[], extra = "") {
  const search = new URLSearchParams({ realm: REALM });
  for (const name of names) {
    const player = PLAYERS.find((item) => item.name === name)!;
    search.append("player", player.id);
    search.append("spec", "");
    search.append("subspec", "");
  }
  return `/performance-history?${search.toString()}${extra}`;
}

const meta = {
  title: "Pages/ArmoryPage/PerformanceHistory",
  component: PerformanceComparisonPage,
  parameters: { layout: "fullscreen", msw: { handlers }, path: pathFor(["Velyndra"]) },
  decorators: [
    (Story, context) => (
      <TooltipProvider>
        <MemoryRouter initialEntries={[context.parameters.path as string]}>
          <Routes>
            <Route path="/performance-history" element={<Story />} />
          </Routes>
        </MemoryRouter>
      </TooltipProvider>
    ),
  ],
} satisfies Meta<typeof PerformanceComparisonPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * One player. Use "Add player" to compare: the mock realm has Velyndra, Morthul, Brakkus,
 * Quellin, Sinnet, Tavrin (BWL only), Holtmar (2 runs), Lumessa and Fennick (healers), and Rhovan.
 */
export const OnePlayer: Story = {};

/** Three players in Parse mode: the summary becomes a comparison table. */
export const ComparePlayers: Story = {
  parameters: { path: pathFor(["Velyndra", "Morthul", "Brakkus"], "&display=parse") },
};

/** A full roster of five, including two mages and a player with only 2 runs. */
export const FullRoster: Story = {
  parameters: { path: pathFor(["Velyndra", "Morthul", "Brakkus", "Quellin", "Holtmar"], "&display=parse") },
};

/** Healers in HPS mode. */
export const Healers: Story = {
  parameters: { path: pathFor(["Lumessa", "Fennick"], "&metric=hps&display=parse") },
};

/** No player selected yet: the search landing page. Try "vel" or "mor". */
export const Landing: Story = {
  parameters: { path: "/performance-history" },
};
