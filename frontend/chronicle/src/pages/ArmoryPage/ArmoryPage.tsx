import { useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Shield, Calendar } from "lucide-react";
import type { ArmoryPlayer } from "@/api/typesGenerated";
import { CharacterHeader } from "./CharacterHeader";
import { GearDisplay } from "./GearDisplay";
import { ActivityTab } from "./ActivityTab";

async function fetchArmoryPlayer(realm: string, player: string): Promise<ArmoryPlayer> {
  const response = await fetch(`/api/v1/armory/${encodeURIComponent(realm)}/${encodeURIComponent(player)}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch player: ${response.status}`);
  }
  return response.json();
}

const TABS = [
  { key: "gear", label: "Gear", icon: Shield },
  { key: "activity", label: "Activity", icon: Calendar },
] as const;

type TabKey = (typeof TABS)[number]["key"];

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
  const activeTab = (searchParams.get("tab") as TabKey) || "gear";

  const { data: player, isLoading, error } = useQuery({
    queryKey: ["armory", realmName, playerIdentifier],
    queryFn: () => fetchArmoryPlayer(realmName!, playerIdentifier!),
    enabled: !!realmName && !!playerIdentifier,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

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
    <div className="mx-auto max-w-3xl py-8 px-4">
      <CharacterHeader player={player} />

      {/* Tab navigation */}
      <div className="mt-6 flex gap-1 border-b border-border">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              if (key === "gear") {
                next.delete("tab");
              } else {
                next.set("tab", key);
              }
              setSearchParams(next, { replace: true });
            }}
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

      {/* Tab content */}
      <div className="mt-6">
        {activeTab === "gear" && <GearDisplay gear={player.gear} />}
        {activeTab === "activity" && <ActivityTab player={player} />}
      </div>
    </div>
  );
}
