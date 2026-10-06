import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Database, Eye, EyeOff, ExternalLink, MoreHorizontal, Search, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  useClassBuffIgnorePolicies,
  useFriendlyClassBuffs,
  useSetClassBuffIgnores,
  type FriendlyClassBuffSpell,
} from "@/api/classBuffs";
import { DEFAULT_DATASET_ID, useAuthorizationCheck, useDatasets, useSiteConfig } from "@/api/queries";
import { Card } from "@/components/ui/Card/Card";
import { SpellIdTooltip } from "@/components/ui/SpellIdTooltip/SpellIdTooltip";
import { useAuth } from "@/hooks/useAuth";
import { useDatasetId } from "@/hooks/useDatasetId";

function normalizeBuffName(name: string): string {
  return name.trim().toLowerCase();
}

const TARGETING_LABELS: Record<FriendlyClassBuffSpell["targeting"], string> = {
  self: "Self",
  friendly: "Friendly player",
  group: "Party / raid",
};

function effectLabel(effect: FriendlyClassBuffSpell["effects"][number]): string {
  return effect.aura_name !== "None" ? effect.aura_name : effect.effect_name;
}

interface ClassBuffMenuState {
  x: number;
  y: number;
  name: string;
  rankCount: number;
  ignoredDatasetCount: number;
  datasetCount: number;
  generic: boolean;
}

function classDisplayName(className: string): string {
  return className;
}

function IgnoredBadge({ label = "Ignored" }: { label?: string }) {
  return (
    <span className="shrink-0 rounded-full border border-zinc-500/30 bg-zinc-500/10 px-2 py-0.5 text-[10px] font-medium text-zinc-400">
      {label}
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

  const canIgnore = menu.ignoredDatasetCount < menu.datasetCount;
  const canRestore = menu.ignoredDatasetCount > 0;

  return (
    <div
      className="fixed z-[100] w-72 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-2xl"
      style={{ left: Math.min(menu.x, window.innerWidth - 296), top: Math.min(menu.y, window.innerHeight - 152) }}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="border-b border-border bg-muted/35 px-3 py-2.5">
        <div className="text-xs font-semibold">{menu.name}</div>
        <div className="mt-0.5 text-[10px] text-muted-foreground">
          {menu.rankCount} {menu.rankCount === 1 ? "rank" : "ranks"} · {menu.datasetCount}{" "}
          {menu.datasetCount === 1 ? "dataset" : "datasets"} selected
        </div>
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
            {menu.generic ? "Remove from all classes in selected datasets" : "Ignore all ranks in selected datasets"}
          </button>
        )}
        {canRestore && (
          <button
            type="button"
            disabled={pending}
            onClick={() => onApply(false)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs hover:bg-accent disabled:opacity-40"
          >
            <Eye className="h-3.5 w-3.5" />
            {menu.generic ? "Include for all classes in selected datasets" : "Stop ignoring in selected datasets"}
          </button>
        )}
      </div>
    </div>
  );
}

