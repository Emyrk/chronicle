import { useMemo, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { Check, Lock, RotateCcw, Sparkles, Wand2 } from "lucide-react";
import type {
  CharacterCosmetics,
  CosmeticDefinition,
  LinkedCharacter,
} from "@/api/typesGenerated";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/Switch/Switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/Tooltip/tooltip";
import {
  BACKGROUND_STYLES,
  BORDER_STYLES,
  COSMETIC_CSS,
  DEFAULT_BAR,
  DEFAULT_COSMETIC_SELECTION,
  NAME_STYLES,
  TIER_COLORS,
  combineCosmetics,
  isDefaultSelection,
  selectionFromAPI,
  selectionSummary,
  type CosmeticStyleSelection,
  type Preset,
  type Tier,
} from "@/components/ui/PlayerMetricChart/PlayerCosmetics";
import { PlayerMetricChart, type PlayerMetricChartData } from "@/components/ui/PlayerMetricChart/PlayerMetricChart";
import type { PlayerRowCosmetic } from "@/components/ui/PlayerMetricChart/PlayerMetricChartModel";
import { cn } from "@/lib/utils";

type Slot = keyof CosmeticStyleSelection;
type PaidTier = Exclude<Tier, "Free">;

const SLOT_CONFIG: {
  key: Slot;
  label: string;
  presets: Record<string, Preset>;
}[] = [
  { key: "name", label: "Name", presets: NAME_STYLES },
  { key: "background", label: "Background", presets: BACKGROUND_STYLES },
  { key: "border", label: "Border", presets: BORDER_STYLES },
];

const TIER_ORDER: PaidTier[] = ["Honored", "Revered", "Exalted"];

function tierLabel(tier?: string): PaidTier | null {
  switch (tier) {
    case "honored":
      return "Honored";
    case "revered":
      return "Revered";
    case "exalted":
      return "Exalted";
    default:
      return null;
  }
}

function TierBadge({ tier }: { tier: Tier }) {
  return (
    <span
      className="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{ color: TIER_COLORS[tier], borderColor: TIER_COLORS[tier] }}
    >
      {tier}
    </span>
  );
}

function MiniRow({ character, cosmetic }: { character: LinkedCharacter; cosmetic: PlayerRowCosmetic }) {
  return (
    <div
      className="relative flex h-7 items-center overflow-hidden rounded-md px-2"
      style={{
        "--bar-color": `var(--color-class-${character.class.toLowerCase()})`,
        color: "var(--color-class-foreground)",
      } as CSSProperties}
    >
      <div
        className={cosmetic.barClassName}
        style={{
          position: "absolute",
          inset: "0 auto 0 0",
          width: "78%",
          opacity: 0.85,
          background: cosmetic.barBackground ?? DEFAULT_BAR,
        }}
      />
      <span
        className={cosmetic.nameClassName}
        style={{ position: "relative", fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", ...cosmetic.nameStyle }}
      >
        {character.name}
      </span>
      {(cosmetic.borderClassName || cosmetic.borderStyle) && (
        <div
          aria-hidden="true"
          className={cosmetic.borderClassName}
          style={{ position: "absolute", inset: 0, zIndex: 2, borderRadius: "inherit", pointerEvents: "none", ...cosmetic.borderStyle }}
        />
      )}
    </div>
  );
}

function isAnimated(cosmetic: PlayerRowCosmetic): boolean {
  return [cosmetic.nameClassName, cosmetic.barClassName, cosmetic.borderClassName]
    .flatMap((classes) => classes?.split(" ") ?? [])
    .some((className) => new RegExp(`\\.${className}(::?[a-z-]+)?\\s*\\{[^}]*animation:`).test(COSMETIC_CSS));
}

interface EditorOption {
  key: string;
  id: string;
  preset: Preset;
  tier: Tier;
}

function slotOptions(slot: (typeof SLOT_CONFIG)[number], catalog: readonly CosmeticDefinition[]): EditorOption[] {
  const options: EditorOption[] = [{ key: "none", id: "", preset: slot.presets.none, tier: "Free" }];
  for (const definition of catalog) {
    if (definition.slot !== slot.key) continue;
    const selection = selectionFromAPI({
      name_id: slot.key === "name" ? definition.id : "",
      background_id: slot.key === "background" ? definition.id : "",
      border_id: slot.key === "border" ? definition.id : "",
    });
    const key = selection[slot.key];
    const preset = slot.presets[key];
    const tier = tierLabel(definition.tier);
    if (!preset || key === "none" || !tier) continue;
    options.push({ key, id: definition.id, preset, tier });
  }
  return options;
}

function OptionTile({
  option,
  character,
  slot,
  selected,
  locked,
  onSelect,
}: {
  option: EditorOption;
  character: LinkedCharacter;
  slot: Slot;
  selected: boolean;
  locked: boolean;
  onSelect: () => void;
}) {
  const cosmetic = combineCosmetics({ ...DEFAULT_COSMETIC_SELECTION, [slot]: option.key });
  const animated = isAnimated(cosmetic);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onSelect}
          aria-pressed={selected}
          className={cn(
            "group relative flex flex-col gap-1.5 rounded-lg border bg-card p-2 text-left transition-colors",
            selected && !locked && "border-primary ring-2 ring-primary/40",
            selected && locked && "border-destructive ring-2 ring-destructive/40",
            !selected && "border-border hover:border-foreground/30",
          )}
        >
          <div className={cn(locked && !selected && "opacity-50 grayscale-[30%]")}>
            <MiniRow character={character} cosmetic={cosmetic} />
          </div>
          <div className="flex items-center gap-1.5 px-0.5">
            <span className={cn("truncate text-xs font-medium", locked && "text-muted-foreground")}>{option.preset.label}</span>
            {locked && <Lock className="size-3 shrink-0 text-muted-foreground" />}
            {selected && !locked && <Check className="ml-auto size-3.5 shrink-0 text-primary" />}
            {selected && locked && <span className="ml-auto shrink-0 text-[10px] font-medium uppercase text-destructive">Preview</span>}
          </div>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6} className="max-w-60 space-y-1.5 px-3 py-2 text-left">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{option.preset.label}</span>
          {option.tier !== "Free" && <TierBadge tier={option.tier} />}
        </div>
        <p className="text-xs text-zinc-300">{option.preset.description}</p>
        {(animated || locked) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-white/10 pt-1.5 text-[11px] text-zinc-400">
            {animated && <span className="inline-flex items-center gap-1"><Wand2 className="size-3" />Animated</span>}
            {locked && <span className="inline-flex items-center gap-1" style={{ color: TIER_COLORS[option.tier] }}><Lock className="size-3" />Unlocks at {option.tier} · click to preview</span>}
          </div>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

export interface CharacterCosmeticsEditorProps {
  character: LinkedCharacter;
  cosmetics?: CharacterCosmetics;
  catalog: readonly CosmeticDefinition[];
  allowedIDs: readonly string[];
  open: boolean;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (selection: CosmeticStyleSelection, applyToAll: boolean) => void;
}

export function CharacterCosmeticsEditor({
  character,
  cosmetics,
  catalog,
  allowedIDs,
  open,
  saving,
  onOpenChange,
  onSave,
}: CharacterCosmeticsEditorProps) {
  const saved = selectionFromAPI(cosmetics?.requested);
  const active = selectionFromAPI(cosmetics?.active);
  const [draft, setDraft] = useState(saved);
  const [applyToAll, setApplyToAll] = useState(false);
  const [barLength, setBarLength] = useState<"long" | "short">("long");
  const allowed = useMemo(() => new Set(allowedIDs), [allowedIDs]);
  const optionsBySlot = useMemo(
    () => Object.fromEntries(SLOT_CONFIG.map((slot) => [slot.key, slotOptions(slot, catalog)])) as Record<Slot, EditorOption[]>,
    [catalog],
  );
  const selectedOptions = SLOT_CONFIG.map((slot) => ({
    slot,
    option: optionsBySlot[slot.key].find((option) => option.key === draft[slot.key]),
  }));
  const lockedSelections = selectedOptions.filter(({ option }) => option && option.id && !allowed.has(option.id));
  const requiredTier = lockedSelections.reduce<PaidTier | null>((highest, { option }) => {
    if (!option || option.tier === "Free") return highest;
    return !highest || TIER_ORDER.indexOf(option.tier) > TIER_ORDER.indexOf(highest) ? option.tier : highest;
  }, null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const preview: PlayerMetricChartData[] = [
    { playerID: "above", playerName: "Raidmate", className: "Warrior", specialization: "", value: 1000 },
    {
      playerID: "me",
      playerName: character.name,
      className: character.class,
      specialization: "",
      value: barLength === "long" ? 940 : 380,
      cosmetic: combineCosmetics(draft),
    },
    { playerID: "below", playerName: "Raidmate", className: "Mage", specialization: "", value: barLength === "long" ? 720 : 300 },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <style>{COSMETIC_CSS}</style>
      <DialogContent className="flex max-h-[90vh] max-w-5xl flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
        <TooltipProvider delayDuration={120} skipDelayDuration={600}>
          <div className="flex items-start gap-3 border-b border-border px-6 py-4 pr-12">
            <Sparkles className="mt-1 size-5 shrink-0 text-primary" />
            <div className="min-w-0 space-y-1">
              <DialogTitle>
                Customize <span style={{ color: `var(--color-class-${character.class.toLowerCase()})` }}>{character.name}</span>
              </DialogTitle>
              <DialogDescription>Choose how {character.name} appears wherever they show up in logs.</DialogDescription>
            </div>
          </div>

          <div className="space-y-2 border-b border-border bg-muted/20 px-6 py-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Preview</span>
              <div className="inline-flex rounded-md border border-border p-0.5 text-xs">
                {(["long", "short"] as const).map((length) => (
                  <button
                    key={length}
                    type="button"
                    onClick={() => setBarLength(length)}
                    className={cn("rounded px-2 py-0.5", barLength === length ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}
                  >
                    {length === "long" ? "Long bar" : "Short bar"}
                  </button>
                ))}
              </div>
            </div>
            <PlayerMetricChart type="damage" style={{ height: 104 }} data={preview} />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              {selectedOptions.map(({ slot, option }) => {
                const locked = !!option?.id && !allowed.has(option.id);
                return (
                  <span key={slot.key} className={cn("inline-flex items-center gap-1", locked && "text-destructive")}>
                    <span className={cn(!locked && "text-muted-foreground")}>{slot.label}:</span>
                    {option?.preset.label ?? "Default"}
                    {locked && <><Lock className="size-3" />needs {option?.tier}</>}
                  </span>
                );
              })}
              <span className="ml-auto text-muted-foreground">Currently active: {selectionSummary(active)}</span>
            </div>
          </div>

          <Tabs defaultValue="name" className="styled-scrollbar min-h-0 flex-1 overflow-y-auto px-6 py-4">
            <TabsList className="sticky top-0 z-10">
              {SLOT_CONFIG.map((slot) => (
                <TabsTrigger key={slot.key} value={slot.key}>{slot.label}</TabsTrigger>
              ))}
            </TabsList>
            {SLOT_CONFIG.map((slot) => {
              const tiers: Tier[] = ["Free", ...TIER_ORDER];
              const groups: { tier: Tier; options: EditorOption[] }[] = tiers
                .map((tier) => ({ tier, options: optionsBySlot[slot.key].filter((option) => option.tier === tier) }))
                .filter((group) => group.options.length > 0);
              return (
                <TabsContent key={slot.key} value={slot.key} className="space-y-4 pt-2">
                  {groups.map((group) => (
                    <div key={group.tier} className="space-y-2">
                      {group.tier !== "Free" && <TierBadge tier={group.tier} />}
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                        {group.options.map((option) => (
                          <OptionTile
                            key={option.id || "default"}
                            option={option}
                            character={character}
                            slot={slot.key}
                            selected={draft[slot.key] === option.key}
                            locked={!!option.id && !allowed.has(option.id)}
                            onSelect={() => setDraft({ ...draft, [slot.key]: option.key })}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </TabsContent>
              );
            })}
          </Tabs>

          <div className="flex flex-wrap items-center gap-2 border-t border-border px-6 py-3">
            <Button variant="ghost" size="sm" onClick={() => setDraft(DEFAULT_COSMETIC_SELECTION)} disabled={isDefaultSelection(draft)}>
              <RotateCcw className="size-3.5" />
              Reset to default
            </Button>
            <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
              {!requiredTier && allowedIDs.length > 0 && (
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Switch checked={applyToAll} onCheckedChange={setApplyToAll} />
                  Apply to all linked characters
                </label>
              )}
              <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
              {requiredTier || allowedIDs.length === 0 ? (
                <Button size="sm" asChild>
                  <Link to="/account/billing" onClick={() => onOpenChange(false)}>
                    <Sparkles className="size-3.5" />
                    {requiredTier ? `Become ${requiredTier}` : "Become a supporter"}
                  </Link>
                </Button>
              ) : (
                <Button size="sm" disabled={saving || (!dirty && !applyToAll)} onClick={() => onSave(draft, applyToAll)}>
                  {saving ? "Saving..." : "Save"}
                </Button>
              )}
            </div>
          </div>
        </TooltipProvider>
      </DialogContent>
    </Dialog>
  );
}
