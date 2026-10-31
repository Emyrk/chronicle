import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { MemoryRouter } from "react-router-dom";
import { expect, fireEvent, userEvent, waitFor, within } from "storybook/test";
import { PlayerMetricChart, type PlayerMetricChartData } from "@/components/ui/PlayerMetricChart/PlayerMetricChart";
import { focusPlayerActions } from "@/components/ui/PlayerMetricChart/instanceEntity";
import { Toaster } from "@/components/ui/Sonner/Sonner";
import { TooltipProvider } from "@/components/ui/Tooltip/tooltip";
import { EntityActionScope, EntityMenuProvider } from "./EntityMenu";
import { EntityName } from "./EntityName";
import { useEntityRaidContext } from "./entityMenuContext";
import { bossEntity, entityAttributes, raidEntity, type EntityRef } from "./entity";
import { http, HttpResponse } from "msw";
import { LayoutDashboard } from "lucide-react";
import { performanceHandlers, PLAYERS, REALM } from "@/pages/ArmoryPage/AnalysisPage.mocks";
import { GUILDS, guildHistoryHandlers, whoami } from "@/pages/GuildHistory/GuildHistoryPage.mocks";

// The server's spread of kills and this log's kill-time parses, for encounters in the tray.
const LOG_ID = "log-naxx";
// Server, realm and guild cohorts of the raid: each run's Patchwerk and Grobbulus kill times.
const COHORT_SIZE = { server: 60, realm: 24, guild: 9 } as const;
const COHORT_PACE = { server: 1, realm: 0.95, guild: 0.9 } as const;
const cohortHandler = http.get("/api/v1/raidlogs/instances/:id/speedrun/cohort", ({ request }) => {
  const scope = (new URL(request.url).searchParams.get("scope") ?? "server") as keyof typeof COHORT_SIZE;
  const runs = Array.from({ length: COHORT_SIZE[scope] }, (_, index) => {
    // Deterministic spread around each boss's typical kill, a bit faster for smaller scopes.
    const wobble = ((index * 37) % 23) / 22 - 0.5;
    return {
      instance_id: `${scope}-${index}`,
      slug: `${scope}-${index}`,
      start_time: "2026-10-01T20:00:00Z",
      requirements_complete: true,
      qualified: true,
      duration_ms: Math.round(COHORT_PACE[scope] * (95 * 60_000 + wobble * 30 * 60_000)),
      requirements_satisfied: 1,
      requirements_total: 1,
      encounter_kill_times: [
        { encounter_name: "Patchwerk", duration_ms: Math.round(COHORT_PACE[scope] * (160_000 + wobble * 90_000)) },
        { encounter_name: "Grobbulus", duration_ms: Math.round(COHORT_PACE[scope] * (130_000 + wobble * 70_000)) },
      ],
    };
  });
  return HttpResponse.json({
    cohort: {
      scope, label: scope, instance_name: "Naxxramas", difficulty_name: "Normal", max_players: 40, lookback_days: 60,
      window_start: "", window_end: "", eligible_runs: runs.length, runs_with_overview_metrics: 0, overview_metrics_version: 0,
    },
    overview: { runs: 0, top_incoming_damage_abilities: [] },
    runs,
  });
});
const bossParse = (encounter_id: string, encounter_name: string, duration_ms: number, rank: number, sample_size: number, score: number) => ({
  encounter_id, encounter_name, duration_ms, precise_score: score, display_score: Math.round(score), rank, sample_size, status: "ok",
});
const clearParse = (rank: number, sample_size: number, score: number) => ({
  duration_ms: 88 * 60_000, precise_score: score, display_score: Math.round(score), rank, sample_size, status: "ok",
});
const CLEAR_PARSES = { server: clearParse(14, 60, 78.3), realm: clearParse(6, 24, 74.0), guild: clearParse(2, 9, 88.0) } as const;
const scopeResult = (patchwerk: ReturnType<typeof bossParse>, grobbulus: ReturnType<typeof bossParse>, scope: keyof typeof CLEAR_PARSES) => ({
  available: true,
  clear_time: CLEAR_PARSES[scope],
  boss_kill_times: [patchwerk, grobbulus],
});
const timeParsesHandler = http.get("/api/v1/rankings/instances/:id/time-parses", () =>
  HttpResponse.json({
    available: true,
    cutoff: "",
    lookback_days: 60,
    policy_version: 1,
    query_version: 1,
    computed_at: "",
    boss_kill_times: [],
    scopes: {
      server: scopeResult(bossParse("enc-patchwerk", "Patchwerk", 142_000, 24, 212, 89.4), bossParse("enc-grobbulus", "Grobbulus", 151_000, 140, 198, 31.2), "server"),
      realm: scopeResult(bossParse("enc-patchwerk", "Patchwerk", 142_000, 9, 61, 86.2), bossParse("enc-grobbulus", "Grobbulus", 151_000, 40, 55, 27.5), "realm"),
      guild: scopeResult(bossParse("enc-patchwerk", "Patchwerk", 142_000, 2, 11, 91.0), bossParse("enc-grobbulus", "Grobbulus", 151_000, 9, 10, 15.0), "guild"),
    },
  }),
);

