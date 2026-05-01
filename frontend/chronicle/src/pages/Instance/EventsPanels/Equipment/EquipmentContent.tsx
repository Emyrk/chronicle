import { useMemo, useState, useRef, useEffect } from "react";
import { iconUrl } from "@/config/iconUrl";
import type { PanelRenderProps } from "../types";
import type { EquipmentResult, PlayerSnapshot } from "./equipment.processor";
import { useCachedValue } from "@/hooks/useCachedValue";
import { GenericPanel } from "../GenericPanel";
import { useItemTooltip } from "@/api/gamedata";
import { cn } from "@/lib/utils";
import { getQualityBorderClass, getQualityTextClass, getClassColorVar } from "@/pages/ArmoryPage/types";
import { formatRaceLabel } from "@/pages/ArmoryPage/CharacterHeader";
import { HelpCircle, ExternalLink } from "lucide-react";
import { ItemTooltip } from "@/components/ui/ItemTooltip/ItemTooltip";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/Tooltip/tooltip";
import { Link } from "react-router-dom";
import { TalentTreeViewer, type TalentAllocation } from "@/components/ui/TalentTreeViewer/TalentTreeViewer";

const SLOT_ORDER = [
  { index: 0, label: "Head" },
  { index: 1, label: "Neck" },
  { index: 2, label: "Shoulder" },
  { index: 14, label: "Back" },
  { index: 4, label: "Chest" },
  { index: 3, label: "Shirt" },
  { index: 18, label: "Tabard" },
  { index: 8, label: "Wrist" },
  { index: 9, label: "Hands" },
  { index: 5, label: "Waist" },
  { index: 6, label: "Legs" },
  { index: 7, label: "Feet" },
  { index: 10, label: "Finger" },
  { index: 11, label: "Finger" },
  { index: 12, label: "Trinket" },
  { index: 13, label: "Trinket" },
  { index: 15, label: "Main Hand" },
  { index: 16, label: "Off Hand" },
  { index: 17, label: "Ranged" },
];

function getItemIconUrl(icon: string): string {
  return iconUrl(icon);
}

/** Compact single-row item display with tooltip-fetched icon/name/quality. */
function GearRow({ itemId, enchantId, slotLabel, equippedItemIds }: { itemId: number; enchantId: number | null; slotLabel: string; equippedItemIds?: ReadonlySet<number> }) {
  const isEmpty = itemId === 0;
  const tooltip = useItemTooltip(
    !isEmpty ? { itemId, enchant: enchantId ?? undefined } : null,
  );

  const icon = tooltip.data?.icon;
  const name = tooltip.data?.name;
  const quality = tooltip.data?.quality ?? 0;
  const enchantText = tooltip.data?.enchantment;

  if (isEmpty) {
    return (
      <div className="flex items-center gap-1.5 py-0.5">
        <div className="w-6 h-6 shrink-0 rounded border border-zinc-700 bg-zinc-900/80 flex items-center justify-center">
          <span className="text-3xs text-zinc-600 select-none">{slotLabel.charAt(0)}</span>
        </div>
        <span className="text-2xs text-zinc-600 italic">{slotLabel}</span>
      </div>
    );
  }

  const row = (
    <div className="flex items-center gap-1.5 py-0.5">
      <div className={cn(
        "w-6 h-6 shrink-0 rounded border bg-zinc-900/80 flex items-center justify-center overflow-hidden cursor-pointer",
        getQualityBorderClass(quality),
      )}>
        {icon ? (
          <img src={getItemIconUrl(icon)} alt={name ?? ""} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <HelpCircle className="w-3.5 h-3.5 text-zinc-500" />
        )}
      </div>
      <div className="flex flex-col min-w-0">
        <span className={cn("text-2xs leading-tight truncate", name ? getQualityTextClass(quality) : "text-zinc-400")}>
          {name ?? `Item #${itemId}`}
        </span>
        {enchantText && (
          <span className="text-2xs leading-tight text-quality-uncommon truncate">{enchantText}</span>
        )}
      </div>
    </div>
  );

  if (!tooltip.data) return row;

  return (
    <TooltipProvider>
      <Tooltip delayDuration={150}>
        <TooltipTrigger asChild>
          <span className="cursor-pointer">{row}</span>
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          align="start"
          sideOffset={4}
          className="p-0 bg-transparent border-0 z-[10000]"
          hideArrow
        >
          <ItemTooltip item={tooltip.data} equippedItemIds={equippedItemIds} />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function DropdownList({ playerList, search, setSearch, searchRef, selectedGuid, onSelect, onClose }: {
  playerList: PlayerSnapshot[];
  search: string;
  setSearch: (s: string) => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
  selectedGuid: string | null;
  onSelect: (guid: string) => void;
  onClose: () => void;
}) {
  useEffect(() => { searchRef.current?.focus(); }, [searchRef]);

  const filtered = search
    ? playerList.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
    : playerList;

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute top-full left-0 z-50 mt-0.5 bg-background border border-border rounded shadow-lg min-w-[160px]">
        <div className="p-1">
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "Enter" && filtered.length === 1) onSelect(filtered[0].guid);
            }}
            placeholder="Search..."
            className="w-full bg-transparent border border-border rounded px-1.5 py-0.5 text-sm outline-none focus:border-blue-500"
          />
        </div>
        <div className="max-h-60 overflow-y-auto">
          {filtered.map((p) => (
            <button
              key={p.guid}
              onClick={() => onSelect(p.guid)}
              className={cn(
                "w-full text-left px-2 py-1 text-sm hover:bg-accent",
                selectedGuid === p.guid && "bg-accent",
              )}
              style={{ color: getClassColorVar(p.heroClass) }}
            >
              {p.name}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="px-2 py-1 text-sm text-muted-foreground italic">No matches</div>
          )}
        </div>
      </div>
    </>
  );
}

