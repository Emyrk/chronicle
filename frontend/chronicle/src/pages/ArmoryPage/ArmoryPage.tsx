import { Link, useParams, useSearchParams } from "react-router-dom";
import { Shield, Calendar, Sparkles, LayoutDashboard, Hammer } from "lucide-react";
import type { ArmoryPlayer } from "@/api/typesGenerated";
import { useArmoryPlayer } from "@/api/queries";
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
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get("tab") as TabKey) || "overview";

  const { data: player, isLoading, error } = useArmoryPlayer(realmName, playerIdentifier);

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

        {/* Identity header — the overview renders its own (with the mode
            selector and score/journey card); other tabs get a per-tab
            stats card so the layout stays identical across tabs. */}
        {activeTab !== "overview" && (
          <div className="mt-8">
            <IdentityHeader player={player}>
              <div className="lg:w-[480px]">
                {activeTab === "gear" && <GearHeaderCard player={player} />}
                {activeTab === "talents" && <TalentsHeaderCard player={player} />}
                {activeTab === "activity" && <ActivityHeaderCard player={player} />}
              </div>
            </IdentityHeader>
          </div>
        )}

        {/* Tab content — overview, gear, and talents stay in center column */}
        {activeTab === "overview" && (
          <div className="mt-8">
            <OverviewTab player={player} onOpenTab={openTab} />
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
    </DatasetProvider>
  );
}
