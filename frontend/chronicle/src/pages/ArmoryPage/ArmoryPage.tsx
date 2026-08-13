import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Shield, Calendar, Sparkles, LayoutDashboard, Hammer } from "lucide-react";
import type { ArmoryPlayer } from "@/api/typesGenerated";
import { useArmoryLoot, useArmoryPlayer } from "@/api/queries";
import { useCharacterParses } from "@/api/rankingsQueries";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/Card/Card";
import { DatasetProvider } from "@/hooks/useDatasetId";
import { AdminLinkControls } from "./AdminLinkControls";
import { GearDisplay } from "./GearDisplay";
import { TalentsTab } from "./TalentsTab";
import { ActivityTab } from "./ActivityTab";
import { OverviewTab } from "./overview/OverviewTab";
import { IdentityHeader } from "./overview/IdentityHeader";
import { ActivityHeaderCard, GearHeaderCard, TalentsHeaderCard } from "./TabHeaderCards";
import { JourneyStatsCard } from "./overview/JourneyStatsCard";
import { ScoreCard } from "./overview/ScoreCard";
import { defaultMetric, type ParseMetric } from "./overview/util";
import { useRecentActivity } from "./overview/useRecentActivity";
import { summarizeRaids, topEncounters } from "./parseAggregation";

type OverviewMode = "journey" | "performance";

const MODES: Array<[OverviewMode, string]> = [
  ["journey", "Journey"],
  ["performance", "Performance"],
];

const TABS = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "gear", label: "Gear", icon: Shield },
  { key: "talents", label: "Talents", icon: Sparkles },
  { key: "activity", label: "Activity", icon: Calendar },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/**
 * Link into the talent calculator with this character's build preloaded.
 * The build param is per-tab rank digits (trailing zeros trimmed) joined
 * by "-", matching encodeTalentBuild.
 */
function talentBuilderUrl(player: ArmoryPlayer): string | null {
  const trees = player.talents?.trees;
  if (!trees) return null;
  const sections = trees.map((t) => t.ranks.replace(/0+$/, ""));
  while (sections.length > 0 && sections[sections.length - 1] === "") sections.pop();
  const build = sections.join("-");
  const slug = player.class.toLowerCase().replace(/[^a-z]/g, "");
  return `/talents/${slug}${build ? `?build=${build}` : ""}`;
}

/**
 * WoW-style character armory page.
 *
 * Route: /armory/:realmName/:playerIdentifier
 * The playerIdentifier can be either a player name or a GUID.
 */
export function ArmoryPage() {
  const { realmName, playerIdentifier } = useParams<{
    realmName: string;
    playerIdentifier: string;
  }>();
  const { data: player, isLoading, error } = useArmoryPlayer(realmName, playerIdentifier);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-zinc-500">Loading character…</div>
      </div>
    );
  }

  if (error || !player) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-zinc-500">
          Character not found: {realmName}/{playerIdentifier}
        </div>
      </div>
    );
  }

  return (
    <DatasetProvider datasetId={player.dataset_id} iconBaseUrl={player.icon_base_url}>
      <ArmoryPageContent player={player} />
    </DatasetProvider>
  );
}

