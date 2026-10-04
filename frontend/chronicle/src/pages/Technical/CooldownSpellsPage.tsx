import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Eye, EyeOff, ExternalLink, Layers3, Search, TimerReset } from "lucide-react";
import { toast } from "sonner";
import {
  useCooldownSpells,
  useCooldownSpellsForDatasets,
  useSetCooldownIgnored,
  type CooldownSpellEntry,
} from "@/api/cooldownSpells";
import { DEFAULT_DATASET_ID, useAuthorizationCheck, useDatasets, useSiteConfig } from "@/api/queries";
import type { Dataset } from "@/api/typesGenerated";
import { Card } from "@/components/ui/Card/Card";
import { SpellIdTooltip } from "@/components/ui/SpellIdTooltip/SpellIdTooltip";
import { useAuth } from "@/hooks/useAuth";

interface IgnoreTarget {
  datasetId: string;
  spellIds: number[];
  ignored: boolean;
}

interface CooldownMenuState {
  x: number;
  y: number;
  name: string;
  subtitle: string;
  targets: IgnoreTarget[];
}

/** One cooldown (all ranks) across the selected datasets. */
interface MultiDatasetCooldown {
  key: string;
  name: string;
  spellId: number;
  cooldownMs: number;
  byDataset: Map<string, CooldownSpellEntry[]>;
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

function IgnoredBadge({ label = "Ignored" }: { label?: string }) {
  return (
    <span className="shrink-0 rounded-full border border-zinc-500/30 bg-zinc-500/10 px-2 py-0.5 text-[10px] font-medium text-zinc-400">
      {label}
    </span>
  );
}

function CooldownMenu({
  menu,
  pending,
  onApply,
  onClose,
}: {
  menu: CooldownMenuState;
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

  const scope = menu.targets.length > 1 ? ` in ${menu.targets.length} datasets` : "";
  const canIgnore = menu.targets.some((target) => !target.ignored);
  const canUnignore = menu.targets.some((target) => target.ignored);

  return (
    <div
      className="fixed z-[100] w-72 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-2xl"
      style={{ left: Math.min(menu.x, window.innerWidth - 296), top: Math.min(menu.y, window.innerHeight - 160) }}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="border-b border-border bg-muted/35 px-3 py-2.5">
        <div className="text-xs font-semibold">{menu.name}</div>
        <div className="mt-0.5 text-[10px] text-muted-foreground">{menu.subtitle}</div>
      </div>
      <div className="p-1.5">
        {canIgnore && (
          <button
            type="button"
            disabled={pending}
            onClick={() => onApply(true)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs hover:bg-accent disabled:opacity-40"
          >
            <EyeOff className="h-3.5 w-3.5" />
            Ignore in Cooldown Usage{scope}
          </button>
        )}
        {canUnignore && (
          <button
            type="button"
            disabled={pending}
            onClick={() => onApply(false)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs hover:bg-accent disabled:opacity-40"
          >
            <Eye className="h-3.5 w-3.5" />
            Stop ignoring{scope}
          </button>
        )}
      </div>
    </div>
  );
}

function DatasetScopeCard({
  datasets,
  selectedDatasetIds,
  onChange,
}: {
  datasets: Dataset[];
  selectedDatasetIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const multi = selectedDatasetIds.length > 1;
  const toggle = (id: string) => {
    const next = selectedDatasetIds.includes(id)
      ? selectedDatasetIds.filter((selected) => selected !== id)
      : [...selectedDatasetIds, id];
    onChange(next.length === 0 ? [DEFAULT_DATASET_ID] : next);
  };

  return (
    <Card className="mb-4 border-sky-500/20 bg-sky-500/[0.04] p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Layers3 className="h-4 w-4 text-sky-400" />
          Dataset scope
          <span className="text-xs font-normal text-muted-foreground">
            {multi ? `${selectedDatasetIds.length} datasets selected` : "Current dataset only"}
          </span>
        </div>
        <div className="flex gap-1.5 text-xs">
          <button
            type="button"
            onClick={() => onChange([DEFAULT_DATASET_ID])}
            className="rounded border border-border px-2 py-1 hover:bg-muted"
          >
            Current only
          </button>
          <button
            type="button"
            onClick={() => onChange(datasets.map((dataset) => dataset.id))}
            className="rounded border border-border px-2 py-1 hover:bg-muted"
          >
            Select all
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {datasets.map((dataset) => (
          <label
            key={dataset.id}
            className="flex cursor-pointer items-center gap-2 rounded-md border border-border/70 bg-background/70 px-2.5 py-1.5 text-xs"
          >
            <input
              type="checkbox"
              checked={selectedDatasetIds.includes(dataset.id)}
              onChange={() => toggle(dataset.id)}
              className="accent-sky-500"
            />
            <span className="font-medium">{dataset.name}</span>
            <span className="text-[10px] text-muted-foreground">{dataset.wow_version}</span>
          </label>
        ))}
      </div>
      {multi && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Cooldowns are matched by class and name across datasets. Right-click a row to ignore it in every selected
          dataset that has it.
        </p>
      )}
    </Card>
  );
}

export function CooldownSpellsPage() {
  const [selectedClass, setSelectedClass] = useState("");
  const [search, setSearch] = useState("");
  const [ignoredOnly, setIgnoredOnly] = useState(false);
  const [menu, setMenu] = useState<CooldownMenuState | null>(null);
  const [selectedDatasetIds, setSelectedDatasetIds] = useState<string[]>([DEFAULT_DATASET_ID]);
  const setIgnored = useSetCooldownIgnored();
  const [applying, setApplying] = useState(false);
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
  const { data: siteConfig } = useSiteConfig();
  const { data: datasets } = useDatasets();
  const canCompareDatasets = siteConfig?.tenant === null && canManage && (datasets?.length ?? 0) > 1;
  const multiDatasetMode = canCompareDatasets && selectedDatasetIds.length > 1;

  const single = useCooldownSpells();
  const multiQueries = useCooldownSpellsForDatasets(multiDatasetMode ? selectedDatasetIds : []);
  const multiLoading = multiQueries.some((query) => query.isLoading);
  const multiError = multiQueries.find((query) => query.error)?.error ?? null;
  const isLoading = multiDatasetMode ? multiLoading : single.isLoading;
  const error = multiDatasetMode ? multiError : single.error;

  const data = single.data?.byClass;
  const datasetById = useMemo(() => new Map((datasets ?? []).map((dataset) => [dataset.id, dataset])), [datasets]);
  // Small lists; recomputed per render since useQueries returns a fresh array.
  const multiData = multiDatasetMode && !multiLoading
    ? selectedDatasetIds.map((datasetId, index) => ({ datasetId, byClass: multiQueries[index]?.data?.byClass ?? {} }))
    : [];

  const classNames = multiDatasetMode
    ? [...new Set(multiData.flatMap((entry) => Object.keys(entry.byClass)))].sort()
    : Object.keys(data ?? {}).sort();
  const activeClass = classNames.includes(selectedClass) ? selectedClass : classNames[0] || "";
  const query = search.trim().toLowerCase();

  const spells = data?.[activeClass] ?? [];
  const filteredSpells = spells.filter(
    (spell) =>
      (!ignoredOnly || spell.ignored) &&
      (!query ||
        spell.name.toLowerCase().includes(query) ||
        spell.name_subtext.toLowerCase().includes(query) ||
        spell.id.toString().includes(query)),
  );

  const multiCooldowns = (() => {
    const byKey = new Map<string, MultiDatasetCooldown>();
    for (const { datasetId, byClass } of multiData) {
      for (const spell of byClass[activeClass] ?? []) {
        const key = spell.name.toLowerCase();
        let cooldown = byKey.get(key);
        if (!cooldown) {
          cooldown = { key, name: spell.name, spellId: spell.id, cooldownMs: 0, byDataset: new Map() };
          byKey.set(key, cooldown);
        }
        cooldown.cooldownMs = Math.max(cooldown.cooldownMs, spell.cooldown_ms);
        const ranks = cooldown.byDataset.get(datasetId) ?? [];
        ranks.push(spell);
        cooldown.byDataset.set(datasetId, ranks);
      }
    }
    return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
  })();
  const filteredMultiCooldowns = multiCooldowns.filter(
    (cooldown) =>
      (!ignoredOnly || [...cooldown.byDataset.values()].some((ranks) => ranks.some((rank) => rank.ignored))) &&
      (!query ||
        cooldown.name.toLowerCase().includes(query) ||
        [...cooldown.byDataset.values()].some((ranks) => ranks.some((rank) => rank.id.toString().includes(query)))),
  );

  const allSpells = multiDatasetMode ? multiData.map((entry) => entry.byClass) : [data ?? {}];
  const totalSpells = allSpells.reduce(
    (total, byClass) => total + Object.values(byClass).reduce((sum, entries) => sum + entries.length, 0),
    0,
  );
  const ignoredCount = allSpells.reduce(
    (total, byClass) =>
      total + Object.values(byClass).reduce((sum, entries) => sum + entries.filter((spell) => spell.ignored).length, 0),
    0,
  );
  const visibleCount = multiDatasetMode ? filteredMultiCooldowns.length : filteredSpells.length;

  const openSingleMenu = (event: React.MouseEvent, spell: CooldownSpellEntry) => {
    if (!canManage || !single.data?.datasetId) return;
    event.preventDefault();
    // Ignores apply to every rank, matching how the panel folds ranks by name.
    const ranks = spells.filter((entry) => entry.name.toLowerCase() === spell.name.toLowerCase());
    setMenu({
      x: event.clientX,
      y: event.clientY,
      name: spell.name,
      subtitle: `${activeClass} · ${ranks.length} ${ranks.length === 1 ? "rank" : "ranks"}`,
      targets: [
        {
          datasetId: single.data.datasetId,
          spellIds: ranks.map((entry) => entry.id),
          ignored: ranks.some((entry) => entry.ignored),
        },
      ],
    });
  };

  const openMultiMenu = (event: React.MouseEvent, cooldown: MultiDatasetCooldown) => {
    event.preventDefault();
    setMenu({
      x: event.clientX,
      y: event.clientY,
      name: cooldown.name,
      subtitle: `${activeClass} · in ${cooldown.byDataset.size} of ${selectedDatasetIds.length} selected datasets`,
      targets: [...cooldown.byDataset.entries()].map(([datasetId, ranks]) => ({
        datasetId,
        spellIds: ranks.map((rank) => rank.id),
        ignored: ranks.some((rank) => rank.ignored),
      })),
    });
  };

  const applyIgnored = async (ignored: boolean) => {
    if (!menu) return;
    const targets = menu.targets.filter((target) => target.ignored !== ignored);
    setApplying(true);
    const results = await Promise.allSettled(
      targets.map((target) =>
        setIgnored.mutateAsync({ datasetId: target.datasetId, spell_ids: target.spellIds, ignored }),
      ),
    );
    setApplying(false);
    const failed = results.filter((result) => result.status === "rejected").length;
    const succeeded = results.length - failed;
    const verb = ignored ? "ignored" : "no longer ignored";
    if (succeeded > 0) {
      toast.success(
        targets.length > 1
          ? `${menu.name} ${verb} in ${succeeded} dataset${succeeded === 1 ? "" : "s"}`
          : `${menu.name} ${verb}`,
      );
    }
    if (failed > 0) toast.error(`Failed for ${failed} dataset${failed === 1 ? "" : "s"}`);
    setMenu(null);
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

      {canCompareDatasets && datasets && (
        <DatasetScopeCard datasets={datasets} selectedDatasetIds={selectedDatasetIds} onChange={setSelectedDatasetIds} />
      )}

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
              {multiDatasetMode ? className : `${className} (${data?.[className]?.length ?? 0})`}
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
          <span className="self-center text-xs text-muted-foreground">{visibleCount} results</span>
        )}
      </div>

      <Card className="max-h-[75vh] gap-0 py-0 divide-y divide-border/30 overflow-auto styled-scrollbar">
        {multiDatasetMode ? (
          <div className="sticky top-0 z-10 grid grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_80px] bg-muted px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground">
            <span>Ability</span>
            <span>Datasets</span>
            <span className="text-right">Cooldown</span>
          </div>
        ) : (
          <div className="sticky top-0 z-10 grid grid-cols-[72px_minmax(0,1fr)_110px] bg-muted px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground">
            <span>Spell ID</span>
            <span>Ability</span>
            <span className="text-right">Cooldown</span>
          </div>
        )}
        {isLoading ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            {multiDatasetMode ? `Loading ${selectedDatasetIds.length} datasets…` : "Loading…"}
          </div>
        ) : error ? (
          <div className="p-4 text-center text-sm text-destructive">Failed to load cooldown data.</div>
        ) : classNames.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            No cooldown data generated for this dataset yet. Re-import Spell.dbc.
          </div>
        ) : visibleCount === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            {ignoredOnly && !search ? "No ignored cooldowns for this class." : "No cooldowns match your search."}
          </div>
        ) : multiDatasetMode ? (
          filteredMultiCooldowns.map((cooldown) => {
            const ignoredIn = [...cooldown.byDataset.values()].filter((ranks) => ranks.some((rank) => rank.ignored)).length;
            const allIgnored = ignoredIn === cooldown.byDataset.size;
            return (
              <div
                key={cooldown.key}
                onContextMenu={(event) => openMultiMenu(event, cooldown)}
                className={`grid grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_80px] items-center gap-2 px-3 py-2 hover:bg-muted/50 ${allIgnored ? "opacity-60" : ""}`}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <SpellIdTooltip spellId={cooldown.spellId} name={cooldown.name} size={16} className="truncate text-sm" />
                  {ignoredIn > 0 && (
                    <IgnoredBadge label={allIgnored ? "Ignored" : `Ignored ${ignoredIn}/${cooldown.byDataset.size}`} />
                  )}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                  {selectedDatasetIds.map((datasetId) => {
                    const ranks = cooldown.byDataset.get(datasetId);
                    const name = datasetById.get(datasetId)?.name ?? datasetId;
                    const status = !ranks
                      ? "missing"
                      : ranks.some((rank) => rank.ignored)
                        ? "ignored"
                        : `${ranks.length} ${ranks.length === 1 ? "rank" : "ranks"}`;
                    return (
                      <span key={datasetId} className={!ranks ? "opacity-50" : ""}>
                        <strong className="text-foreground/80">{name}:</strong>{" "}
                        <span className={status === "ignored" ? "text-zinc-400" : ""}>{status}</span>
                      </span>
                    );
                  })}
                </div>
                <div className="text-right font-mono text-sm font-medium">{formatCooldown(cooldown.cooldownMs)}</div>
              </div>
            );
          })
        ) : (
          filteredSpells.map((spell) => (
            <Link
              key={spell.id}
              to={`/wowdb/spell/${spell.id}`}
              onContextMenu={(event) => openSingleMenu(event, spell)}
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
                {spell.ignored && <IgnoredBadge />}
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
          pending={applying}
          onApply={(ignored) => void applyIgnored(ignored)}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
