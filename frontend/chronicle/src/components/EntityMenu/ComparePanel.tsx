import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, X } from "lucide-react";
import { useArmoryPlayers } from "@/api/queries";
import { AdSuppressionProvider } from "@/components/Ads/AdSuppressionProvider";
import { DatasetProvider } from "@/hooks/useDatasetId";
import { cn } from "@/lib/utils";
import {
  DEFAULT_PERFORMANCE_COMPARISON_STATE,
  type PerformanceComparisonState,
} from "@/pages/ArmoryPage/overview/performanceComparisonState";
import { PerformanceExplorer } from "@/pages/ArmoryPage/overview/PerformanceExplorer";
import { GuildHistoryExplorer } from "@/pages/GuildHistory/GuildHistoryExplorer";
import { DEFAULT_GUILD_HISTORY_STATE, type GuildHistoryState } from "@/pages/GuildHistory/guildHistoryState";
import { entityKey, guildCompareUrl, performanceCompareUrl, type EntityKind, type EntityRef } from "./entity";
import { KIND_LABEL, kindColor } from "./entityCompare";

type Character = Extract<EntityRef, { kind: "character" }>;
type Guild = Extract<EntityRef, { kind: "guild" }>;

/**
 * The performance and guild history pages, opened over the current page so supporters can
 * see stats without leaving it. Each kind gets a tab; options reset when its entities change.
 */
export default function ComparePanel({
  entities,
  hidden = new Set(),
  initialKind,
  onClose,
}: {
  entities: EntityRef[];
  /** Entity keys that open hidden, as Shift+click hides them on the pages. */
  hidden?: ReadonlySet<string>;
  initialKind: EntityKind;
  onClose: () => void;
}) {
  const characters = entities.filter((entity): entity is Character => entity.kind === "character");
  const guilds = entities.filter((entity): entity is Guild => entity.kind === "guild");
  const kinds = (["character", "guild"] as const).filter((kind) => (kind === "character" ? characters : guilds).length > 0);
  const [selected, setSelected] = useState<EntityKind>(initialKind);
  const kind = (kinds as readonly EntityKind[]).includes(selected) ? selected : kinds[0];

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (!kind) onClose();
  }, [kind, onClose]);
  if (!kind) return null;

  const fullPage = kind === "character" ? performanceCompareUrl(characters, hidden) : guildCompareUrl(guilds, hidden);

  return (
    <div className="fixed inset-0 z-[60]">
      <button type="button" aria-label="Close stats" className="absolute inset-0 bg-black/50" onClick={onClose} />
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Stats"
        className="absolute inset-y-0 right-0 flex w-full flex-col border-l bg-background shadow-2xl sm:w-[min(1180px,94vw)]"
      >
        <header className="flex items-center gap-1 border-b px-3 py-2">
          <div role="tablist" aria-label="What to compare" className="flex items-center gap-1">
            {kinds.map((option) => {
              const count = (option === "character" ? characters : guilds).length;
              return (
                <button
                  key={option}
                  type="button"
                  role="tab"
                  aria-selected={option === kind}
                  onClick={() => setSelected(option)}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    option === kind ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: kindColor(option) }} aria-hidden="true" />
                  {count === 1 ? (option === "character" ? characters : guilds)[0].name : `${count} ${KIND_LABEL[option].many}`}
                </button>
              );
            })}
          </div>
          <Link
            to={fullPage}
            target="_blank"
            className="ml-auto flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Open full page
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Close stats"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-2 styled-scrollbar sm:p-4">
          <AdSuppressionProvider suppressed>
            {kind === "character" ? (
              <PlayerStats key={characters.map(entityKey).join()} characters={characters} hidden={hidden} />
            ) : (
              <GuildStats key={guilds.map(entityKey).join()} guilds={guilds} hidden={hidden} />
            )}
          </AdSuppressionProvider>
        </div>
      </section>
    </div>
  );
}

function PlayerStats({ characters, hidden }: { characters: Character[]; hidden: ReadonlySet<string> }) {
  const [state, setState] = useState<PerformanceComparisonState>(() => ({
    ...DEFAULT_PERFORMANCE_COMPARISON_STATE,
    realmName: characters[0].realm,
    players: characters.map((character) => ({
      id: character.guid,
      realmName: character.realm,
      spec: null,
      subSpec: null,
      hidden: hidden.has(entityKey(character)),
    })),
  }));
  const queries = useArmoryPlayers(state.players);
  const players = queries.flatMap((query) => (query.data ? [query.data] : []));

  if (players.length === 0) {
    return (
      <div className="flex min-h-[300px] items-center justify-center text-sm text-muted-foreground">
        {queries.some((query) => query.isLoading) ? "Loading characters…" : "These characters could not be loaded."}
      </div>
    );
  }
  return (
    <DatasetProvider datasetId={players[0].dataset_id} iconBaseUrl={players[0].icon_base_url}>
      <PerformanceExplorer players={players} state={state} onStateChange={setState} />
    </DatasetProvider>
  );
}

function GuildStats({ guilds, hidden }: { guilds: Guild[]; hidden: ReadonlySet<string> }) {
  const [state, setState] = useState<GuildHistoryState>(() => ({
    ...DEFAULT_GUILD_HISTORY_STATE,
    guildIds: guilds.map((guild) => guild.id),
    hiddenGuildIds: guilds.filter((guild) => hidden.has(entityKey(guild))).map((guild) => guild.id),
  }));
  return <GuildHistoryExplorer state={state} onStateChange={setState} />;
}
