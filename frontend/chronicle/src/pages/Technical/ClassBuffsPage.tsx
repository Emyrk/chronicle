import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Eye, EyeOff, ExternalLink, Search, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useFriendlyClassBuffs, useSetClassBuffIgnore, type FriendlyClassBuffSpell } from "@/api/classBuffs";
import { useAuthorizationCheck } from "@/api/queries";
import { Card } from "@/components/ui/Card/Card";
import { SpellIdTooltip } from "@/components/ui/SpellIdTooltip/SpellIdTooltip";
import { useAuth } from "@/hooks/useAuth";

const TARGETING_LABELS: Record<FriendlyClassBuffSpell["targeting"], string> = {
  friendly: "Friendly player",
  group: "Party / raid",
};

interface ClassBuffMenuState {
  x: number;
  y: number;
  name: string;
  ignored: boolean;
  rankCount: number;
}

function IgnoredBadge() {
  return (
    <span className="shrink-0 rounded-full border border-zinc-500/30 bg-zinc-500/10 px-2 py-0.5 text-[10px] font-medium text-zinc-400">
      Ignored
    </span>
  );
}

function ClassBuffMenu({
  menu,
  pending,
  onApply,
  onClose,
}: {
  menu: ClassBuffMenuState;
  pending: boolean;
  onApply: (ignored: boolean) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const close = () => onClose();
    window.addEventListener("click", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("blur", close);
    };
  }, [onClose]);

  return (
    <div
      className="fixed z-[100] w-72 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-2xl"
      style={{ left: Math.min(menu.x, window.innerWidth - 296), top: Math.min(menu.y, window.innerHeight - 128) }}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="border-b border-border bg-muted/35 px-3 py-2.5">
        <div className="text-xs font-semibold">{menu.name}</div>
        <div className="mt-0.5 text-[10px] text-muted-foreground">
          {menu.rankCount} {menu.rankCount === 1 ? "rank" : "ranks"} · all datasets
        </div>
      </div>
      <div className="p-1.5">
        <button
          type="button"
          disabled={pending}
          onClick={() => onApply(!menu.ignored)}
          className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs hover:bg-accent disabled:opacity-40"
        >
          {menu.ignored ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          {menu.ignored ? "Stop ignoring" : "Ignore in Friendly Class Buffs"}
        </button>
      </div>
    </div>
  );
}

