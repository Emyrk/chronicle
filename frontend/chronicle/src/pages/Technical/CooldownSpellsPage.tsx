import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Eye, EyeOff, ExternalLink, Search, TimerReset } from "lucide-react";
import { toast } from "sonner";
import { useCooldownSpells, useSetCooldownIgnored, type CooldownSpellEntry } from "@/api/cooldownSpells";
import { useAuthorizationCheck } from "@/api/queries";
import { Card } from "@/components/ui/Card/Card";
import { SpellIdTooltip } from "@/components/ui/SpellIdTooltip/SpellIdTooltip";
import { useAuth } from "@/hooks/useAuth";

interface CooldownMenuState {
  x: number;
  y: number;
  name: string;
  className: string;
  spellIds: number[];
  ignored: boolean;
}

function CooldownMenu({
  menu,
  pending,
  onToggle,
  onClose,
}: {
  menu: CooldownMenuState;
  pending: boolean;
  onToggle: () => void;
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
      className="fixed z-[100] w-64 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-2xl"
      style={{ left: Math.min(menu.x, window.innerWidth - 272), top: Math.min(menu.y, window.innerHeight - 140) }}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="border-b border-border bg-muted/35 px-3 py-2.5">
        <div className="text-xs font-semibold">{menu.name}</div>
        <div className="mt-0.5 text-[10px] text-muted-foreground">
          {menu.className} · {menu.spellIds.length} {menu.spellIds.length === 1 ? "rank" : "ranks"}
        </div>
      </div>
      <div className="p-1.5">
        <button
          type="button"
          disabled={pending}
          onClick={onToggle}
          className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs hover:bg-accent disabled:opacity-40"
        >
          {menu.ignored ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          {menu.ignored ? "Stop ignoring" : "Ignore in Cooldown Usage"}
        </button>
      </div>
    </div>
  );
}

function formatCooldown(milliseconds: number): string {
  const totalSeconds = Math.round(milliseconds / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes === 0 ? `${hours}h` : `${hours}h ${remainingMinutes}m`;
}

export function CooldownSpellsPage() {
  const { data: cooldowns, isLoading, error } = useCooldownSpells();
  const data = cooldowns?.byClass;
  const [selectedClass, setSelectedClass] = useState("");
  const [search, setSearch] = useState("");
  const [ignoredOnly, setIgnoredOnly] = useState(false);
  const [menu, setMenu] = useState<CooldownMenuState | null>(null);
  const setIgnored = useSetCooldownIgnored();
  const { isAuthenticated } = useAuth();
  // Same rule as consumable ignores: consumables admins or world-data admins.
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
    return spells.filter(
      (spell) =>
        (!ignoredOnly || spell.ignored) &&
        (!query ||
          spell.name.toLowerCase().includes(query) ||
          spell.name_subtext.toLowerCase().includes(query) ||
          spell.id.toString().includes(query)),
    );
  }, [ignoredOnly, search, spells]);
  const totalSpells = useMemo(
    () => Object.values(data ?? {}).reduce((total, entries) => total + entries.length, 0),
    [data],
  );
  const ignoredCount = useMemo(
    () => Object.values(data ?? {}).reduce((total, entries) => total + entries.filter((s) => s.ignored).length, 0),
    [data],
  );

  const openMenu = (event: React.MouseEvent, spell: CooldownSpellEntry) => {
    if (!canManage) return;
    event.preventDefault();
    // Ignores apply to every rank, matching how the panel folds ranks by name.
    const ranks = spells.filter((entry) => entry.name.toLowerCase() === spell.name.toLowerCase());
    setMenu({
      x: event.clientX,
      y: event.clientY,
      name: spell.name,
      className: activeClass,
      spellIds: ranks.map((entry) => entry.id),
      ignored: ranks.some((entry) => entry.ignored),
    });
  };

  const toggleIgnored = () => {
    if (!menu || !cooldowns?.datasetId) return;
    const { name, spellIds, ignored } = menu;
    setIgnored.mutate(
      { datasetId: cooldowns.datasetId, spell_ids: spellIds, ignored: !ignored },
      {
        onSuccess: () => {
          toast.success(ignored ? `${name} is no longer ignored` : `${name} ignored`);
          setMenu(null);
        },
        onError: (err) => toast.error(err.message),
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
        <TimerReset className="h-5 w-5" />
        <h1 className="text-xl font-bold">Cooldowns</h1>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {totalSpells.toLocaleString()} spells
        </span>
        {ignoredCount > 0 && (
          <span className="rounded-full border border-zinc-500/30 bg-zinc-500/10 px-2 py-0.5 text-xs text-zinc-400">
            {ignoredCount.toLocaleString()} ignored
          </span>
        )}
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        Generated from the current tenant&apos;s spell dataset. Includes active player-class spells
        with an individual or shared cooldown. Every rank remains listed so combat-log spell IDs
        can be matched directly. Ignored cooldowns are hidden from the Cooldown Usage panel
        {canManage ? "; right-click a cooldown to ignore it or stop ignoring it." : "."}
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
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search spell, rank, or ID..."
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
          <span className="self-center text-xs text-muted-foreground">
            {filteredSpells.length} results
          </span>
        )}
      </div>

      <Card className="max-h-[75vh] divide-y divide-border/30 overflow-auto styled-scrollbar">
        <div className="sticky top-0 z-10 grid grid-cols-[72px_minmax(0,1fr)_110px] bg-muted/80 px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground backdrop-blur">
          <span>Spell ID</span>
          <span>Ability</span>
          <span className="text-right">Cooldown</span>
        </div>
        {isLoading ? (
          <div className="p-4 text-center text-sm text-muted-foreground">Loading…</div>
        ) : error ? (
          <div className="p-4 text-center text-sm text-destructive">
            Failed to load cooldown data.
          </div>
        ) : classNames.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            No cooldown data generated for this dataset yet. Re-import Spell.dbc.
          </div>
        ) : filteredSpells.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            {ignoredOnly && !search ? "No ignored cooldowns for this class." : "No cooldowns match your search."}
          </div>
        ) : (
          filteredSpells.map((spell) => (
            <Link
              key={spell.id}
              to={`/wowdb/spell/${spell.id}`}
              onContextMenu={(event) => openMenu(event, spell)}
              className={`group grid grid-cols-[72px_minmax(0,1fr)_110px] items-center px-3 py-2 hover:bg-muted/50 ${spell.ignored ? "opacity-60" : ""}`}
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
                {spell.ignored && (
                  <span className="shrink-0 rounded-full border border-zinc-500/30 bg-zinc-500/10 px-2 py-0.5 text-[10px] font-medium text-zinc-400">
                    Ignored
                  </span>
                )}
                <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
              <div className="text-right">
                <div className="font-mono text-sm font-medium">
                  {formatCooldown(spell.cooldown_ms)}
                </div>
                {spell.category_recovery_time_ms > spell.recovery_time_ms && (
                  <div className="text-[10px] text-muted-foreground">shared</div>
                )}
              </div>
            </Link>
          ))
        )}
      </Card>
      {menu && (
        <CooldownMenu
          menu={menu}
          pending={setIgnored.isPending}
          onToggle={toggleIgnored}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