// Server kill-time stats, for a boss name with no pull (as on the leaderboards).
const killTimesHandler = http.get("/api/v1/rankings/kill-times", () =>
  HttpResponse.json([{ encounter_name: "Thaddius", min_secs: 150, q1_secs: 190, median_secs: 210, q3_secs: 240, max_secs: 330, count: 180 }]),
);

// Server clear-time stats and the speedrun board, for raids.
const clearTimesHandler = http.get("/api/v1/rankings/clear-times", () =>
  HttpResponse.json([{ encounter_name: "Full clear", min_secs: 4_700, q1_secs: 5_300, median_secs: 5_700, q3_secs: 6_300, max_secs: 8_100, count: 140 }]),
);
const speedrunBoardHandler = http.get("/api/v1/rankings/speedrun", () =>
  HttpResponse.json(
    [["Zug Zug", 4_712_000], ["Once Upon", 4_955_000], ["LaNuit", 5_102_000]].map(([guild_name, duration_ms], index) => ({
      instance_id: `speedrun-${index}`, slug: `speedrun-${index}`, difficulty_name: "Normal", duration_ms, guild_id: `guild-${index}`,
      guild_name, realm_name: "Nordanaar", start_time: "2026-10-20T19:00:00Z", completion_time: "2026-10-20T20:30:00Z",
      player_count: 40, parser_version: "", addon_version: "",
    })),
  ),
);

const tierHandlers = (tier: Parameters<typeof whoami>[0]) => [whoami(tier), cohortHandler, timeParsesHandler, killTimesHandler, clearTimesHandler, speedrunBoardHandler, ...performanceHandlers, ...guildHistoryHandlers];

const encounterPin = (id: string, name: string, durationMs: number, startTime: string): EntityRef => ({
  kind: "encounter",
  id,
  name,
  logId: LOG_ID,
  instanceName: "Naxxramas",
  difficultyName: "Normal",
  maxPlayers: 40,
  killType: "clean",
  durationMs,
  startTime,
});
const patchwerkEntity = encounterPin("enc-patchwerk", "Patchwerk", 142_000, "2026-10-28T20:41:00Z");
const raidClear: EntityRef = {
  kind: "raid",
  id: LOG_ID,
  name: "Naxxramas",
  difficultyName: "Normal",
  maxPlayers: 40,
  logId: LOG_ID,
  clearMs: 88 * 60_000,
  startTime: "2026-10-28T19:02:00Z",
  guildName: "Once Upon",
};
const grobbulusEntity = encounterPin("enc-grobbulus", "Grobbulus", 151_000, "2026-10-28T20:52:00Z");