export function ClassBuffsPage() {
  const { data, isLoading, error } = useFriendlyClassBuffs();
  const [selectedClass, setSelectedClass] = useState("");
  const [search, setSearch] = useState("");
  const [targeting, setTargeting] = useState<"all" | FriendlyClassBuffSpell["targeting"]>("all");
  const [ignoredOnly, setIgnoredOnly] = useState(false);
  const [menu, setMenu] = useState<ClassBuffMenuState | null>(null);
  const setIgnore = useSetClassBuffIgnore();
  const { isAuthenticated } = useAuth();
  const authzCheck = useMemo(
    () => ({
      manageConsumables: "chronicle:chronicle#admin_consumables",
      adminWorldData: "chronicle:chronicle#admin_world_data",
    }),
    [],
  );
  const { data: authorization } = useAuthorizationCheck(authzCheck, { enabled: isAuthenticated });
  const canManage = (authorization?.manageConsumables ?? false) || (authorization?.adminWorldData ?? false);

  const classNames = useMemo(() => Object.keys(data ?? {}).sort(), [data]);
  const activeClass = selectedClass || classNames[0] || "";
  const spells = useMemo(() => data?.[activeClass] ?? [], [activeClass, data]);
  const filteredSpells = useMemo(() => {
    const query = search.trim().toLowerCase();
    return spells.filter((spell) => {
      if (targeting !== "all" && spell.targeting !== targeting) return false;
      if (ignoredOnly && !spell.ignored) return false;
      if (!query) return true;
      return (
        spell.name.toLowerCase().includes(query) ||
        spell.name_subtext.toLowerCase().includes(query) ||
        spell.id.toString().includes(query)
      );
    });
  }, [ignoredOnly, search, spells, targeting]);
  const totalSpells = useMemo(
    () => Object.values(data ?? {}).reduce((total, entries) => total + entries.length, 0),
    [data],
  );
  const ignoredCount = useMemo(
    () => Object.values(data ?? {}).reduce(
      (total, entries) => total + entries.filter((spell) => spell.ignored).length,
      0,
    ),
    [data],
  );

  const openMenu = (event: React.MouseEvent, spell: FriendlyClassBuffSpell) => {
    if (!canManage) return;
    event.preventDefault();
    const ranks = spells.filter((entry) => entry.name.toLowerCase() === spell.name.toLowerCase());
    setMenu({
      x: event.clientX,
      y: event.clientY,
      name: spell.name,
      ignored: ranks.some((rank) => rank.ignored),
      rankCount: ranks.length,
    });
  };

  const applyIgnore = (ignored: boolean) => {
    if (!menu) return;
    setIgnore.mutate(
      { spell_name: menu.name, ignored },
      {
        onSuccess: () => {
          toast.success(`${menu.name} ${ignored ? "ignored across all datasets" : "restored across all datasets"}`);
          setMenu(null);
        },
        onError: (mutationError) => toast.error(mutationError.message),
      },
    );
  };

  return (
    <div className="container mx-auto max-w-4xl px-4 py-4">
      <Link
        to="/technical"
        className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" />
        Back
      </Link>

      <div className="mb-1 flex flex-wrap items-center gap-2">
        <ShieldCheck className="h-5 w-5" />
        <h1 className="text-xl font-bold">Friendly Class Buffs</h1>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {totalSpells.toLocaleString()} spell ranks
        </span>
        {ignoredCount > 0 && (
          <span className="rounded-full border border-zinc-500/30 bg-zinc-500/10 px-2 py-0.5 text-xs text-zinc-400">
            {ignoredCount.toLocaleString()} ignored
          </span>
        )}
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        Generated from the current tenant&apos;s spell dataset during spell import. Includes
        non-passive player-class spells with an aura effect targeting a friendly player,
        party, or raid. Every rank remains listed for combat-log matching. Ignored names are
        hidden from the Friendly Class Buffs panel in every dataset
        {canManage ? "; right-click a buff to ignore it or stop ignoring it." : "."}
      </p>

      <div className="mb-3 flex flex-wrap gap-3">
        <select
          value={activeClass}
          onChange={(event) => {
            setSelectedClass(event.target.value);
            setSearch("");
          }}
          className="rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {classNames.map((className) => (
            <option key={className} value={className}>
              {className} ({data?.[className]?.length ?? 0})
            </option>
          ))}
        </select>
        <select
          value={targeting}
          onChange={(event) => setTargeting(event.target.value as typeof targeting)}
          className="rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="all">All targets</option>
          <option value="group">Party / raid</option>
          <option value="friendly">Friendly player</option>
        </select>
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search buff, rank, or ID..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full rounded-md border bg-background py-1.5 pl-8 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <label className="flex items-center gap-1.5 self-center text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={ignoredOnly}
            onChange={(event) => setIgnoredOnly(event.target.checked)}
          />
          Ignored only
        </label>
        {(search || ignoredOnly) && (
          <span className="self-center text-xs text-muted-foreground">{filteredSpells.length} results</span>
        )}
      </div>

      <Card className="max-h-[75vh] divide-y divide-border/30 overflow-auto styled-scrollbar">
        <div className="sticky top-0 z-10 grid grid-cols-[72px_minmax(0,1fr)_130px_80px] bg-muted/80 px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground backdrop-blur">
          <span>Spell ID</span>
          <span>Buff</span>
          <span>Target</span>
          <span className="text-right">Auras</span>
        </div>
        {isLoading ? (
          <div className="p-4 text-center text-sm text-muted-foreground">Loading…</div>
        ) : error ? (
          <div className="p-4 text-center text-sm text-destructive">
            Failed to load class buff data.
          </div>
        ) : classNames.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            No class buff data generated for this dataset yet. Re-import Spell.dbc.
          </div>
        ) : filteredSpells.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            No class buffs match these filters.
          </div>
        ) : (
          filteredSpells.map((spell) => (
            <Link
              key={spell.id}
              to={`/wowdb/spell/${spell.id}`}
              onContextMenu={(event) => openMenu(event, spell)}
              className={`group grid grid-cols-[72px_minmax(0,1fr)_130px_80px] items-center px-3 py-2 hover:bg-muted/50 ${spell.ignored ? "opacity-60" : ""}`}
            >
              <span className="font-mono text-xs text-muted-foreground">{spell.id}</span>
              <div className="flex min-w-0 items-center gap-2">
                <SpellIdTooltip
                  spellId={spell.id}
                  name={spell.name}
                  size={16}
                  className="truncate text-sm"
                />
                {spell.name_subtext && (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {spell.name_subtext}
                  </span>
                )}
                {spell.ignored && <IgnoredBadge />}
                <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
              <span className="text-xs text-muted-foreground">
                {TARGETING_LABELS[spell.targeting]}
              </span>
              <span
                className="truncate text-right text-xs text-muted-foreground"
                title={spell.effects
                  .map((effect) => `${effect.aura_name} (${effect.aura_effect})`)
                  .join(", ")}
              >
                {spell.effects.map((effect) => effect.aura_name).join(", ")}
              </span>
            </Link>
          ))
        )}
      </Card>
      {menu && (
        <ClassBuffMenu
          menu={menu}
          pending={setIgnore.isPending}
          onApply={applyIgnore}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
