import { useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2, Search, Users } from "lucide-react";
import { useGuildSearch } from "@/api/queries";
import type { GuildInfo } from "@/api/typesGenerated";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

/**
 * Compact guild picker chip with a searchable dropdown, backed by the same
 * guild search endpoint as the armory guild search.
 */
export function GuildSelector({
  guild,
  onSelect,
}: {
  guild: GuildInfo | null;
  onSelect: (guild: GuildInfo) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 border border-border rounded-md text-xs hover:bg-muted/40 transition-colors whitespace-nowrap"
        title="Choose a guild to plan for"
      >
        <Users className="h-3.5 w-3.5 text-muted-foreground" />
        <span className={guild ? "text-foreground" : "text-muted-foreground"}>
          {guild ? guild.name : "Select guild"}
        </span>
        <ChevronDown className="h-3 w-3 text-primary" />
      </button>
      {open && (
        <GuildSearchPanel
          onSelect={(g) => {
            onSelect(g);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

/** Mounted only while open so the search query doesn't fire until needed. */
function GuildSearchPanel({ onSelect }: { onSelect: (guild: GuildInfo) => void }) {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const { data, isLoading, isFetching } = useGuildSearch({ search: debouncedSearch });

  const guilds = data?.guilds ?? [];

  return (
    <div className="absolute top-full left-0 mt-1 z-30 w-72 border border-border rounded-lg bg-popover shadow-lg overflow-hidden">
      <div className="relative p-2 border-b border-border">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search guilds…"
          autoFocus
          className="w-full pl-7 pr-2 py-1.5 bg-card border border-border rounded-md text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      <div className="styled-scrollbar max-h-64 overflow-y-auto p-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-6 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : guilds.length > 0 ? (
          guilds.map((g) => (
            <button
              key={g.id}
              onClick={() => onSelect(g)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left hover:bg-muted/40 transition-colors"
            >
              {g.logo_url ? (
                <img src={g.logo_url} alt="" className="h-5 w-5 rounded-full object-cover shrink-0" />
              ) : (
                <Users className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              <span className="text-xs text-foreground truncate">{g.name}</span>
              <span className="ml-auto text-[10px] text-muted-foreground whitespace-nowrap">
                {g.realm_name} · {g.player_count}
              </span>
            </button>
          ))
        ) : (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            {debouncedSearch ? `No guilds matching "${debouncedSearch}".` : "No guilds found."}
          </p>
        )}
        {isFetching && !isLoading && (
          <div className="flex justify-center py-1">
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
    </div>
  );
}