const CLASS_NAME_TO_ID: Record<string, number> = {
  warrior: 1, paladin: 2, hunter: 3, rogue: 4, priest: 5,
  shaman: 7, mage: 8, warlock: 9, druid: 11,
};

function PlayerTalentsView({ player }: { player: PlayerSnapshot }) {
  const classId = CLASS_NAME_TO_ID[player.heroClass.toLowerCase()];

  const allocations = useMemo<TalentAllocation[] | undefined>(() => {
    if (!player.talents || player.talents.trees.length < 3) return undefined;
    return player.talents.trees.map((ranks, i) => ({
      tabName: "",
      pointsSpent: player.talents!.summary[i] ?? 0,
      rankDigits: ranks,
    }));
  }, [player.talents]);

  if (!classId) {
    return <div className="text-sm text-muted-foreground p-4">Unknown class</div>;
  }

  if (!allocations) {
    return <div className="text-sm text-muted-foreground p-4">No talent data available for this player.</div>;
  }

  return <TalentTreeViewer classId={classId} allocations={allocations} />;
}

type SubTab = "gear" | "talents";

export function EquipmentContent(props: PanelRenderProps<EquipmentResult>) {
  const { result, context } = props;
  const [subTab, setSubTab] = useState<SubTab>("gear");
  const { cachedValue } = useCachedValue(
    result,
    (r) => !!r && r.players instanceof Map && r.players.size > 0,
    [context.selectedEncounterIds],
  );

  const playerList = useMemo(() => {
    if (!cachedValue) return [];
    return Array.from(cachedValue.players.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [cachedValue]);

  const [selectedGuid, setSelectedGuid] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  let selected: PlayerSnapshot | null = null;
  if (cachedValue) {
    if (selectedGuid && cachedValue.players.has(selectedGuid)) {
      selected = cachedValue.players.get(selectedGuid)!;
    } else {
      for (const id of context.entitySelection.playerIds) {
        if (cachedValue.players.has(id)) {
          selected = cachedValue.players.get(id)!;
          break;
        }
      }
      if (!selected) selected = playerList[0] ?? null;
    }
  }

  const equippedItemIds = useMemo(() => {
    if (!selected) return undefined;
    const ids = new Set<number>();
    for (const g of selected.gear) {
      if (g.itemId > 0) ids.add(g.itemId);
    }
    return ids;
  }, [selected]);

  if (!cachedValue || playerList.length === 0) {
    return (
      <GenericPanel {...props}>
        <div className="text-sm text-muted-foreground p-4">
          No combatant info available. This data requires the ChronicleCompanion addon and a reparse.
        </div>
      </GenericPanel>
    );
  }

  return (
    <GenericPanel {...props}>
      <div className="flex flex-col gap-1 p-2 overflow-y-auto styled-scrollbar">
        {/* Player selector + info */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Custom dropdown for class-colored player names */}
          <div className="relative">
            <button
              onClick={() => setDropdownOpen((v) => !v)}
              className="bg-background border border-border rounded px-2 py-1 text-sm flex items-center gap-1 min-w-[120px]"
            >
              {selected ? (
                <span style={{ color: getClassColorVar(selected.heroClass) }}>{selected.name}</span>
              ) : (
                <span className="text-muted-foreground">Select player</span>
              )}
              <span className="ml-auto text-muted-foreground text-2xs">▾</span>
            </button>
            {dropdownOpen && (
              <DropdownList
                playerList={playerList}
                search={search}
                setSearch={setSearch}
                searchRef={searchRef}
                selectedGuid={selected?.guid ?? null}
                onSelect={(guid) => { setSelectedGuid(guid); setDropdownOpen(false); setSearch(""); }}
                onClose={() => { setDropdownOpen(false); setSearch(""); }}
              />
            )}
          </div>
          {selected && (
            <span className="text-2xs text-muted-foreground flex items-center gap-1">
              {selected.heroClass} · {formatRaceLabel(selected.race)}
              {context.instance.players?.[selected.guid]?.level ? ` · Level ${context.instance.players[selected.guid].level}` : ""}
              {selected.talents && ` · ${selected.talents.summary.join("/")}`}
              {selected.guildName && ` · <${selected.guildName}>`}
              {context.instance.realm && (
                <Link
                  to={`/armory/${encodeURIComponent(context.instance.realm)}/${encodeURIComponent(selected.name)}`}
                  className="inline-flex items-center gap-0.5 text-blue-400 hover:text-blue-300"
                  target="_blank"
                >
                  <ExternalLink className="w-3 h-3" />
                </Link>
              )}
            </span>
          )}
        </div>

        {/* Sub-tab toggle */}
        <div className="flex gap-1 border-b border-border mb-1">
          {(["gear", "talents"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setSubTab(tab)}
              className={cn(
                "px-2 py-1 text-2xs font-medium border-b -mb-px transition-colors capitalize",
                subTab === tab
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Gear list */}
        {selected && subTab === "gear" && (
          <div key={selected.guid} className="grid grid-cols-2 gap-x-4 gap-y-0">
            {SLOT_ORDER.map((slot, i) => {
              const g = selected!.gear[slot.index];
              return (
                <GearRow
                  key={i}
                  itemId={g?.itemId ?? 0}
                  enchantId={g?.enchantId ?? null}
                  slotLabel={slot.label}
                  equippedItemIds={equippedItemIds}
                />
              );
            })}
          </div>
        )}

        {/* Talents view */}
        {selected && subTab === "talents" && (
          <PlayerTalentsView player={selected} />
        )}
      </div>
    </GenericPanel>
  );
}