function ArmoryPageContent({ player }: { player: ArmoryPlayer }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get("tab") as TabKey) || "overview";
  const mode: OverviewMode =
    searchParams.get("mode") === "performance" ? "performance" : "journey";
  const [metric, setMetric] = useState<ParseMetric>(() => defaultMetric(player));

  const isOverview = activeTab === "overview";
  const activity = useRecentActivity(player, isOverview);
  const lootQuery = useArmoryLoot(player.realm_name, player.id, isOverview && mode === "journey");
  const parsesQuery = useCharacterParses(
    isOverview && mode === "performance" ? player.id : undefined,
    metric,
  );
  const top3 = useMemo(
    () => topEncounters(summarizeRaids(parsesQuery.data?.parses ?? []), 3),
    [parsesQuery.data],
  );

  const setMode = (nextMode: OverviewMode) => {
    const next = new URLSearchParams(searchParams);
    if (nextMode === "journey") {
      next.delete("mode");
    } else {
      next.set("mode", nextMode);
    }
    setSearchParams(next, { replace: true });
  };

  const openTab = (key: TabKey) => {
    const next = new URLSearchParams(searchParams);
    if (key === "overview") {
      next.delete("tab");
    } else {
      next.set("tab", key);
    }
    // Push a history entry so the browser back button returns to the
    // previous tab (e.g. gear → back → overview).
    setSearchParams(next);
  };

  const modeSelector = activeTab === "overview" ? (
    <div className="flex items-center gap-2">
      {MODES.map(([key, label]) => (
        <Button
          key={key}
          variant={mode === key ? "secondary" : "outline"}
          size="sm"
          onClick={() => setMode(key)}
        >
          {label}
        </Button>
      ))}
    </div>
  ) : undefined;

  return (
    <div className="w-full py-8 px-4 grid gap-x-4 grid-cols-[1fr_minmax(0,72rem)_1fr]">
      {/* Left placeholder column */}
      <div />

      {/* Center column */}
      <div>
        <AdminLinkControls player={player} />

        {/* Tab navigation */}
        <div className="flex gap-1 border-b border-border">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => openTab(key)}
              className={`
                flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors
                border-b-2 -mb-px
                ${activeTab === key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                }
              `}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Keep one identity header mounted while its tab-specific controls change. */}
        <div className="mt-8">
          <IdentityHeader player={player} actions={modeSelector}>
            <div className="lg:w-[480px]">
              {activeTab === "overview" && mode === "performance" && (
                <ScoreCard
                  score={parsesQuery.data?.score}
                  top3={top3}
                  metric={metric}
                  onMetricChange={setMetric}
                  isLoading={parsesQuery.isLoading}
                />
              )}
              {activeTab === "overview" && mode === "journey" && (
                <JourneyStatsCard
                  timeInRaid={formatHours(activity.stats.combatMs)}
                  itemsLooted={
                    lootQuery.data
                      ? lootQuery.data.items.length >= 200
                        ? "200+"
                        : String(lootQuery.data.items.length)
                      : null
                  }
                />
              )}
              {activeTab === "gear" && <GearHeaderCard player={player} />}
              {activeTab === "talents" && <TalentsHeaderCard player={player} />}
              {activeTab === "activity" && <ActivityHeaderCard player={player} />}
            </div>
          </IdentityHeader>
        </div>

        {/* Tab content: overview, gear, and talents stay in center column. */}
        {activeTab === "overview" && (
          <div className="mt-6">
            <OverviewTab player={player} onOpenTab={openTab} metric={metric} />
          </div>
        )}
        {activeTab === "gear" && (
          <Card className="mt-4 py-8">
            <CardContent>
              <GearDisplay gear={player.gear} race={player.race} gender={player.gender} />
            </CardContent>
          </Card>
        )}
        {activeTab === "talents" && (
          <div className="mt-4">
            {talentBuilderUrl(player) && (
              <div className="mb-3 flex justify-end">
                <Button variant="outline" size="sm" asChild>
                  <Link to={talentBuilderUrl(player)!}>
                    <Hammer className="h-4 w-4" />
                    Open in Talent Builder
                  </Link>
                </Button>
              </div>
            )}
            <TalentsTab player={player} />
          </div>
        )}
      </div>

      {/* Right placeholder column */}
      <div />

      {/* Activity tab spans full width (all 3 columns) */}
      {activeTab === "activity" && (
        <div className="col-span-3 mt-6">
          <ActivityTab player={player} />
        </div>
      )}
    </div>
  );
}

function formatHours(ms: number): string {
  const totalMinutes = Math.round(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
}
