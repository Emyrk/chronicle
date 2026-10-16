import { guildsProcessor, type GuildsResult, type GuildEntry } from "./guilds.processor";
import type { PanelDefinition, PanelRenderProps } from "../types";
import { GenericPanel } from "../GenericPanel";
import { Users, ChevronRight } from "lucide-react";
import { getClassColorVar } from "@/pages/ArmoryPage/types";
import { useState } from "react";

export function createGuildsPanel(): PanelDefinition<GuildsResult, any> {
  return {
    ...guildsProcessor,
    label: "Guilds",
    icon: <Users className="h-4 w-4" />,
    keybinds: [],
    render: (props: PanelRenderProps<GuildsResult>) => (
      <GuildsContent {...props} />
    ),
  };
}

function GuildsContent(props: PanelRenderProps<GuildsResult>) {
  const { result } = props;
  if (!result) return null;

  // Sort: named guilds by player count desc, "No Guild" always last
  const entries = Array.from(result.guilds.entries());
  entries.sort((a, b) => {
    if (a[0] === "" && b[0] !== "") return 1;
    if (a[0] !== "" && b[0] === "") return -1;
    return b[1].players.size - a[1].players.size;
  });

  if (entries.length === 0) {
    return <div className="text-sm text-muted-foreground p-4">No guild data available.</div>;
  }

  return (
    <GenericPanel {...props}>
      <div className="flex flex-col gap-1 p-2 overflow-y-auto styled-scrollbar">
        {entries.map(([key, guild]) => (
          <GuildRow key={key} guild={guild} />
        ))}
      </div>
    </GenericPanel>
  );
}

function GuildRow({ guild }: { guild: GuildEntry }) {
  const [open, setOpen] = useState(false);
  const players = Array.from(guild.players.values());
  // Sort players alphabetically by name
  players.sort((a, b) => a.name.localeCompare(b.name));

  const displayName = guild.name ?? "No Guild";

  return (
    <div className="rounded-md border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium hover:bg-accent/50 transition-colors rounded-md"
      >
        <ChevronRight
          className={`h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform duration-150 ${open ? "rotate-90" : ""}`}
        />
        <span className={guild.name ? "text-foreground" : "text-muted-foreground italic"}>
          {displayName}
        </span>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {players.length} {players.length === 1 ? "player" : "players"}
        </span>
      </button>
      {open && (
        <div className="border-t border-border px-3 py-1.5">
          {players.map((p) => (
            <div key={p.guid} className="flex items-center gap-2 py-0.5 text-sm">
              <span
                className="font-medium"
                style={{ color: getClassColorVar(p.heroClass) }}
              >
                {p.name}
              </span>
              <span className="text-xs text-muted-foreground">{p.heroClass}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
