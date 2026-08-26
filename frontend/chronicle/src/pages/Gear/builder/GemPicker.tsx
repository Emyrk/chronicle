import { useQueries } from "@tanstack/react-query";
import { LoaderCircle, X } from "lucide-react";
import { useMemo, useState } from "react";
import { fetchGemTooltip, useSearchItems } from "@/api/gamedata";
import type { ItemSearchResult, ItemSocket } from "@/api/typesGenerated";
import { Button } from "@/components/ui/button";
import { ItemIcon } from "@/components/ui/ItemIcon/ItemIcon";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { cn } from "@/lib/utils";
import { getQualityTextClass } from "@/pages/ArmoryPage/types";

const ITEM_CLASS_GEM = "3";
const META_SOCKET = 1;
const GEM_SOCKET_COLORS: Readonly<Record<number, number>> = {
  0: 2,
  1: 8,
  2: 4,
  3: 2 | 8,
  4: 4 | 8,
  5: 2 | 4,
  6: META_SOCKET,
  8: 2 | 4 | 8,
};

const SOCKET_LABELS: Readonly<Record<number, string>> = {
  1: "Meta",
  2: "Red",
  4: "Yellow",
  8: "Blue",
};

interface GemPickerProps {
  sockets: readonly ItemSocket[];
  gemEnchantIds?: readonly number[];
  onSetGem: (socketIndex: number, gemEnchantId: number | undefined) => void;
}

export function GemPicker({ sockets, gemEnchantIds = [], onSetGem }: GemPickerProps) {
  const [socketIndex, setSocketIndex] = useState(0);
  const [query, setQuery] = useState("");
  const rawQuery = query.trim();
  const debouncedQuery = useDebouncedValue(rawQuery, 175);
  const searchQuery = rawQuery.length < 2 ? rawQuery : debouncedQuery;
  const search = useSearchItems(
    searchQuery.length === 0 || searchQuery.length >= 2
      ? {
          q: searchQuery,
          class: ITEM_CLASS_GEM,
          sort: "item_level_desc",
          allowEmpty: true,
        }
      : null,
  );
  const selectedQueries = useQueries({
    queries: sockets.map((_, index) => {
      const enchantId = gemEnchantIds[index] ?? 0;
      return {
        queryKey: ["gem-tooltip", enchantId],
        queryFn: () => fetchGemTooltip(enchantId),
        enabled: enchantId > 0,
        staleTime: 5 * 60 * 1000,
        retry: false,
      };
    }),
  });
  const socket = sockets[Math.min(socketIndex, sockets.length - 1)];
  const results = useMemo(() => {
    const candidates = (search.data ?? []).filter((item) => (item.gem_enchant_id ?? 0) > 0);
    return [...candidates].sort((a, b) =>
      Number(gemMatchesSocket(b, socket)) - Number(gemMatchesSocket(a, socket)),
    );
  }, [search.data, socket]);

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-3">
        {sockets.map((candidate, index) => {
          const gem = selectedQueries[index]?.data;
          const selected = socketIndex === index;
          return (
            <button
              key={index}
              type="button"
              onClick={() => setSocketIndex(index)}
              className={cn(
                "min-w-0 rounded border px-2 py-2 text-left transition-colors",
                selected
                  ? "border-blue-500 bg-blue-500/10"
                  : "border-zinc-800 bg-zinc-950/40 hover:border-zinc-700",
              )}
            >
              <div className="text-3xs uppercase tracking-wide text-zinc-500">
                {SOCKET_LABELS[candidate.color] ?? "Gem"} socket {index + 1}
              </div>
              <div className="mt-1 truncate text-xs text-zinc-300">
                {gem?.enchantment ?? gem?.name ?? "Empty"}
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search gems by name…"
            className="pr-8"
          />
          {search.isFetching && (
            <LoaderCircle className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-zinc-500" />
          )}
        </div>
        {(gemEnchantIds[socketIndex] ?? 0) > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9 px-2 text-xs text-zinc-500 hover:text-red-400"
            onClick={() => onSetGem(socketIndex, undefined)}
          >
            <X className="mr-1 h-3.5 w-3.5" />
            Clear
          </Button>
        )}
      </div>

      <div className="styled-scrollbar max-h-80 overflow-y-auto rounded border border-zinc-800 divide-y divide-zinc-800/70">
        {searchQuery.length === 1 ? (
          <p className="p-4 text-xs text-zinc-500">Type at least two characters to search gems.</p>
        ) : search.isLoading ? (
          <p className="p-4 text-xs text-zinc-500">Searching…</p>
        ) : results.length === 0 ? (
          <p className="p-4 text-xs text-zinc-500">No matching gems found.</p>
        ) : (
          results.map((gem) => {
            const matches = gemMatchesSocket(gem, socket);
            const equipped = gem.gem_enchant_id === gemEnchantIds[socketIndex];
            return (
              <div key={gem.entry} className="flex items-center gap-2.5 px-2.5 py-1.5 hover:bg-zinc-800/40">
                <ItemIcon icon={gem.icon} quality={gem.quality} size={30} />
                <div className="min-w-0 flex-1">
                  <div className={cn("truncate text-sm", getQualityTextClass(gem.quality))}>
                    {gem.name}
                  </div>
                  <div className={cn("text-2xs", matches ? "text-emerald-400" : "text-zinc-600")}>
                    {matches ? "Matches socket" : "Does not match socket color"}
                  </div>
                </div>
                <Button
                  variant={equipped ? "ghost" : "outline"}
                  size="sm"
                  className="h-7 px-2.5 text-xs"
                  disabled={equipped}
                  onClick={() => onSetGem(socketIndex, gem.gem_enchant_id)}
                >
                  {equipped ? "Socketed" : "Socket"}
                </Button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function gemMatchesSocket(gem: ItemSearchResult, socket: ItemSocket | undefined): boolean {
  if (!socket) return false;
  const gemColor = GEM_SOCKET_COLORS[gem.subclass] ?? 0;
  return (gemColor & socket.color) !== 0;
}
