import { useParams, useSearchParams } from "react-router-dom";
import { Shield, Calendar, Sparkles, LayoutDashboard } from "lucide-react";
import { useArmoryPlayer } from "@/api/queries";
import { DatasetProvider } from "@/hooks/useDatasetId";
import { CharacterHeader } from "./CharacterHeader";
import { AdminLinkControls } from "./AdminLinkControls";
import { GearDisplay } from "./GearDisplay";
import { TalentsTab } from "./TalentsTab";
import { ActivityTab } from "./ActivityTab";
import { OverviewTab } from "./overview/OverviewTab";

const TABS = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "gear", label: "Gear", icon: Shield },
  { key: "talents", label: "Talents", icon: Sparkles },
  { key: "activity", label: "Activity", icon: Calendar },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/** Tabs that need a wide center column. */
const WIDE_TABS: ReadonlySet<TabKey> = new Set(["overview", "talents"]);

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
    <div className={`w-full py-8 px-4 grid gap-x-4 ${WIDE_TABS.has(activeTab) ? "grid-cols-[1fr_minmax(0,72rem)_1fr]" : "grid-cols-[1fr_minmax(0,48rem)_1fr]"}`}>
      {/* Left placeholder column */}
      <div />

      {/* Center column */}
      <div>
        {/* The overview tab renders its own design-style identity header. */}
        {activeTab !== "overview" && <CharacterHeader player={player} />}
        <AdminLinkControls player={player} />

        {/* Tab navigation */}
        <div className="mt-6 flex gap-1 border-b border-border">
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

        {/* Tab content — overview, gear, and talents stay in center column */}
        {activeTab === "overview" && (
          <div className="mt-8">
            <OverviewTab player={player} onOpenTab={openTab} />
          </div>
        )}
        {activeTab === "gear" && (
          <div className="mt-6">
            <GearDisplay gear={player.gear} race={player.race} gender={player.gender} />
          </div>
        )}
        {activeTab === "talents" && (
          <div className="mt-6">
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