// Players and guilds from the performance and guild history mocks, so "Show stats" has data.
const rows: PlayerMetricChartData[] = [
  { name: "Morthul", className: "Warlock", specialization: "Destruction", value: 1410.2 },
  { name: "Holtmar", className: "Warrior", specialization: "Fury", value: 1388.7 },
  { name: "Velyndra", className: "Mage", specialization: "Fire", value: 1302.5 },
  { name: "Brakkus", className: "Warrior", specialization: "Fury", value: 1214.9 },
  { name: "Quellin", className: "Mage", specialization: "Frost", value: 1120.4 },
].map(({ name, ...row }) => ({ ...row, playerName: name, playerID: PLAYERS.find((player) => player.name === name)!.id }));

const rowEntity = (row: PlayerMetricChartData): EntityRef => ({
  kind: "character",
  realm: REALM,
  guid: row.playerID,
  name: row.playerName,
  className: row.className,
});

const guildEntity = (name: string): EntityRef => {
  const guild = GUILDS.find((item) => item.guildName === name)!;
  return { kind: "guild", id: guild.guildId, name: guild.guildName };
};
const guild = guildEntity("Once Upon");
const otherGuild = guildEntity("Zug Zug");

const PINS_KEY = "chronicle.entity-compare";
const HIDDEN_KEY = "chronicle.entity-compare-hidden";
const TAB_KEY = "chronicle.quick-stats-tab";
const DISPLAY_KEY = "chronicle.quick-stats-display";
const RANGE_KEY = "chronicle.quick-stats-range";

/** Stands in for an instance page: Naxxramas with four bosses selected. The mock's latest night is "instance-0". */
function OnLogPage() {
  useEntityRaidContext({
    instanceId: "instance-0",
    instanceName: "Naxxramas",
    difficultyName: "Normal",
    maxPlayers: 40,
    bossNames: ["Patchwerk", "Grobbulus", "Gluth", "Thaddius"],
    label: "Naxxramas · <Once Upon> · Oct 28, 2026",
  });
  return <Playground />;
}

async function altClick(element: Element, x = 120, y = 160) {
  fireEvent.click(element, { altKey: true, clientX: x, clientY: y });
}

