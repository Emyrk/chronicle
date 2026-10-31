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
import { entityAttributes, type EntityRef } from "./entity";
import { http, HttpResponse } from "msw";
import { LayoutDashboard } from "lucide-react";
import { performanceHandlers, PLAYERS, REALM } from "@/pages/ArmoryPage/AnalysisPage.mocks";
import { GUILDS, guildHistoryHandlers, whoami } from "@/pages/GuildHistory/GuildHistoryPage.mocks";

// The server's spread of kills and this log's kill-time parses, for encounters in the tray.
const LOG_ID = "log-naxx";
const spread = (encounter_name: string, min_ms: number, median_ms: number, max_ms: number, sample_size: number) => ({
  kind: "boss_kill", encounter_name, difficulty_name: "Normal", max_players: 40, sample_size, status: "ok", min_ms, median_ms, max_ms, cutoffs: [],
});
const spreadsHandler = http.get("/api/v1/rankings/time-parse-cohorts/spreads", () =>
  HttpResponse.json({
    cutoff: "",
    lookback_days: 60,
    instance_name: "Naxxramas",
    spreads: [spread("Patchwerk", 118_000, 161_000, 290_000, 212), spread("Grobbulus", 96_000, 132_000, 240_000, 198)],
  }),
);
const bossParse = (encounter_id: string, encounter_name: string, duration_ms: number, rank: number, sample_size: number, score: number) => ({
  encounter_id, encounter_name, duration_ms, precise_score: score, display_score: Math.round(score), rank, sample_size, status: "ok",
});
const scopeResult = (patchwerk: ReturnType<typeof bossParse>, grobbulus: ReturnType<typeof bossParse>) => ({
  available: true,
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
      server: scopeResult(bossParse("enc-patchwerk", "Patchwerk", 142_000, 24, 212, 89.4), bossParse("enc-grobbulus", "Grobbulus", 151_000, 140, 198, 31.2)),
      realm: scopeResult(bossParse("enc-patchwerk", "Patchwerk", 142_000, 9, 61, 86.2), bossParse("enc-grobbulus", "Grobbulus", 151_000, 40, 55, 27.5)),
      guild: scopeResult(bossParse("enc-patchwerk", "Patchwerk", 142_000, 2, 11, 91.0), bossParse("enc-grobbulus", "Grobbulus", 151_000, 9, 10, 15.0)),
    },
  }),
);

const tierHandlers = (tier: Parameters<typeof whoami>[0]) => [whoami(tier), spreadsHandler, timeParsesHandler, ...performanceHandlers, ...guildHistoryHandlers];

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
 * Encounters are a third kind. Add one to compare and the tray shows its kill time against the
 * server's spread and its parse against the server, realm and guild, free for everyone.
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
    await expect(await within(tray).findByText("Median 2:41", {}, { timeout: 5000 })).toBeInTheDocument();
    await expect(within(tray).getByText("Rank 24 of 212 kills")).toBeInTheDocument();
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

/** Several encounters: a table of times and parses, and the Spread tab with each pull on its boss's server kills. */
export const CompareEncounters: Story = {
  parameters: { msw: { handlers: tierHandlers("free") } },
  beforeEach: () => {
    localStorage.removeItem(TAB_KEY);
    localStorage.setItem(PINS_KEY, JSON.stringify([patchwerkEntity, grobbulusEntity]));
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const tray = await body.findByRole("region", { name: "Compare tray" });
    await expect(await within(tray).findByRole("columnheader", { name: "Realm" }, { timeout: 5000 })).toBeInTheDocument();
    await userEvent.click(within(tray).getByRole("tab", { name: "Spread" }));
    await expect(await within(tray).findByText("Median 2:12")).toBeInTheDocument();
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
