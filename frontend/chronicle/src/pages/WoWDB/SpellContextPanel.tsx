import { useQueries } from "@tanstack/react-query";
import { SlidersHorizontal } from "lucide-react";
import {
  getLocalizedText,
  type LocaleIndex,
  type SpellTooltipContext,
  type SpellTooltipNumericContextField,
  type SpellTooltipRequirements,
  type WoWSpell,
} from "@/api/wowdb";

interface NumericFieldMeta {
  label: string;
  token: string;
  description: string;
}

const NUMERIC_FIELD_META: Record<
  SpellTooltipNumericContextField,
  NumericFieldMeta
> = {
  playerLevel: {
    label: "Player level",
    token: "$PL",
    description: "Controls level-scaled spell values.",
  },
  attackPower: {
    label: "Attack power",
    token: "$AP",
    description: "Character melee and ranged attack power.",
  },
  bonusHealing: {
    label: "Bonus healing",
    token: "$BH",
    description: "Healing power supplied by the character.",
  },
  spirit: {
    label: "Spirit",
    token: "$SPI",
    description: "Character Spirit, used by spells such as Life Tap.",
  },
  shadowSpellPower: {
    label: "Shadow spell power",
    token: "$SPS",
    description: "Spell power that applies to Shadow spells.",
  },
  armor: {
    label: "Armor",
    token: "$AR",
    description: "Current character armor.",
  },
  holySpellPower: {
    label: "Holy spell power",
    token: "$SPH",
    description: "Spell power that applies to Holy spells.",
  },
};

interface SpellContextPanelProps {
  requirements: SpellTooltipRequirements;
  context: SpellTooltipContext;
  locale: LocaleIndex;
  maxPlayerLevel: number;
  onNumericChange: (
    field: SpellTooltipNumericContextField,
    value: number,
  ) => void;
  onGenderChange: (gender: "male" | "female") => void;
  onKnownSpellChange: (spellId: number, known: boolean) => void;
}

export function SpellContextPanel({
  requirements,
  context,
  locale,
  maxPlayerLevel,
  onNumericChange,
  onGenderChange,
  onKnownSpellChange,
}: SpellContextPanelProps) {
  const spellQueries = useQueries({
    queries: requirements.conditionalSpellIds.map((id) => ({
      queryKey: ["wowdb", "spell", id.toString()],
      queryFn: async () => {
        const response = await fetch(`/api/v1/wowdb/spell/${id}`);
        if (!response.ok) return null;
        return response.json() as Promise<WoWSpell>;
      },
      staleTime: Infinity,
      retry: false,
    })),
  });

  const hasConfigurableContext =
    requirements.numericContextFields.length > 0 ||
    requirements.usesGender ||
    requirements.conditionalSpellIds.length > 0;
  const hasDiagnosticContext =
    requirements.descriptionVariables.length > 0 ||
    requirements.unsupportedVariables.length > 0;

  if (!hasConfigurableContext && !hasDiagnosticContext) return null;

  const configurableCount =
    requirements.numericContextFields.length +
    requirements.conditionalSpellIds.length +
    (requirements.usesGender ? 1 : 0);

  return (
    <details className="group rounded-lg border border-yellow-500/20 bg-yellow-500/[0.04]">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="rounded-md border border-yellow-500/20 bg-yellow-500/10 p-2 text-yellow-400">
          <SlidersHorizontal className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-foreground">
            Customize tooltip context
          </span>
          <span className="block text-xs text-muted-foreground">
            {configurableCount > 0
              ? `${configurableCount} character ${configurableCount === 1 ? "input" : "inputs"} affect this spell`
              : "Inspect the formula context used by this spell"}
          </span>
        </span>
        <span className="text-xs text-yellow-400 group-open:hidden">Show</span>
        <span className="hidden text-xs text-yellow-400 group-open:inline">Hide</span>
      </summary>

      <div className="border-t border-border/60 px-4 pb-4 pt-3">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Changes update the spell preview immediately.
        </p>

      {requirements.numericContextFields.length > 0 && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {requirements.numericContextFields.map((field) => {
            const meta = NUMERIC_FIELD_META[field];
            const isLevel = field === "playerLevel";
            const value = context[field] ?? (isLevel ? maxPlayerLevel : 0);

            return (
              <label
                key={field}
                className="rounded-md border border-border/70 bg-background/50 p-3"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-foreground">
                    {meta.label}
                  </span>
                  <code className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-yellow-400">
                    {meta.token}
                  </code>
                </span>
                <input
                  type="number"
                  min={isLevel ? 1 : 0}
                  max={isLevel ? maxPlayerLevel : undefined}
                  step={1}
                  value={value}
                  onChange={(event) =>
                    onNumericChange(
                      field,
                      Math.max(
                        isLevel ? 1 : 0,
                        Number(event.currentTarget.value) || 0,
                      ),
                    )
                  }
                  className="mt-2 w-full rounded border border-border bg-background px-2.5 py-1.5 text-sm tabular-nums outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/20"
                />
                <span className="mt-1.5 block text-[11px] leading-snug text-muted-foreground">
                  {meta.description}
                </span>
              </label>
            );
          })}
        </div>
      )}

      {requirements.usesGender && (
        <fieldset className="mt-4">
          <legend className="text-xs font-medium text-foreground">
            Pronoun form <code className="ml-1 text-[10px] text-yellow-400">$g</code>
          </legend>
          <div className="mt-2 flex gap-2">
            {(["male", "female"] as const).map((gender) => (
              <button
                key={gender}
                type="button"
                aria-pressed={(context.gender ?? "male") === gender}
                onClick={() => onGenderChange(gender)}
                className={`rounded-md border px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                  (context.gender ?? "male") === gender
                    ? "border-yellow-500/40 bg-yellow-500/10 text-yellow-300"
                    : "border-border bg-background/50 text-muted-foreground hover:text-foreground"
                }`}
              >
                {gender}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {requirements.conditionalSpellIds.length > 0 && (
        <fieldset className="mt-4 border-t border-border/60 pt-4">
          <legend className="text-xs font-medium text-foreground">
            Known spells and talents
          </legend>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Controls <code>$?s…</code> conditional formula branches.
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {requirements.conditionalSpellIds.map((id, index) => {
              const known = context.knownSpellIds?.has(id) ?? false;
              const referencedSpell = spellQueries[index]?.data;
              const name = referencedSpell
                ? getLocalizedText(referencedSpell.name, locale)
                : "Spell";
              return (
                <label
                  key={id}
                  className="flex cursor-pointer items-center gap-2 rounded-md border border-border/70 bg-background/50 px-3 py-2 text-xs"
                >
                  <input
                    type="checkbox"
                    checked={known}
                    onChange={(event) =>
                      onKnownSpellChange(id, event.currentTarget.checked)
                    }
                    className="h-3.5 w-3.5 accent-yellow-500"
                  />
                  <span className="min-w-0 flex-1 truncate text-foreground">
                    {name}
                  </span>
                  <span className="tabular-nums text-muted-foreground">#{id}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      {(requirements.descriptionVariables.length > 0 ||
        requirements.unsupportedVariables.length > 0) && (
        <div className="mt-4 border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
          {requirements.descriptionVariables.length > 0 && (
            <p>
              Formula chain: {requirements.descriptionVariables.map((name) => `$<${name}>`).join(" → ")}
            </p>
          )}
          {requirements.unsupportedVariables.length > 0 && (
            <p className="mt-1 text-orange-400">
              Not yet configurable: {requirements.unsupportedVariables.join(", ")}
            </p>
          )}
        </div>
      )}
      </div>
    </details>
  );
}