function Playground() {
  const [focused, setFocused] = useState<string | null>(null);
  const focusedName = rows.find((row) => row.playerID === focused)?.playerName;
  return (
    <div className="max-w-xl space-y-6 text-sm">
      <p className="text-muted-foreground">
        Hold <kbd className="rounded border px-1 text-xs">Alt</kbd> (Option on Mac) to outline everything you can inspect, then click
        one to open its menu.
      </p>
      <div className="rounded-md border p-3">
        <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>Damage Done</span>
          {focusedName && (
            <button type="button" className="hover:text-foreground" onClick={() => setFocused(null)}>
              Focused on {focusedName} · clear
            </button>
          )}
        </div>
        <EntityActionScope actions={focusPlayerActions(setFocused)}>
          <PlayerMetricChart data={rows} type="damage" panelTitle="Damage Done" rowEntity={rowEntity} />
        </EntityActionScope>
      </div>
      <EntityActionScope
        actions={(entity) =>
          entity.kind === "encounter" ? [{ id: "overview", label: "Go to overview", icon: LayoutDashboard, onSelect: () => undefined }] : []
        }
      >
        <div className="w-56 space-y-1">
          {[patchwerkEntity, grobbulusEntity].map((encounter) => (
            <div key={encounter.id} className="flex items-center justify-between rounded-md border px-3 py-2" {...entityAttributes(encounter)}>
              <span>{encounter.name}</span>
              <span className="font-mono text-xs text-muted-foreground">{encounter.id === "enc-patchwerk" ? "2:22" : "2:31"}</span>
            </div>
          ))}
          <div className="rounded-md border px-3 py-2 font-semibold" {...entityAttributes(raidClear)}>
            Naxxramas <span className="text-xs font-normal text-muted-foreground">(this log's raid, cleared in 1:28:00)</span>
          </div>
          <div className="rounded-md border border-dashed px-3 py-2 text-muted-foreground" {...entityAttributes(raidEntity("Molten Core"))}>
            Molten Core <span className="text-xs">(a raid name, as on the leaderboards)</span>
          </div>
          <div className="rounded-md border border-dashed px-3 py-2 text-muted-foreground" {...entityAttributes(bossEntity("Naxxramas", "Thaddius"))}>
            Thaddius <span className="text-xs">(a boss name, as on the leaderboards)</span>
          </div>
        </div>
      </EntityActionScope>
      <p>
        <EntityName entity={rowEntity(rows[0])} link /> and <EntityName entity={rowEntity(rows[4])} /> raid with{" "}
        <EntityName entity={guild} link className="font-medium" />, rivals of <EntityName entity={otherGuild} className="font-medium" />.
        Linked names still work as ordinary links; the others are plain text.
      </p>
    </div>
  );
}

const meta = {
  title: "Components/EntityMenu",
  component: Playground,
  // Signed in as Revered, so the tray shows stats. The Friendly stories show the free preview.
  parameters: { layout: "padded", msw: { handlers: tierHandlers("revered") } },
  beforeEach: () => {
    localStorage.removeItem(PINS_KEY);
    localStorage.removeItem(HIDDEN_KEY);
    localStorage.removeItem(DISPLAY_KEY);
    localStorage.removeItem(RANGE_KEY);
  },
  decorators: [
    (Story) => (
      <MemoryRouter>
        <TooltipProvider>
          <EntityMenuProvider>
            <Story />
            <Toaster />
          </EntityMenuProvider>
        </TooltipProvider>
      </MemoryRouter>
    ),
  ],
} satisfies Meta<typeof Playground>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Revered on a log page (Naxxramas, four bosses selected): Alt+click a name and pick Add to compare. */
export const Default: Story = {
  render: () => <OnLogPage />,
};

/**
 * Encounters are a third kind. Add one to compare and the tray shows box plots of the server's,
 * realm's and guild's kill times with the pull and its parse marked, free for everyone.
 */
export const EncounterKillTimes: Story = {
  parameters: { msw: { handlers: tierHandlers("free") } },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await altClick(canvasElement.querySelector('[data-entity*="Patchwerk"]')!, 120, 200);
    const menu = await body.findByRole("menu", { name: "Patchwerk actions" });
    await expect(within(menu).getByText("Encounter")).toBeInTheDocument();
    const items = within(menu).getAllByRole("menuitem").map((item) => item.textContent);
    await expect(items).toEqual(["Go to overview", "Add to compare", "Kill time leaderboard", "Copy name"]);
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Add to compare" }));
    const tray = await body.findByRole("region", { name: "Compare tray" });
    await waitFor(() => expect(tray.querySelectorAll("[data-kill-box]")).toHaveLength(3), { timeout: 5000 });
    await waitFor(() => expect(tray.querySelector('[data-kill-parse="server"]')).toHaveTextContent("89"));
    await userEvent.hover(tray.querySelector('[data-kill-lane="server"]')!);
    await expect((await body.findAllByText("Middle half"))[0]).toBeInTheDocument();
    await expect(body.getAllByText("rank 24 of 212")[0]).toBeInTheDocument();
    await expect(within(tray).getByRole("link", { name: /Open log overview/ })).toHaveAttribute("href", `/instances/${LOG_ID}?view=overview`);
  },
};

/** Players, guilds and encounters at once: the title bar shows each kind as a dot and count so the range still fits. */
export const AllKinds: Story = {
  beforeEach: () => {
    localStorage.removeItem(TAB_KEY);
    localStorage.setItem(
      PINS_KEY,
      JSON.stringify([patchwerkEntity, grobbulusEntity, guild, otherGuild, rowEntity(rows[0]), rowEntity(rows[2]), rowEntity(rows[3])]),
    );
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const tray = await body.findByRole("region", { name: "Compare tray" });
    const range = within(tray).getByRole("group", { name: "Range" });
    const minimize = within(tray).getByRole("button", { name: "Minimize compare tray" });
    await expect(range.getBoundingClientRect().right).toBeLessThanOrEqual(tray.getBoundingClientRect().right);
    await expect(minimize.getBoundingClientRect().right).toBeLessThanOrEqual(tray.getBoundingClientRect().right);
    await expect(within(tray).getByRole("button", { name: "2 encounters" })).toBeInTheDocument();
  },
};