export function ClassBuffsPage() {
  const { data, isLoading, error } = useFriendlyClassBuffs();
  const currentDatasetId = useDatasetId() ?? DEFAULT_DATASET_ID;
  const [selectedClass, setSelectedClass] = useState("");
  const [search, setSearch] = useState("");
  const [targeting, setTargeting] = useState<"all" | FriendlyClassBuffSpell["targeting"]>("all");
  const [ignoredOnly, setIgnoredOnly] = useState(false);
  const [menu, setMenu] = useState<ClassBuffMenuState | null>(null);
  const [selectedDatasetIds, setSelectedDatasetIds] = useState<string[]>([currentDatasetId]);
  const setIgnores = useSetClassBuffIgnores();
  const { isAuthenticated } = useAuth();
  const { data: siteConfig } = useSiteConfig();
  const isRoot = siteConfig?.tenant === null;
  const authzCheck = useMemo(
    () => ({ adminTenants: "chronicle:chronicle#admin_tenants" }),
    [],
  );
  const { data: authorization } = useAuthorizationCheck(authzCheck, { enabled: isAuthenticated });
  const canManage = isRoot && (authorization?.adminTenants ?? false);
  const { data: datasets } = useDatasets();
  const { data: policies } = useClassBuffIgnorePolicies(canManage);
  const selectedDatasetKeys = useMemo(() => new Set(selectedDatasetIds), [selectedDatasetIds]);
  const selectedDatasetCount = selectedDatasetKeys.size;

  const classNames = useMemo(
    () => Object.keys(data ?? {}).sort((left, right) => (
      left === "Generic" ? -1 : right === "Generic" ? 1 : left.localeCompare(right)
    )),
    [data],
  );
  const activeClass = classNames.includes(selectedClass) ? selectedClass : classNames[0] || "";
  const spells = useMemo(() => data?.[activeClass] ?? [], [activeClass, data]);

  const policiesByName = useMemo(() => {
    const byName = new Map<string, Map<string, boolean>>();
    for (const policy of policies ?? []) {
      const key = normalizeBuffName(policy.spell_name);
      const byDataset = byName.get(key) ?? new Map<string, boolean>();
      byDataset.set(policy.dataset_id, policy.ignored);
      byName.set(key, byDataset);
    }
    return byName;
  }, [policies]);

  const ignoredCountFor = useCallback((name: string, className: string, defaultIgnored: boolean) => {
    const byDataset = policiesByName.get(normalizeBuffName(name));
    let count = 0;
    for (const datasetID of selectedDatasetKeys) {
      if ((byDataset?.get(datasetID) ?? (className === "Generic" || defaultIgnored))) count++;
    }
    return count;
  }, [policiesByName, selectedDatasetKeys]);

  const ignoredCountsByName = useMemo(() => {
    const counts = new Map<string, number>();
    for (const spell of spells) {
      const name = normalizeBuffName(spell.name);
      if (!counts.has(name)) counts.set(name, ignoredCountFor(spell.name, activeClass, spell.default_ignored));
    }
    return counts;
  }, [activeClass, ignoredCountFor, spells]);
  const filteredSpells = useMemo(() => {
    const query = search.trim().toLowerCase();
    return spells.filter((spell) => {
      if (targeting !== "all" && spell.targeting !== targeting) return false;
      const ignored = canManage ? (ignoredCountsByName.get(normalizeBuffName(spell.name)) ?? 0) > 0 : spell.ignored;
      if (ignoredOnly && !ignored) return false;
      if (!query) return true;
      return (
        spell.name.toLowerCase().includes(query) ||
        spell.name_subtext.toLowerCase().includes(query) ||
        spell.id.toString().includes(query)
      );
    });
  }, [canManage, ignoredCountsByName, ignoredOnly, search, spells, targeting]);
  const totalSpells = useMemo(
    () => Object.values(data ?? {}).reduce((total, entries) => total + entries.length, 0),
    [data],
  );
  const ignoredCount = useMemo(
    () => Object.entries(data ?? {}).reduce(
      (total, [className, entries]) => total + entries.filter((spell) => (
        canManage ? ignoredCountFor(spell.name, className, spell.default_ignored) > 0 : spell.ignored
      )).length,
      0,
    ),
    [canManage, data, ignoredCountFor],
  );

  const toggleDataset = (datasetID: string) => {
    setSelectedDatasetIds((current) => current.includes(datasetID)
      ? current.filter((id) => id !== datasetID)
      : [...current, datasetID]);
  };

  const openMenuAt = (x: number, y: number, spell: FriendlyClassBuffSpell) => {
    if (!canManage || selectedDatasetCount === 0) return;
    const ranks = spells.filter((entry) => normalizeBuffName(entry.name) === normalizeBuffName(spell.name));
    setMenu({
      x,
      y,
      name: spell.name,
      rankCount: ranks.length,
      ignoredDatasetCount: ignoredCountsByName.get(normalizeBuffName(spell.name)) ?? 0,
      datasetCount: selectedDatasetCount,
      generic: activeClass === "Generic",
    });
  };

  const openContextMenu = (event: React.MouseEvent, spell: FriendlyClassBuffSpell) => {
    if (!canManage || selectedDatasetCount === 0) return;
    event.preventDefault();
    openMenuAt(event.clientX, event.clientY, spell);
  };

  const applyIgnore = (ignored: boolean) => {
    if (!menu) return;
    setIgnores.mutate(
      {
        spell_name: menu.name,
        dataset_ids: selectedDatasetIds,
        ignored,
      },
      {
        onSuccess: () => {
          const action = menu.generic
            ? (ignored ? "removed from all classes" : "included for all classes")
            : (ignored ? "ignored" : "restored");
          toast.success(
            `${menu.name} ${action} in ${selectedDatasetCount} ${selectedDatasetCount === 1 ? "dataset" : "datasets"}`,
          );
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
        Generated from the current spell dataset during spell import. Includes
        non-passive player-class and generic spells with an aura or Dummy effect targeting
        self, a friendly player, party, or raid. Self-targeted and Dummy spells are ignored by default.
        Generic spells appear in their own Generic view and must be opted in.
        Every rank remains listed for combat-log matching.
        {canManage && " Select datasets below, then right-click a rank or use its actions button to update every rank with that exact spell name."}
      </p>

      {siteConfig?.tenant && (
        <p className="mb-4 text-xs text-amber-400">
          Ignored buffs can only be managed from the root domain&apos;s technical page.
        </p>
      )}

      {isRoot && isAuthenticated && authorization && !canManage && (
        <p className="mb-4 text-xs text-amber-400">
          The technical_admin role is required to manage ignored class buffs.
        </p>
      )}

      {canManage && datasets && (
        <Card className="mb-4 border-sky-500/20 bg-sky-500/[0.04] p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Database className="h-4 w-4 text-sky-400" />
              Ignore datasets
              <span className="text-xs font-normal text-muted-foreground">
                {selectedDatasetCount} {selectedDatasetCount === 1 ? "dataset" : "datasets"} selected
              </span>
            </div>
            <div className="flex gap-1.5 text-xs">
              <button
                type="button"
                onClick={() => setSelectedDatasetIds([currentDatasetId])}
                className="rounded border border-border px-2 py-1 hover:bg-muted"
              >
                Current dataset
              </button>
              <button
                type="button"
                onClick={() => setSelectedDatasetIds(datasets.map((dataset) => dataset.id))}
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
                  onChange={() => toggleDataset(dataset.id)}
                  className="accent-sky-500"
                />
                <span className="font-medium">{dataset.name}</span>
                <span className="text-[10px] text-muted-foreground">{dataset.slug}</span>
                {dataset.id === currentDatasetId && (
                  <span className="rounded bg-sky-500/10 px-1.5 py-0.5 text-[9px] font-medium text-sky-400">current</span>
                )}
              </label>
            ))}
          </div>
          {selectedDatasetCount === 0 && (
            <p className="mt-2 text-[11px] text-amber-400">Select at least one dataset before changing ignores.</p>
          )}
        </Card>
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
              {classDisplayName(className)} ({data?.[className]?.length ?? 0})
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
          <option value="self">Self</option>
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
        <div className="sticky top-0 z-10 grid grid-cols-[72px_minmax(0,1fr)_130px_80px_32px] bg-muted/80 px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground backdrop-blur">
          <span>Spell ID</span>
          <span>Buff</span>
          <span>Target</span>
          <span className="text-right">Effects</span>
          <span className="sr-only">Actions</span>
        </div>
        {isLoading ? (
          <div className="p-4 text-center text-sm text-muted-foreground">Loading…</div>
        ) : error ? (
          <div className="p-4 text-center text-sm text-destructive">Failed to load class buff data.</div>
        ) : classNames.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            No class buff data generated for this dataset yet. Re-import Spell.dbc.
          </div>
        ) : filteredSpells.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">No class buffs match these filters.</div>
        ) : (
          filteredSpells.map((spell) => {
            const ignoredIn = canManage
              ? (ignoredCountsByName.get(normalizeBuffName(spell.name)) ?? 0)
              : (spell.ignored ? 1 : 0);
            const allIgnored = canManage && selectedDatasetCount > 0 && ignoredIn === selectedDatasetCount;
            return (
              <div
                key={spell.id}
                onContextMenu={(event) => openContextMenu(event, spell)}
                className={`group grid grid-cols-[72px_minmax(0,1fr)_130px_80px_32px] items-center px-3 py-2 hover:bg-muted/50 ${ignoredIn > 0 ? "opacity-60" : ""}`}
              >
                <Link to={`/wowdb/spell/${spell.id}`} className="contents">
                  <span className="font-mono text-xs text-muted-foreground">{spell.id}</span>
                <div className="flex min-w-0 items-center gap-2">
                  <SpellIdTooltip spellId={spell.id} name={spell.name} size={16} className="truncate text-sm" />
                  {spell.name_subtext && (
                    <span className="shrink-0 text-xs text-muted-foreground">{spell.name_subtext}</span>
                  )}
                  {ignoredIn > 0 && (
                    <IgnoredBadge label={allIgnored || !canManage ? "Ignored" : `Ignored ${ignoredIn}/${selectedDatasetCount}`} />
                  )}
                  <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
                <span className="text-xs text-muted-foreground">{TARGETING_LABELS[spell.targeting]}</span>
                <span
                  className="truncate text-right text-xs text-muted-foreground"
                  title={spell.effects.map((effect) => `${effectLabel(effect)} (${effect.effect}/${effect.aura_effect})`).join(", ")}
                >
                  {spell.effects.map(effectLabel).join(", ")}
                </span>
                </Link>
                {canManage ? (
                  <button
                    type="button"
                    aria-label={`Manage ignored datasets for ${spell.name}`}
                    title="Manage ignored datasets"
                    disabled={selectedDatasetCount === 0}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      const rect = event.currentTarget.getBoundingClientRect();
                      openMenuAt(rect.right, rect.bottom, spell);
                    }}
                    className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground opacity-50 hover:bg-muted hover:text-foreground hover:opacity-100 focus-visible:opacity-100 disabled:cursor-not-allowed disabled:opacity-20"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                ) : <span />}
              </div>
            );
          })
        )}
      </Card>
      {menu && (
        <ClassBuffMenu
          menu={menu}
          pending={setIgnores.isPending}
          onApply={applyIgnore}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
