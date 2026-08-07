import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Check, ExternalLink, FlaskConical, Layers3, RotateCcw, Search, ShieldCheck, Sparkles, EyeOff } from "lucide-react";
import { Card } from "@/components/ui/Card/Card";
import { SpellIdTooltip } from "@/components/ui/SpellIdTooltip/SpellIdTooltip";
import { HintTooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip/tooltip";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { iconUrl } from "@/config/iconUrl";
import { useDatasetId, useIconBaseUrl } from "@/hooks/useDatasetId";

import { useAuth } from "@/hooks/useAuth";
import {
  DEFAULT_DATASET_ID,
  useAuthorizationCheck,
  useConsumableDisambiguations,
  useConsumableEffectPolicies,
  useDatasets,
  useDeleteConsumableDisambiguation,
  useIgnoreConsumableEffect,
  useSetConsumableDisambiguation,
  useSiteConfig,
} from "@/api/queries";
import type { ConsumableEffectKind, ConsumableEffectPolicy, Dataset } from "@/api/typesGenerated";
import { toast } from "sonner";
import {
  buildCommonConsumableEffects,
  type CommonConsumableEffect,
  type ConsumableBuff,
  type ConsumableEntry,
} from "./commonConsumables";

const QUALITY_COLORS: Record<number, string> = {
  0: "text-quality-poor",
  1: "text-quality-common",
  2: "text-quality-uncommon",
  3: "text-quality-rare",
  4: "text-quality-epic",
  5: "text-quality-legendary",
  6: "text-quality-artifact",
};

function useConsumables() {
  const datasetId = useDatasetId();
  return useQuery({
    queryKey: ["wowdb", "consumables", datasetId ?? "default"],
    queryFn: async () => {
      const params = datasetId ? `?dataset_id=${encodeURIComponent(datasetId)}` : "";
      const response = await fetch(`/api/v1/wowdb/consumables${params}`);
      if (!response.ok) throw new Error("Failed to fetch consumables");
      return response.json() as Promise<ConsumableEntry[]>;
    },
    staleTime: 5 * 60 * 1000,
  });
}

type ViewMode = "item" | "buff" | "spellcast";

interface BuffGroup extends ConsumableBuff {
  items: ConsumableEntry[];
}

interface SpellcastGroup {
  spellId: number;
  items: ConsumableEntry[];
}

interface EffectMenuState {
  x: number;
  y: number;
  effectKind: ConsumableEffectKind;
  spellId: number;
  spellName: string;
  items: ConsumableEntry[];
}

function effectKey(effectKind: ConsumableEffectKind, spellId: number): string {
  return `${effectKind}:${spellId}`;
}

function EffectStatus({ policy, ambiguous }: { policy?: ConsumableEffectPolicy; ambiguous: boolean }) {
  if (policy?.ignored) {
    return <span className="rounded-full border border-zinc-500/30 bg-zinc-500/10 px-2 py-0.5 text-[10px] font-medium text-zinc-400">Ignored</span>;
  }
  if (policy?.item_id !== undefined) {
    return <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">Canonical #{policy.item_id}</span>;
  }
  if (ambiguous) {
    return <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300">Ambiguous</span>;
  }
  return null;
}

function ConsumableEffectMenu({
  menu,
  policy,
  pending,
  onCanonical,
  onReset,
  onIgnore,
  onClose,
}: {
  menu: EffectMenuState;
  policy?: ConsumableEffectPolicy;
  pending: boolean;
  onCanonical: (itemId: number) => void;
  onReset: () => void;
  onIgnore: () => void;
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
      className="fixed z-[100] w-80 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-2xl"
      style={{ left: Math.min(menu.x, window.innerWidth - 336), top: Math.min(menu.y, window.innerHeight - 360) }}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="border-b border-border bg-muted/35 px-3 py-2.5">
        <div className="text-xs font-semibold">{menu.spellName || `Spell ${menu.spellId}`}</div>
        <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
          {menu.effectKind === "buff" ? "Buff / aura" : "Spellcast"} · #{menu.spellId}
        </div>
      </div>
      <div className="p-1.5">
        <div className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Mark canonical
        </div>
        <div className="max-h-48 overflow-y-auto styled-scrollbar">
          {menu.items.map((item) => (
            <button
              key={item.item_id}
              type="button"
              disabled={pending}
              onClick={() => onCanonical(item.item_id)}
              className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left text-xs hover:bg-accent disabled:opacity-50"
            >
              <span className="truncate">{item.item_name}</span>
              <span className="flex shrink-0 items-center gap-1 font-mono text-[10px] text-muted-foreground">
                {policy?.item_id === item.item_id && <Check className="h-3 w-3 text-emerald-400" />}
                #{item.item_id}
              </span>
            </button>
          ))}
        </div>
        <div className="my-1.5 border-t border-border" />
        <button
          type="button"
          disabled={pending || !policy}
          onClick={onReset}
          className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs hover:bg-accent disabled:opacity-40"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset canonical
        </button>
        <button
          type="button"
          disabled={pending || policy?.ignored}
          onClick={onIgnore}
          className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
        >
          <EyeOff className="h-3.5 w-3.5" />
          Ignore
        </button>
      </div>
    </div>
  );
}

function matchesItem(consumable: ConsumableEntry, query: string): boolean {
  return (
    consumable.item_name.toLowerCase().includes(query) ||
    consumable.item_id.toString().includes(query) ||
    consumable.item_spell_ids.some((id) => id.toString().includes(query)) ||
    consumable.buffs.some(
      (buff) => buff.name.toLowerCase().includes(query) || buff.id.toString().includes(query),
    )
  );
}

function ItemReference({
  consumable,
  iconBaseUrl,
  compact = false,
}: {
  consumable: ConsumableEntry;
  iconBaseUrl?: string;
  compact?: boolean;
}) {
  return (
    <Link
      to={`/wowdb/item?id=${consumable.item_id}`}
      className={`group flex min-w-0 items-center gap-2 ${compact ? "rounded-md border border-border/60 bg-muted/30 px-2 py-1" : ""}`}
    >
      {consumable.item_icon ? (
        <img
          src={iconUrl(consumable.item_icon, iconBaseUrl)}
          alt=""
          className={`${compact ? "h-6 w-6" : "h-8 w-8"} rounded border border-border/70 bg-black/30`}
          loading="lazy"
        />
      ) : (
        <div
          className={`flex ${compact ? "h-6 w-6" : "h-8 w-8"} items-center justify-center rounded border border-border/70 bg-muted`}
        >
          <FlaskConical className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      )}
      <div className="min-w-0">
        <div
          className={`truncate font-medium ${compact ? "text-xs" : "text-sm"} ${QUALITY_COLORS[consumable.item_quality] ?? ""}`}
        >
          {consumable.item_name}
        </div>
        <div className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
          {consumable.item_id}
          <ExternalLink className="h-2.5 w-2.5 opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
      </div>
    </Link>
  );
}

function SpellReference({ spellId, name }: { spellId: number; name?: string }) {
  return (
    <Link
      to={`/wowdb/spell/${spellId}`}
      className="inline-flex rounded-md border border-border/60 bg-muted/40 px-2 py-1 text-muted-foreground hover:text-foreground"
    >
      <SpellIdTooltip
        spellId={spellId}
        name={name ?? spellId.toString()}
        size={14}
        className={name ? "text-xs" : "font-mono text-[11px]"}
      />
    </Link>
  );
}

function CommonPolicyLabel({ effect, datasetId }: { effect: CommonConsumableEffect; datasetId: string }) {
  const dataset = effect.datasets.find((entry) => entry.datasetId === datasetId);
  const policy = dataset?.policy;
  if (policy?.ignored) return <span className="text-zinc-400">Ignored</span>;
  if (policy?.item_id !== undefined) {
    const item = dataset?.candidates.find((candidate) => candidate.item_id === policy.item_id);
    return <span className="text-emerald-300">{item?.item_name ?? `Item #${policy.item_id}`}</span>;
  }
  return <span className="text-amber-300">Unresolved</span>;
}

function commonPolicy(effect: CommonConsumableEffect): ConsumableEffectPolicy | undefined {
  const policies = effect.datasets.map((dataset) => dataset.policy);
  const first = policies[0];
  if (!first || policies.some((policy) =>
    !policy || policy.ignored !== first.ignored || policy.item_id !== first.item_id,
  )) return undefined;
  return first;
}

function isCommonEffectAmbiguous(effect: CommonConsumableEffect): boolean {
  const policyStates = new Set(effect.datasets.map((dataset) => {
    if (dataset.policy?.ignored) return "ignored";
    if (dataset.policy?.item_id !== undefined) return `item:${dataset.policy.item_id}`;
    return "unresolved";
  }));
  return !effect.candidateSetsIdentical
    || effect.commonCandidates.length === 0
    || policyStates.size > 1
    || effect.datasets.some((dataset) => dataset.candidates.length > 1 && !dataset.policy);
}

function CandidateDifferencesTooltip({
  effect,
  datasetById,
}: {
  effect: CommonConsumableEffect;
  datasetById: Map<string, Dataset>;
}) {
  const commonItemIds = new Set(effect.commonCandidates.map((item) => item.item_id));

  return (
    <HintTooltip delayDuration={150}>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.stopPropagation()}
          className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-300 hover:border-amber-400/50 hover:bg-amber-500/15"
          aria-label="Show candidate list differences"
        >
          <AlertTriangle className="h-3 w-3" /> Lists differ
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={6} className="w-96 max-w-[calc(100vw-2rem)] p-3 text-left">
        <div className="mb-2 font-semibold">Candidate differences</div>
        {effect.commonCandidates.length > 0 && (
          <div className="mb-2">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide opacity-70">Common to all</div>
            <div className="flex flex-wrap gap-1">
              {effect.commonCandidates.map((item) => (
                <span key={item.item_id} className="rounded bg-background/15 px-1.5 py-0.5">
                  {item.item_name} #{item.item_id}
                </span>
              ))}
            </div>
          </div>
        )}
        <div className="space-y-2">
          {effect.datasets.map((dataset) => {
            const extras = dataset.candidates.filter((item) => !commonItemIds.has(item.item_id));
            return (
              <div key={dataset.datasetId}>
                <div className="font-medium">{datasetById.get(dataset.datasetId)?.name ?? dataset.datasetId}</div>
                {dataset.candidates.length === 0 ? (
                  <div className="text-destructive-foreground/80">Effect is not present in this dataset.</div>
                ) : extras.length === 0 ? (
                  <div className="opacity-70">No dataset-specific candidates.</div>
                ) : (
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {extras.map((item) => (
                      <span key={item.item_id} className="rounded bg-amber-950/30 px-1.5 py-0.5 text-amber-100">
                        {item.item_name} #{item.item_id}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {effect.conflictingItemIds.length > 0 && (
          <div className="mt-2 border-t border-background/20 pt-2 text-amber-200">
            Same item ID has different names across datasets: {effect.conflictingItemIds.map((id) => `#${id}`).join(", ")}.
          </div>
        )}
      </TooltipContent>
    </HintTooltip>
  );
}

function MultiDatasetConsumablesView({
  datasets,
  selectedDatasetIds,
  view,
  search,
  showAmbiguous,
  showIgnored,
}: {
  datasets: Dataset[];
  selectedDatasetIds: string[];
  view: Exclude<ViewMode, "item">;
  search: string;
  showAmbiguous: boolean;
  showIgnored: boolean;
}) {
  const [effectMenu, setEffectMenu] = useState<EffectMenuState | null>(null);
  const selectedDatasets = useMemo(
    () => datasets.filter((dataset) => selectedDatasetIds.includes(dataset.id)),
    [datasets, selectedDatasetIds],
  );
  const consumableQueries = useQueries({
    queries: selectedDatasets.map((dataset) => ({
      queryKey: ["wowdb", "consumables", dataset.id],
      queryFn: async () => {
        const response = await fetch(`/api/v1/wowdb/consumables?dataset_id=${encodeURIComponent(dataset.id)}`);
        if (!response.ok) throw new Error(`Failed to fetch consumables for ${dataset.name}`);
        return response.json() as Promise<ConsumableEntry[]>;
      },
      staleTime: 5 * 60 * 1000,
    })),
  });
  const policyQueries = useQueries({
    queries: selectedDatasets.map((dataset) => ({
      queryKey: ["consumable-disambiguations", dataset.id, "admin"],
      queryFn: async () => {
        const response = await fetch(`/api/v1/game-data/datasets/${dataset.id}/consumable-disambiguations`);
        if (!response.ok) throw new Error(`Failed to fetch consumable policies for ${dataset.name}`);
        return response.json() as Promise<ConsumableEffectPolicy[]>;
      },
    })),
  });
  const saveCanonical = useSetConsumableDisambiguation();
  const resetCanonical = useDeleteConsumableDisambiguation();
  const ignoreEffect = useIgnoreConsumableEffect();
  const pending = saveCanonical.isPending || resetCanonical.isPending || ignoreEffect.isPending;

  const isLoading = consumableQueries.some((queryResult) => queryResult.isLoading)
    || policyQueries.some((queryResult) => queryResult.isLoading);
  const queryError = consumableQueries.find((queryResult) => queryResult.error)?.error
    ?? policyQueries.find((queryResult) => queryResult.error)?.error;
  const effects = useMemo(() => {
    if (isLoading || queryError) return [];
    return buildCommonConsumableEffects(selectedDatasets.map((dataset, index) => ({
      datasetId: dataset.id,
      consumables: consumableQueries[index].data ?? [],
      policies: policyQueries[index].data ?? [],
    })));
  }, [consumableQueries, isLoading, policyQueries, queryError, selectedDatasets]);
  const datasetById = useMemo(() => new Map(datasets.map((dataset) => [dataset.id, dataset])), [datasets]);
  const query = search.trim().toLowerCase();
  const effectKind: ConsumableEffectKind = view === "buff" ? "buff" : "direct";
  const visibleEffects = effects.filter((effect) => {
    if (effect.effectKind !== effectKind) return false;
    if (!showIgnored && effect.datasets.every((dataset) => dataset.policy?.ignored)) return false;
    if (showAmbiguous && !isCommonEffectAmbiguous(effect)) return false;
    return !query
      || effect.spellName.toLowerCase().includes(query)
      || effect.spellId.toString().includes(query)
      || effect.datasets.some((dataset) => dataset.candidates.some((candidate) => matchesItem(candidate, query)));
  });
  const selectedEffect = effectMenu
    ? effects.find((effect) => effect.effectKind === effectMenu.effectKind && effect.spellId === effectMenu.spellId)
    : undefined;

  const runForSelectedDatasets = async (
    effect: CommonConsumableEffect,
    operation: (datasetId: string) => Promise<unknown>,
    successMessage: string,
  ) => {
    const results = await Promise.allSettled(effect.datasets.map((dataset) => operation(dataset.datasetId)));
    const failed = results.filter((result) => result.status === "rejected").length;
    const succeeded = results.length - failed;
    if (succeeded > 0) toast.success(`${successMessage} for ${succeeded} dataset${succeeded === 1 ? "" : "s"}`);
    if (failed > 0) toast.error(`Failed for ${failed} dataset${failed === 1 ? "" : "s"}`);
    setEffectMenu(null);
  };

  const handleCanonical = async (itemId: number) => {
    if (!selectedEffect) return;
    const replacements = selectedEffect.datasets.filter((dataset) =>
      dataset.policy?.ignored || (dataset.policy?.item_id !== undefined && dataset.policy.item_id !== itemId),
    ).length;
    if (replacements > 0 && !window.confirm(
      `Apply item #${itemId} to ${selectedEffect.datasets.length} datasets? This replaces ${replacements} existing decision${replacements === 1 ? "" : "s"}.`,
    )) return;
    await runForSelectedDatasets(
      selectedEffect,
      (datasetId) => saveCanonical.mutateAsync({ datasetId, effectKind: selectedEffect.effectKind, spellId: selectedEffect.spellId, itemId }),
      "Canonical consumable updated",
    );
  };

  const handleReset = async () => {
    if (!selectedEffect) return;
    await runForSelectedDatasets(
      selectedEffect,
      (datasetId) => resetCanonical.mutateAsync({ datasetId, effectKind: selectedEffect.effectKind, spellId: selectedEffect.spellId }),
      "Canonical consumable reset",
    );
  };

  const handleIgnore = async () => {
    if (!selectedEffect) return;
    await runForSelectedDatasets(
      selectedEffect,
      (datasetId) => ignoreEffect.mutateAsync({ datasetId, effectKind: selectedEffect.effectKind, spellId: selectedEffect.spellId }),
      "Consumable effect ignored",
    );
  };

  if (queryError) return <Card className="p-8 text-center text-sm text-destructive">{queryError.message}</Card>;
  if (isLoading) return <Card className="p-8 text-center text-sm text-muted-foreground">Loading {selectedDatasets.length} datasets…</Card>;

  return (
    <>
      <Card className="max-h-[75vh] divide-y divide-border/30 overflow-auto styled-scrollbar">
        <div className="sticky top-0 z-10 grid grid-cols-[80px_minmax(240px,0.8fr)_minmax(0,1.8fr)] bg-muted/70 px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground backdrop-blur">
          <span>{view === "buff" ? "Buff ID" : "Spell ID"}</span>
          <span>{view === "buff" ? "Applied buff" : "Item spell"}</span>
          <span>Consumable items across {selectedDatasets.length} datasets</span>
        </div>
        {visibleEffects.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No matching shared {view === "buff" ? "buffs" : "spellcasts"} found.</div>
        ) : visibleEffects.map((effect) => {
          const consensus = commonPolicy(effect);
          const warning = !effect.candidateSetsIdentical || effect.missingDatasetIds.length > 0 || effect.conflictingItemIds.length > 0;
          return (
            <div
              key={effectKey(effect.effectKind, effect.spellId)}
              onContextMenu={(event) => {
                event.preventDefault();
                setEffectMenu({
                  x: event.clientX,
                  y: event.clientY,
                  effectKind: effect.effectKind,
                  spellId: effect.spellId,
                  spellName: effect.spellName,
                  items: effect.commonCandidates,
                });
              }}
              title="Right-click to manage the canonical item across selected datasets"
              className={`grid grid-cols-[80px_minmax(240px,0.8fr)_minmax(0,1.8fr)] items-start px-3 py-2.5 hover:bg-muted/35 ${effect.datasets.every((dataset) => dataset.policy?.ignored) ? "opacity-55" : ""}`}
            >
              <span className="pt-1 font-mono text-xs text-muted-foreground">{effect.spellId}</span>
              <div className="flex flex-wrap items-center gap-1.5">
                {view === "buff" && <Sparkles className="h-3.5 w-3.5 text-primary" />}
                <SpellReference spellId={effect.spellId} name={view === "buff" ? effect.spellName : undefined} />
                <EffectStatus policy={consensus} ambiguous={isCommonEffectAmbiguous(effect)} />
                {warning && <CandidateDifferencesTooltip effect={effect} datasetById={datasetById} />}
              </div>
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {effect.commonCandidates.length === 0 ? (
                    <span className="text-xs text-destructive">No candidate is present in every selected dataset</span>
                  ) : effect.commonCandidates.map((item) => (
                    <div key={item.item_id} className={consensus?.item_id === item.item_id ? "rounded-md ring-1 ring-emerald-400/60" : ""}>
                      <ItemReference consumable={item} iconBaseUrl={selectedDatasets[0]?.icon_base_url} compact />
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                  {effect.datasets.map((dataset) => (
                    <span key={dataset.datasetId}>
                      <strong className="text-foreground/80">{datasetById.get(dataset.datasetId)?.name ?? dataset.datasetId}:</strong>{" "}
                      <CommonPolicyLabel effect={effect} datasetId={dataset.datasetId} />
                      {!effect.candidateSetsIdentical && ` · ${dataset.candidates.length} candidates`}
                    </span>
                  ))}
                </div>
                {effect.conflictingItemIds.length > 0 && (
                  <div className="text-[10px] text-amber-300">Conflicting item names: {effect.conflictingItemIds.map((id) => `#${id}`).join(", ")}</div>
                )}
              </div>
            </div>
          );
        })}
      </Card>
      {effectMenu && selectedEffect && (
        <ConsumableEffectMenu
          menu={effectMenu}
          policy={commonPolicy(selectedEffect)}
          pending={pending}
          onCanonical={handleCanonical}
          onReset={handleReset}
          onIgnore={handleIgnore}
          onClose={() => setEffectMenu(null)}
        />
      )}
    </>
  );
}

export function ConsumablesPage() {
  const [search, setSearch] = useState("");
  const [view, setView] = useState<ViewMode>("item");
  const [showAmbiguous, setShowAmbiguous] = useState(false);
  const [showIgnored, setShowIgnored] = useState(false);
  const [effectMenu, setEffectMenu] = useState<EffectMenuState | null>(null);
  const [bulkIgnorePending, setBulkIgnorePending] = useState(false);
  const [selectedDatasetIds, setSelectedDatasetIds] = useState<string[]>([DEFAULT_DATASET_ID]);
  const iconBaseUrl = useIconBaseUrl();
  const datasetId = useDatasetId();
  const { data: siteConfig } = useSiteConfig();
  const { data: datasets } = useDatasets();
  const { isAuthenticated } = useAuth();
  const consumablesAuthzCheck = useMemo(() => ({ manageConsumables: "chronicle:chronicle#admin_consumables" }), []);
  const worldDataAuthzCheck = useMemo(() => ({ adminWorldData: "chronicle:chronicle#admin_world_data" }), []);
  const { data: consumablesAuthorization } = useAuthorizationCheck(consumablesAuthzCheck, { enabled: isAuthenticated });
  const { data: worldDataAuthorization } = useAuthorizationCheck(worldDataAuthzCheck, { enabled: isAuthenticated });
  const canManageConsumables = (consumablesAuthorization?.manageConsumables ?? false)
    || (worldDataAuthorization?.adminWorldData ?? false);
  const canCompareDatasets = siteConfig?.tenant === null && canManageConsumables && (datasets?.length ?? 0) > 1;
  const multiDatasetMode = canCompareDatasets && selectedDatasetIds.length > 1;
  const { data: disambiguations } = useConsumableDisambiguations(datasetId);
  const { data: policies } = useConsumableEffectPolicies(datasetId, canManageConsumables);
  const policyMap = useMemo(() => {
    const entries = new Map<string, ConsumableEffectPolicy>();
    for (const disambiguation of disambiguations ?? []) {
      entries.set(effectKey(disambiguation.effect_kind, disambiguation.spell_id), {
        effect_kind: disambiguation.effect_kind,
        spell_id: disambiguation.spell_id,
        item_id: disambiguation.item_id,
        ignored: false,
      });
    }
    for (const policy of policies ?? []) {
      entries.set(effectKey(policy.effect_kind, policy.spell_id), policy);
    }
    return entries;
  }, [disambiguations, policies]);
  const saveCanonical = useSetConsumableDisambiguation();
  const resetCanonical = useDeleteConsumableDisambiguation();
  const ignoreEffect = useIgnoreConsumableEffect();
  const policyPending = saveCanonical.isPending || resetCanonical.isPending || ignoreEffect.isPending;
  const { data, isLoading, error } = useConsumables();
  const consumables = useMemo(() => data ?? [], [data]);

  const buffGroups = useMemo<BuffGroup[]>(() => {
    const byBuff = new Map<number, BuffGroup>();
    for (const item of consumables) {
      for (const buff of item.buffs) {
        const group = byBuff.get(buff.id);
        if (group) {
          group.items.push(item);
        } else {
          byBuff.set(buff.id, { ...buff, items: [item] });
        }
      }
    }
    return [...byBuff.values()].sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);
  }, [consumables]);

  const spellcastGroups = useMemo<SpellcastGroup[]>(() => {
    const bySpellcast = new Map<number, SpellcastGroup>();
    for (const item of consumables) {
      for (const spellId of item.item_spell_ids) {
        const group = bySpellcast.get(spellId);
        if (group) {
          group.items.push(item);
        } else {
          bySpellcast.set(spellId, { spellId, items: [item] });
        }
      }
    }
    return [...bySpellcast.values()].sort((a, b) => a.spellId - b.spellId);
  }, [consumables]);

  const query = search.trim().toLowerCase();
  const filteredItems = useMemo(
    () => (query ? consumables.filter((item) => matchesItem(item, query)) : consumables),
    [consumables, query],
  );
  const filteredBuffs = buffGroups.filter((buff) => {
    const policy = policyMap.get(effectKey("buff", buff.id));
    if (canManageConsumables && policy?.ignored && !showIgnored) return false;
    const unresolvedAmbiguity = buff.items.length > 1 && !policy?.ignored && policy?.item_id === undefined;
    if (canManageConsumables && showAmbiguous && !unresolvedAmbiguity) return false;
    return !query
      || buff.name.toLowerCase().includes(query)
      || buff.id.toString().includes(query)
      || buff.items.some((item) => matchesItem(item, query));
  });
  const filteredSpellcasts = spellcastGroups.filter((spellcast) => {
    const policy = policyMap.get(effectKey("direct", spellcast.spellId));
    if (canManageConsumables && policy?.ignored && !showIgnored) return false;
    const unresolvedAmbiguity = spellcast.items.length > 1 && !policy?.ignored && policy?.item_id === undefined;
    if (canManageConsumables && showAmbiguous && !unresolvedAmbiguity) return false;
    return !query
      || spellcast.spellId.toString().includes(query)
      || spellcast.items.some((item) => matchesItem(item, query));
  });

  const bulkIgnoreTargets = view === "buff"
    ? filteredBuffs
      .filter((buff) => buff.items.length > 1 && !policyMap.has(effectKey("buff", buff.id)))
      .map((buff) => ({ effectKind: "buff" as const, spellId: buff.id }))
    : view === "spellcast"
      ? filteredSpellcasts
        .filter((spellcast) => spellcast.items.length > 1 && !policyMap.has(effectKey("direct", spellcast.spellId)))
        .map((spellcast) => ({ effectKind: "direct" as const, spellId: spellcast.spellId }))
      : [];

  const openEffectMenu = (
    event: MouseEvent<HTMLElement>,
    effectKind: ConsumableEffectKind,
    spellId: number,
    spellName: string,
    items: ConsumableEntry[],
  ) => {
    if (!canManageConsumables) return;
    event.preventDefault();
    setEffectMenu({ x: event.clientX, y: event.clientY, effectKind, spellId, spellName, items });
  };

  const closeEffectMenu = () => setEffectMenu(null);
  const selectedPolicy = effectMenu ? policyMap.get(effectKey(effectMenu.effectKind, effectMenu.spellId)) : undefined;
  const handleCanonical = (itemId: number) => {
    if (!effectMenu || !datasetId) return;
    saveCanonical.mutate(
      { datasetId, effectKind: effectMenu.effectKind, spellId: effectMenu.spellId, itemId },
      {
        onSuccess: () => { toast.success("Canonical consumable updated"); closeEffectMenu(); },
        onError: (mutationError) => toast.error(mutationError.message),
      },
    );
  };
  const handleReset = () => {
    if (!effectMenu || !datasetId) return;
    resetCanonical.mutate(
      { datasetId, effectKind: effectMenu.effectKind, spellId: effectMenu.spellId },
      {
        onSuccess: () => { toast.success("Canonical consumable reset"); closeEffectMenu(); },
        onError: (mutationError) => toast.error(mutationError.message),
      },
    );
  };
  const handleIgnore = () => {
    if (!effectMenu || !datasetId) return;
    ignoreEffect.mutate(
      { datasetId, effectKind: effectMenu.effectKind, spellId: effectMenu.spellId },
      {
        onSuccess: () => { toast.success("Consumable effect ignored"); closeEffectMenu(); },
        onError: (mutationError) => toast.error(mutationError.message),
      },
    );
  };

  const handleBulkIgnore = async () => {
    if (!datasetId || bulkIgnoreTargets.length === 0 || bulkIgnorePending) return;
    const confirmed = window.confirm(
      `Ignore ${bulkIgnoreTargets.length} visible ambiguous consumable effect${bulkIgnoreTargets.length === 1 ? "" : "s"}?`,
    );
    if (!confirmed) return;

    setBulkIgnorePending(true);
    const results = await Promise.allSettled(
      bulkIgnoreTargets.map((target) => ignoreEffect.mutateAsync({ datasetId, ...target })),
    );
    setBulkIgnorePending(false);

    const failed = results.filter((result) => result.status === "rejected").length;
    const ignored = results.length - failed;
    if (ignored > 0) toast.success(`Ignored ${ignored} consumable effect${ignored === 1 ? "" : "s"}`);
    if (failed > 0) toast.error(`Failed to ignore ${failed} consumable effect${failed === 1 ? "" : "s"}`);
  };

  const toggleDatasetScope = (targetDatasetId: string) => {
    const next = selectedDatasetIds.includes(targetDatasetId)
      ? selectedDatasetIds.filter((id) => id !== targetDatasetId)
      : [...selectedDatasetIds, targetDatasetId];
    if (next.length < 2 && selectedDatasetIds.length > 1) return;
    setSelectedDatasetIds(next.length === 0 ? [DEFAULT_DATASET_ID] : next);
    if (next.length > 1 && view === "item") setView("buff");
  };

  const visibleCount =
    view === "item"
      ? filteredItems.length
      : view === "buff"
        ? filteredBuffs.length
        : filteredSpellcasts.length;

  return (
    <div className="container mx-auto max-w-6xl px-4 py-4">
      <Link
        to="/technical"
        className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" />
        Back
      </Link>

      <div className="mb-1 flex flex-wrap items-center gap-2">
        <FlaskConical className="h-5 w-5" />
        <h1 className="text-xl font-bold">Consumables</h1>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {consumables.length.toLocaleString()} items
        </span>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
          {buffGroups.length.toLocaleString()} unique buffs
        </span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {spellcastGroups.length.toLocaleString()} item spells
        </span>
      </div>

      <p className="mb-4 text-xs text-muted-foreground">
        {multiDatasetMode
          ? "Comparing overlapping consumable effects across selected datasets. Combined choices are restricted to candidates shared by every selected dataset."
          : "Generated from the current tenant's item and spell dataset. Item spells are the root spells attached to an item and are candidates for cast evidence; their trigger chains are followed to find applied buffs. A combat-log item ID remains stronger evidence than the spell alone."}
      </p>

      {canCompareDatasets && (
        <Card className="mb-4 border-sky-500/20 bg-sky-500/[0.04] p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Layers3 className="h-4 w-4 text-sky-400" />
              Dataset scope
              <span className="text-xs font-normal text-muted-foreground">
                {multiDatasetMode ? `${selectedDatasetIds.length} datasets selected` : "Current dataset only"}
              </span>
            </div>
            <div className="flex gap-1.5 text-xs">
              <button
                type="button"
                onClick={() => setSelectedDatasetIds([DEFAULT_DATASET_ID])}
                className="rounded border border-border px-2 py-1 hover:bg-muted"
              >
                Current only
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedDatasetIds((datasets ?? []).map((dataset) => dataset.id));
                  if (view === "item") setView("buff");
                }}
                className="rounded border border-border px-2 py-1 hover:bg-muted"
              >
                Select all
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {(datasets ?? []).map((dataset) => (
              <label key={dataset.id} className="flex cursor-pointer items-center gap-2 rounded-md border border-border/70 bg-background/70 px-2.5 py-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={selectedDatasetIds.includes(dataset.id)}
                  disabled={multiDatasetMode && selectedDatasetIds.length === 2 && selectedDatasetIds.includes(dataset.id)}
                  onChange={() => toggleDatasetScope(dataset.id)}
                  className="accent-sky-500"
                />
                <span className="font-medium">{dataset.name}</span>
                <span className="text-[10px] text-muted-foreground">{dataset.wow_version}</span>
              </label>
            ))}
          </div>
          {multiDatasetMode && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              The existing Buff and Spellcast tabs now operate across this selection. Right-click a row to apply a common decision.
            </p>
          )}
        </Card>
      )}

      {canManageConsumables && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-sky-500/20 bg-sky-500/[0.06] px-3 py-2.5">
          <div className="flex items-center gap-2 text-xs text-sky-100">
            <ShieldCheck className="h-4 w-4 text-sky-400" />
            <span>
              <strong>Consumable manager:</strong> right-click a buff or spellcast row to set its canonical item{multiDatasetMode ? " across the selected datasets" : ""}.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border/70 bg-background/60 px-2.5 py-1.5 text-xs">
              <input
                type="checkbox"
                checked={showAmbiguous}
                onChange={(event) => setShowAmbiguous(event.target.checked)}
                className="accent-amber-500"
              />
              Show only ambiguous
            </label>
            {view !== "item" && !multiDatasetMode && (
              <button
                type="button"
                disabled={bulkIgnorePending || bulkIgnoreTargets.length === 0}
                onClick={handleBulkIgnore}
                className="flex items-center gap-1.5 rounded-md border border-zinc-500/30 bg-zinc-500/10 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-zinc-500/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <EyeOff className="h-3.5 w-3.5" />
                {bulkIgnorePending ? "Ignoring..." : `Ignore visible ambiguous (${bulkIgnoreTargets.length})`}
              </button>
            )}
            <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border/70 bg-background/60 px-2.5 py-1.5 text-xs">
              <input
                type="checkbox"
                checked={showIgnored}
                onChange={(event) => setShowIgnored(event.target.checked)}
                className="accent-zinc-500"
              />
              Show ignored
            </label>
          </div>
        </div>
      )}

      <Tabs value={view} onValueChange={(value) => setView(value as ViewMode)}>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <TabsList>
            <TabsTrigger value="item" disabled={multiDatasetMode}>By Item</TabsTrigger>
            <TabsTrigger value="buff">By Buff</TabsTrigger>
            <TabsTrigger value="spellcast">By Spellcast</TabsTrigger>
          </TabsList>
          <div className="relative min-w-64 flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search item, buff, or spell ID..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full rounded-md border bg-background py-1.5 pl-8 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          {search && !multiDatasetMode && (
            <span className="text-xs text-muted-foreground">{visibleCount} results</span>
          )}
        </div>

        {view === "item" && !multiDatasetMode && (
          <Card className="max-h-[75vh] divide-y divide-border/30 overflow-auto styled-scrollbar">
            <div className="sticky top-0 z-10 grid grid-cols-[72px_minmax(220px,1fr)_minmax(180px,0.8fr)_minmax(260px,1.2fr)] bg-muted/70 px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground backdrop-blur">
              <span>Item ID</span>
              <span>Consumable</span>
              <span>Item spellcasts</span>
              <span>Applied buffs</span>
            </div>
            {renderState(isLoading, error, filteredItems.length, "items", () =>
              filteredItems.map((item) => (
                <div
                  key={item.item_id}
                  className="grid grid-cols-[72px_minmax(220px,1fr)_minmax(180px,0.8fr)_minmax(260px,1.2fr)] items-start px-3 py-2.5 hover:bg-muted/35"
                >
                  <span className="pt-1 font-mono text-xs text-muted-foreground">{item.item_id}</span>
                  <ItemReference consumable={item} iconBaseUrl={iconBaseUrl} />
                  <div className="flex flex-wrap gap-1 pr-3">
                    {item.item_spell_ids.map((spellId) => (
                      <SpellReference key={spellId} spellId={spellId} />
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {item.buffs.length === 0 ? (
                      <span className="pt-1 text-xs text-muted-foreground">No applied aura found</span>
                    ) : (
                      item.buffs.map((buff) => (
                        <SpellReference key={buff.id} spellId={buff.id} name={buff.name} />
                      ))
                    )}
                  </div>
                </div>
              )),
            )}
          </Card>
        )}

        {view === "buff" && !multiDatasetMode && (
          <Card className="max-h-[75vh] divide-y divide-border/30 overflow-auto styled-scrollbar">
            <div className="sticky top-0 z-10 grid grid-cols-[80px_minmax(240px,0.8fr)_minmax(0,1.8fr)] bg-muted/70 px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground backdrop-blur">
              <span>Buff ID</span>
              <span>Applied buff</span>
              <span>Consumable items</span>
            </div>
            {renderState(isLoading, error, filteredBuffs.length, "buffs", () =>
              filteredBuffs.map((buff) => {
                const policy = policyMap.get(effectKey("buff", buff.id));
                return (
                  <div
                    key={buff.id}
                    onContextMenu={(event) => openEffectMenu(event, "buff", buff.id, buff.name, buff.items)}
                    title={canManageConsumables ? "Right-click to manage the canonical item" : undefined}
                    className={`grid grid-cols-[80px_minmax(240px,0.8fr)_minmax(0,1.8fr)] items-start px-3 py-2.5 hover:bg-muted/35 ${policy?.ignored ? "opacity-55" : ""}`}
                  >
                    <span className="pt-1 font-mono text-xs text-muted-foreground">{buff.id}</span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                      <SpellReference spellId={buff.id} name={buff.name} />
                      <EffectStatus policy={policy} ambiguous={canManageConsumables && buff.items.length > 1} />
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {buff.items.map((item) => (
                        <div
                          key={item.item_id}
                          className={policy?.item_id === item.item_id ? "rounded-md ring-1 ring-emerald-400/60" : ""}
                        >
                          <ItemReference consumable={item} iconBaseUrl={iconBaseUrl} compact />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              }),
            )}
          </Card>
        )}

        {view === "spellcast" && !multiDatasetMode && (
          <Card className="max-h-[75vh] divide-y divide-border/30 overflow-auto styled-scrollbar">
            <div className="sticky top-0 z-10 grid grid-cols-[80px_minmax(220px,0.8fr)_minmax(0,1.3fr)_minmax(240px,1fr)] bg-muted/70 px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground backdrop-blur">
              <span>Spell ID</span>
              <span>Item spell</span>
              <span>Consumable items</span>
              <span>Applied buffs</span>
            </div>
            {renderState(isLoading, error, filteredSpellcasts.length, "spellcasts", () =>
              filteredSpellcasts.map((spellcast) => {
                const policy = policyMap.get(effectKey("direct", spellcast.spellId));
                const buffs = Array.from(
                  new Map(
                    spellcast.items.flatMap((item) => item.buffs).map((buff) => [buff.id, buff]),
                  ).values(),
                ).sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);
                return (
                  <div
                    key={spellcast.spellId}
                    onContextMenu={(event) => openEffectMenu(event, "direct", spellcast.spellId, `Spell ${spellcast.spellId}`, spellcast.items)}
                    title={canManageConsumables ? "Right-click to manage the canonical item" : undefined}
                    className={`grid grid-cols-[80px_minmax(220px,0.8fr)_minmax(0,1.3fr)_minmax(240px,1fr)] items-start px-3 py-2.5 hover:bg-muted/35 ${policy?.ignored ? "opacity-55" : ""}`}
                  >
                    <span className="pt-1 font-mono text-xs text-muted-foreground">
                      {spellcast.spellId}
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <SpellReference spellId={spellcast.spellId} />
                      <EffectStatus policy={policy} ambiguous={canManageConsumables && spellcast.items.length > 1} />
                    </div>
                    <div className="flex flex-wrap gap-1.5 pr-3">
                      {spellcast.items.map((item) => (
                        <div
                          key={item.item_id}
                          className={policy?.item_id === item.item_id ? "rounded-md ring-1 ring-emerald-400/60" : ""}
                        >
                          <ItemReference consumable={item} iconBaseUrl={iconBaseUrl} compact />
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {buffs.length === 0 ? (
                        <span className="pt-1 text-xs text-muted-foreground">No applied aura found</span>
                      ) : (
                        buffs.map((buff) => (
                          <SpellReference key={buff.id} spellId={buff.id} name={buff.name} />
                        ))
                      )}
                    </div>
                  </div>
                );
              }),
            )}
          </Card>
        )}

        {multiDatasetMode && view !== "item" && (
          <MultiDatasetConsumablesView
            datasets={datasets ?? []}
            selectedDatasetIds={selectedDatasetIds}
            view={view}
            search={search}
            showAmbiguous={showAmbiguous}
            showIgnored={showIgnored}
          />
        )}
      </Tabs>
      {effectMenu && (
        <ConsumableEffectMenu
          menu={effectMenu}
          policy={selectedPolicy}
          pending={policyPending}
          onCanonical={handleCanonical}
          onReset={handleReset}
          onIgnore={handleIgnore}
          onClose={closeEffectMenu}
        />
      )}
    </div>
  );
}

function renderState(
  isLoading: boolean,
  error: Error | null,
  rowCount: number,
  noun: string,
  renderRows: () => React.ReactNode,
): React.ReactNode {
  if (isLoading) {
    return <div className="p-6 text-center text-sm text-muted-foreground">Loading consumables…</div>;
  }
  if (error) {
    return (
      <div className="p-6 text-center text-sm text-destructive">
        Failed to load the tenant&apos;s consumable data.
      </div>
    );
  }
  if (rowCount === 0) {
    return (
      <div className="p-8 text-center">
        <FlaskConical className="mx-auto mb-2 h-7 w-7 text-muted-foreground/60" />
        <p className="text-sm font-medium">No {noun} found</p>
        <p className="mx-auto mt-1 max-w-lg text-xs text-muted-foreground">
          Re-upload the tenant dataset&apos;s Item WDB or Spell DBC to rebuild these mappings.
        </p>
      </div>
    );
  }
  return renderRows();
}