/** A boss name with no pull (as on the leaderboards): the server's kill times alone. */
export const BossName: Story = {
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await altClick(canvasElement.querySelector('[data-entity*="boss:Naxxramas:Thaddius"]')!, 120, 260);
    const menu = await body.findByRole("menu", { name: "Thaddius actions" });
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Add to compare" }));
    const tray = await body.findByRole("region", { name: "Compare tray" });
    await expect(await within(tray).findByText("Server, last 90 days")).toBeInTheDocument();
    await waitFor(() => expect(tray.querySelectorAll("[data-kill-lane]")).toHaveLength(1));
  },
};

/** Hovering a name in the tray says what it is and where it was added, with a link back. */
export const PinOrigin: Story = {
  render: () => <OnLogPage />,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await altClick(canvasElement.querySelector('[data-entity*="Patchwerk"]')!, 120, 200);
    const menu = await body.findByRole("menu", { name: "Patchwerk actions" });
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Add to compare" }));
    const tray = await body.findByRole("region", { name: "Compare tray" });
    await userEvent.hover(within(within(tray).getByRole("list")).getByRole("button", { name: "Patchwerk" }));
    // Radix renders tooltip text twice (once for screen readers).
    await expect((await body.findAllByText("Added from", {}, { timeout: 2000 }))[0]).toBeInTheDocument();
    await expect(body.getAllByRole("link", { name: "Naxxramas · <Once Upon> · Oct 28, 2026" })[0]).toBeInTheDocument();
  },
};

/** A log's raid: server, realm and guild clear times with the clear and its parse, then the speedrun top three. */
export const RaidClear: Story = {
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await altClick(canvasElement.querySelector('[data-entity-kind="raid"][data-entity*="log-naxx"]')!, 120, 260);
    const menu = await body.findByRole("menu", { name: "Naxxramas actions" });
    const items = within(menu).getAllByRole("menuitem").map((item) => item.textContent);
    await expect(items).toEqual(["Add to compare", "Open log overview", "Speedrun leaderboard", "Statistics leaderboard", "Copy name"]);
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Add to compare" }));
    const tray = await body.findByRole("region", { name: "Compare tray" });
    await waitFor(() => expect(tray.querySelectorAll("[data-kill-box]")).toHaveLength(3), { timeout: 5000 });
    await waitFor(() => expect(tray.querySelector('[data-kill-parse="guild"]')).toHaveTextContent("88"));
    await expect(await within(tray).findByText("Fastest clears")).toBeInTheDocument();
    await expect(within(tray).getByText("Zug Zug")).toBeInTheDocument();
  },
};

/** Two clears of the same raid share one set of box plots (a dot each) and one speedrun top three. */
export const RaidCompareSameRaid: Story = {
  beforeEach: () => {
    localStorage.setItem(
      PINS_KEY,
      JSON.stringify([
        raidClear,
        { ...raidClear, id: "log-naxx-2", logId: "log-naxx-2", clearMs: 79 * 60_000, startTime: "2026-10-21T19:00:00Z", guildName: "Zug Zug" },
      ]),
    );
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const tray = await body.findByRole("region", { name: "Compare tray" });
    await waitFor(() => expect(tray.querySelectorAll("[data-kill-box]")).toHaveLength(3), { timeout: 5000 });
    await expect(within(tray).getAllByText("Fastest clears")).toHaveLength(1);
    await expect(within(tray).getByText("2 clears")).toBeInTheDocument();
    // Each scope's parse column holds one number per clear.
    await waitFor(() => expect(tray.querySelector('[data-kill-parse="server"]')!.children).toHaveLength(2));
  },
};

