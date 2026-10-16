import { useEffect, useState } from "react";
import { CalendarDays, Loader2, Users, X } from "lucide-react";
import { useGuildCharacters } from "@/api/queries";
import type {
  InstanceRaidGroupResponse,
  RecentInstance,
  RecentInstancesResponse,
  WoWAttendanceInstance,
} from "@/api/typesGenerated";
import { GuildSelector } from "./GuildSelector";
import { buildRaidImport, type RaidImportResult } from "./raidImport";
import type { PlannerGuild } from "./types";

interface RaidImportModalProps {
  open: boolean;
  onClose: () => void;
  guild: PlannerGuild | null;
  hasComposition: boolean;
  onApply: (result: RaidImportResult, raid: RecentInstance, guild: PlannerGuild) => void;
}

function raidDate(raid: RecentInstance): string {
  return new Date(raid.first_encounter_time).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function RaidImportModal({
  open,
  onClose,
  guild,
  hasComposition,
  onApply,
}: RaidImportModalProps) {
  const [selectedGuild, setSelectedGuild] = useState<PlannerGuild | null>(guild);
  const [raids, setRaids] = useState<readonly RecentInstance[]>([]);
  const [loading, setLoading] = useState(false);
  const [importingID, setImportingID] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: rosterData, isLoading: rosterLoading } = useGuildCharacters(selectedGuild?.id);

  useEffect(() => {
    if (!open || !selectedGuild) return;
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ days: "30", limit: "50" });
        params.set("guild_id", selectedGuild.id);
        const response = await fetch(`/api/v1/raidlogs/recent?${params}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Failed to load recent raids");
        const data = (await response.json()) as RecentInstancesResponse;
        setRaids(data.instances);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load recent raids");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [open, selectedGuild]);

  if (!open) return null;

  const importRaid = async (raid: RecentInstance) => {
    setImportingID(raid.id);
    setError(null);
    try {
      const [instanceResponse, raidGroupResponse] = await Promise.all([
        fetch(`/api/v1/raidlogs/instances/${encodeURIComponent(raid.id)}?attendance_only=true`),
        fetch(`/api/v1/raidlogs/instances/${encodeURIComponent(raid.id)}/raid-group`),
      ]);
      if (!instanceResponse.ok) throw new Error("Failed to load that raid");
      const instance = (await instanceResponse.json()) as WoWAttendanceInstance;
      const raidGroup = raidGroupResponse.ok
        ? ((await raidGroupResponse.json()) as InstanceRaidGroupResponse)
        : null;
      if (!selectedGuild) throw new Error("Choose a guild before importing a raid");
      onApply(buildRaidImport(instance, raidGroup, rosterData?.members ?? []), raid, selectedGuild);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import that raid");
    } finally {
      setImportingID(null);
    }
  };

  return (
    <div
      onClick={onClose}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="w-[520px] max-w-[calc(100vw-2rem)] rounded-[10px] border border-border bg-popover p-4 shadow-xl"
      >
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-foreground">Import from a raid</p>
            <p className="mt-px text-[10px] text-muted-foreground">
              Choose a guild, then import one of its combat logs from the last 30 days.
            </p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 p-0.5 text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">Guild</span>
          <GuildSelector guild={selectedGuild} onSelect={setSelectedGuild} />
        </div>

        {hasComposition && (
          <p className="mt-3 rounded-md border border-amber-500/20 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-200">
            Importing replaces the current board and bench. You can undo the import afterward.
          </p>
        )}

        <div className="styled-scrollbar mt-3 max-h-80 space-y-1 overflow-y-auto">
          {(loading || rosterLoading) && (
            <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading guild raids…
            </div>
          )}
          {!selectedGuild && (
            <p className="py-10 text-center text-xs text-muted-foreground">
              Search for a guild to see its recent raids.
            </p>
          )}
          {selectedGuild && !loading && !rosterLoading && raids.length === 0 && !error && (
            <p className="py-10 text-center text-xs text-muted-foreground">
              No recent raids found for {selectedGuild.name}.
            </p>
          )}
          {selectedGuild && !loading && !rosterLoading && raids.map((raid) => (
            <button
              key={raid.id}
              onClick={() => void importRaid(raid)}
              disabled={importingID !== null}
              className="flex w-full items-center gap-3 rounded-md border border-border/50 bg-card px-3 py-2 text-left transition-colors hover:bg-muted/40 disabled:opacity-60"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted/60 text-muted-foreground">
                {importingID === raid.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CalendarDays className="h-4 w-4" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-foreground">{raid.name}</span>
                <span className="block truncate text-[10px] text-muted-foreground">
                  {raid.guild_name ? `<${raid.guild_name}> · ` : ""}
                  {raidDate(raid)}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
                <Users className="h-3 w-3" />
                {raid.player_count}
              </span>
            </button>
          ))}
        </div>

        {error && <p className="mt-2 text-[11px] text-destructive">{error}</p>}
      </div>
    </div>
  );
}