/** A raid name with no clear (as on the leaderboards): the server's clear times and the speedrun top three. */
export const RaidName: Story = {
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await altClick(canvasElement.querySelector('[data-entity*="raid:Molten Core"]')!, 120, 280);
    const menu = await body.findByRole("menu", { name: "Molten Core actions" });
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Add to compare" }));
    const tray = await body.findByRole("region", { name: "Compare tray" });
    await waitFor(() => expect(tray.querySelectorAll("[data-kill-box]")).toHaveLength(1), { timeout: 5000 });
    await expect(within(tray).getByText("Server, last 90 days")).toBeInTheDocument();
  },
};

/** Several encounters stack, each with its own server, realm and guild box plots. */
export const CompareEncounters: Story = {
  parameters: { msw: { handlers: tierHandlers("free") } },
  beforeEach: () => {
    localStorage.removeItem(TAB_KEY);
    localStorage.setItem(PINS_KEY, JSON.stringify([patchwerkEntity, grobbulusEntity]));
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const tray = await body.findByRole("region", { name: "Compare tray" });
    // Two encounters, three scopes each.
    await waitFor(() => expect(tray.querySelectorAll("[data-kill-box]")).toHaveLength(6), { timeout: 5000 });
    await waitFor(() => expect([...tray.querySelectorAll('[data-kill-parse="server"]')].map((node) => node.textContent)).toEqual(["89", "31"]));
  },
};

/** On a touch screen, press and hold a name to open its menu; the tap that ends it doesn't click the row. */
export const LongPress: Story = {
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const row = canvasElement.querySelector('[data-entity*="Morthul"]')!;
    fireEvent.pointerDown(row, { pointerType: "touch", clientX: 120, clientY: 160 });
    const menu = await body.findByRole("menu", { name: "Morthul actions" }, { timeout: 2000 });
    fireEvent.pointerUp(row, { pointerType: "touch" });
    fireEvent.click(row);
    await expect(menu).toBeInTheDocument();
  },
};

/** Alt+click a meter row: the panel's Focus comes first, then Add to compare and the site-wide actions. */
export const MeterRow: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await altClick(canvasElement.querySelector('[data-entity*="Morthul"]')!);
    const menu = await body.findByRole("menu", { name: "Morthul actions" });
    const items = within(menu).getAllByRole("menuitem").map((item) => item.textContent);
    await expect(items).toEqual(["Focus Morthul", "Add to compare", "View armory", "Performance history", "Copy name"]);
    await expect(within(menu).getByRole("menuitem", { name: "View armory" })).toHaveAttribute("href", "/armory/Nordanaar/0x00000000000A0002");
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Focus Morthul" }));
    await expect(await canvas.findByText(/Focused on Morthul/)).toBeInTheDocument();
    await expect(body.queryByRole("menu")).toBeNull();
  },
};

/** Guilds get their own actions; a plain click still follows the link. */
export const GuildName: Story = {
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await altClick(within(canvasElement).getByRole("link", { name: "Once Upon" }), 200, 300);
    const menu = await body.findByRole("menu", { name: "Once Upon actions" });
    const items = within(menu).getAllByRole("menuitem").map((item) => item.textContent);
    await expect(items).toEqual(["Add to compare", "Guild page", "Clear-time history", "Copy name"]);
  },
};

/** One player added on a log page: the tray shows their short summary for this log's fights. */
export const OnePlayer: Story = {
  render: () => <OnLogPage />,
  beforeEach: () => {
    localStorage.removeItem(TAB_KEY);
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await altClick(canvasElement.querySelector('[data-entity*="Morthul"]')!);
    const menu = await body.findByRole("menu", { name: "Morthul actions" });
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Add to compare" }));
    const tray = await body.findByRole("region", { name: "Compare tray" });
    await expect(await within(tray).findByText("This log", {}, { timeout: 5000 })).toBeInTheDocument();
    await expect(within(tray).getByText(/same fights as this page/)).toBeInTheDocument();
  },
};

/** Several players and guilds added: the tray compares the selected kind; the header switches kinds. */
export const ComparePlayers: Story = {
  render: () => <OnLogPage />,
  beforeEach: () => {
    localStorage.removeItem(TAB_KEY);
    localStorage.setItem(PINS_KEY, JSON.stringify([guild, otherGuild, rowEntity(rows[0]), rowEntity(rows[2]), rowEntity(rows[3])]));
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const tray = await body.findByRole("region", { name: "Compare tray" });
    await expect(within(tray).getByRole("button", { name: /3 players/ })).toHaveAttribute("aria-pressed", "true");
    await expect(await within(tray).findByRole("columnheader", { name: "This log" }, { timeout: 5000 })).toBeInTheDocument();
    await expect(within(tray).getByRole("link", { name: /Open performance history/ })).toHaveAttribute(
      "href",
      "/performance-history?player=0x00000000000A0002&player_realm=Nordanaar&player=0x00000000000A0001&player_realm=Nordanaar&player=0x00000000000A0003&player_realm=Nordanaar",
    );
  },
};

/** Shift+click a name in the tray to hide them from the stats; they stay in the tray and in the page link, hidden. */
export const HideWithShift: Story = {
  render: () => <OnLogPage />,
  beforeEach: () => {
    localStorage.removeItem(TAB_KEY);
    localStorage.setItem(PINS_KEY, JSON.stringify([rowEntity(rows[0]), rowEntity(rows[2]), rowEntity(rows[3])]));
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const tray = await body.findByRole("region", { name: "Compare tray" });
    await within(tray).findByRole("columnheader", { name: "This log" }, { timeout: 5000 });
    const names = within(within(tray).getByRole("list", { name: "players in compare" }));
    fireEvent.click(names.getByRole("button", { name: "Velyndra" }), { shiftKey: true });
    await expect(within(tray).getByRole("button", { name: "Velyndra, hidden" })).toHaveAttribute("aria-pressed", "true");
    await expect(within(tray).getAllByRole("row")).toHaveLength(3);
    await expect(within(tray).getByRole("link", { name: /Open performance history/ }).getAttribute("href")).toContain("hidden=0x00000000000A0001");
  },
};

/** The Chart tab, remembered from last time. */
export const CompareChart: Story = {
  render: () => <OnLogPage />,
  beforeEach: () => {
    localStorage.setItem(TAB_KEY, "chart");
    localStorage.setItem(PINS_KEY, JSON.stringify([rowEntity(rows[0]), rowEntity(rows[2]), rowEntity(rows[3])]));
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const tray = await body.findByRole("region", { name: "Compare tray" });
    await expect(within(tray).getByRole("tab", { name: "Chart" })).toHaveAttribute("aria-selected", "true");
    await expect(await within(tray).findByRole("img", {}, { timeout: 5000 })).toBeInTheDocument();
  },
};

/** Hover reads out every line's night; hovering a name shows their typical band; the range is remembered. */
export const ChartHoverAndRange: Story = {
  render: () => <OnLogPage />,
  beforeEach: () => {
    localStorage.setItem(TAB_KEY, "chart");
    localStorage.setItem(PINS_KEY, JSON.stringify([rowEntity(rows[0]), rowEntity(rows[2]), rowEntity(rows[3])]));
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const tray = await body.findByRole("region", { name: "Compare tray" });
    const chart = await within(tray).findByRole("img", {}, { timeout: 5000 });
    const rect = chart.getBoundingClientRect();
    fireEvent.pointerMove(chart, { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 });
    await waitFor(() => expect(tray.querySelector("[data-chart-readout]")).not.toBeNull());
    // One row per player, each with that night's value or a dash.
    await expect(within(tray.querySelector<HTMLElement>("[data-chart-readout]")!).getAllByText(/Morthul|Velyndra|Brakkus/)).toHaveLength(3);
    fireEvent.pointerLeave(chart);
    await userEvent.hover(within(tray.querySelector<HTMLElement>("figcaption")!).getByRole("button", { name: "Velyndra" }));
    await expect(within(tray).getByText("Typical range")).toBeInTheDocument();
    await userEvent.click(within(tray).getByRole("button", { name: "60d" }));
    await expect(within(tray).getByText("60 days ago")).toBeInTheDocument();
    await expect(localStorage.getItem(RANGE_KEY)).toBe("60d");
  },
};

/** Value mode: raw DPS per night instead of parses, switched with Parse / Value and remembered. */
export const CompareChartValue: Story = {
  render: () => <OnLogPage />,
  beforeEach: () => {
    localStorage.setItem(TAB_KEY, "chart");
    localStorage.setItem(PINS_KEY, JSON.stringify([rowEntity(rows[0]), rowEntity(rows[2]), rowEntity(rows[3])]));
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const tray = await body.findByRole("region", { name: "Compare tray" });
    await userEvent.click(within(tray).getByRole("button", { name: "Value" }));
    await expect(await within(tray).findByText("DPS per night, higher is better", {}, { timeout: 5000 })).toBeInTheDocument();
    await expect(localStorage.getItem(DISPLAY_KEY)).toBe("raw");
  },
};

/** A guild away from any log page: its most recent raid's clears. */
export const OneGuild: Story = {
  beforeEach: () => {
    localStorage.removeItem(TAB_KEY);
    localStorage.setItem(PINS_KEY, JSON.stringify([guild]));
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const tray = await body.findByRole("region", { name: "Compare tray" });
    await expect(await within(tray).findByText("Latest", {}, { timeout: 5000 })).toBeInTheDocument();
  },
};

/** Expand turns the tray into the full performance and guild history, with a tab per kind. */
export const ExpandToFull: Story = {
  beforeEach: () => {
    localStorage.setItem(PINS_KEY, JSON.stringify([rowEntity(rows[0]), rowEntity(rows[2]), rowEntity(rows[3]), guild, otherGuild]));
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const tray = await body.findByRole("region", { name: "Compare tray" });
    await userEvent.click(within(tray).getByRole("button", { name: /3 players/ }));
    await userEvent.click(within(tray).getByRole("button", { name: "Expand to full stats" }));
    const panel = await body.findByRole("dialog", { name: "Stats" }, { timeout: 5000 });
    await expect(within(panel).getByRole("tab", { name: /3 players/ })).toHaveAttribute("aria-selected", "true");
    await expect(within(panel).getByRole("tab", { name: /2 guilds/ })).toBeInTheDocument();
  },
};

/** Friendly (free): the tray only opens the history page, with a blurred preview of the stats and an upsell. */
export const FriendlyOnePlayer: Story = {
  parameters: { msw: { handlers: tierHandlers("free") } },
  render: () => <OnLogPage />,
  beforeEach: () => {
    localStorage.setItem(PINS_KEY, JSON.stringify([rowEntity(rows[0])]));
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const tray = await body.findByRole("region", { name: "Compare tray" });
    await waitFor(() => expect(within(tray).getByRole("link", { name: "Become Revered" })).toHaveAttribute("href", "/supporter"));
    await expect(within(tray).queryByRole("button", { name: "Expand to full stats" })).toBeNull();
    await expect(within(tray).getByRole("link", { name: /Open performance history/ })).toBeInTheDocument();
  },
};

/** Friendly (free) comparing several players: real names, blurred made-up numbers. */
export const FriendlyCompare: Story = {
  parameters: { msw: { handlers: tierHandlers("free") } },
  render: () => <OnLogPage />,
  beforeEach: () => {
    localStorage.setItem(PINS_KEY, JSON.stringify([rowEntity(rows[0]), rowEntity(rows[2]), rowEntity(rows[3])]));
  },
};
