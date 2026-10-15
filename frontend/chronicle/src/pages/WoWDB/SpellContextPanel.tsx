import { useQueries } from "@tanstack/react-query";
import { spellQueryOptions } from "@/api/queries";
import {
  getLocalizedText,
  getSpellIconUrl,
  type LocaleIndex,
  type SpellTooltipContext,
  type SpellTooltipNumericContextField,
  type SpellTooltipRequirements,
} from "@/api/wowdb";
import { useDatasetId, useIconBaseUrl } from "@/hooks/useDatasetId";

interface NumericFieldMeta {
  label: string;
  short: string;
  token: string;
}

const NUMERIC_FIELD_META: Record<
  SpellTooltipNumericContextField,
  NumericFieldMeta
> = {
  playerLevel: { label: "Player level", short: "Level", token: "$PL" },
  attackPower: { label: "Attack power", short: "AP", token: "$AP" },
  bonusHealing: { label: "Bonus healing", short: "Healing", token: "$BH" },
  spirit: { label: "Spirit", short: "Spirit", token: "$SPI" },
  shadowSpellPower: {
    label: "Shadow spell power",
    short: "Shadow SP",
    token: "$SPS",
  },
  armor: { label: "Armor", short: "Armor", token: "$AR" },
  holySpellPower: {
    label: "Holy spell power",
    short: "Holy SP",
    token: "$SPH",
  },
};

const chip =
  "inline-flex h-7 items-center rounded-md border border-[#4a4a6a] bg-[#1a1a2e] text-xs transition-colors";

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

/** Compact strip of the character inputs a spell's tooltip formulas read. */
export function SpellContextPanel({
  requirements,
  context,
  locale,
  maxPlayerLevel,
  onNumericChange,
  onGenderChange,
  onKnownSpellChange,
}: SpellContextPanelProps) {
  const datasetId = useDatasetId();
  const iconBaseUrl = useIconBaseUrl();
  const spellQueries = useQueries({
    queries: requirements.conditionalSpellIds.map((id) => ({
      ...spellQueryOptions(id.toString(), datasetId),
      staleTime: Infinity,
    })),
  });

  const hasInputs =
    requirements.numericContextFields.length > 0 || requirements.usesGender;
  const hasKnownSpells = requirements.conditionalSpellIds.length > 0;
  const hasDiagnostics =
    requirements.descriptionVariables.length > 0 ||
    requirements.unsupportedVariables.length > 0;

  if (!hasInputs && !hasKnownSpells && !hasDiagnostics) return null;

  const gender = context.gender ?? "male";

  return (
    <div
      role="group"
      aria-label="Tooltip context"
      className="max-w-md space-y-1.5"
    >
      {hasInputs && (
        <div className="flex flex-wrap items-center gap-1.5">
          {requirements.numericContextFields.map((field) => {
            const meta = NUMERIC_FIELD_META[field];
            const isLevel = field === "playerLevel";
            const min = isLevel ? 1 : 0;
            return (
              <label
                key={field}
                title={`${meta.label} (${meta.token})`}
                className={`${chip} focus-within:border-yellow-500/60`}
              >
                <span className="pl-2 text-gray-400">{meta.short}</span>
                <input
                  type="number"
                  aria-label={meta.label}
                  min={min}
                  max={isLevel ? maxPlayerLevel : undefined}
                  step={1}
                  value={context[field] ?? (isLevel ? maxPlayerLevel : 0)}
                  onFocus={(event) => event.currentTarget.select()}
                  onChange={(event) =>
                    onNumericChange(
                      field,
                      Math.max(min, Number(event.currentTarget.value) || 0),
                    )
                  }
                  className="w-12 appearance-none bg-transparent px-2 text-right font-medium tabular-nums text-yellow-400 outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
                />
              </label>
            );
          })}

          {requirements.usesGender && (
            <div
              role="radiogroup"
              aria-label="Pronoun form ($g)"
              title="Pronoun form ($g)"
              className={`${chip} overflow-hidden p-0.5`}
            >
              {(["male", "female"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={gender === option}
                  onClick={() => onGenderChange(option)}
                  className={`h-full rounded px-2 capitalize ${
                    gender === option
                      ? "bg-yellow-500/15 text-yellow-300"
                      : "text-gray-400 hover:text-gray-200"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {hasKnownSpells && (
        <div className="flex flex-wrap items-center gap-1.5">
          {requirements.conditionalSpellIds.map((id, index) => {
            const known = context.knownSpellIds?.has(id) ?? false;
            const referenced = spellQueries[index]?.data;
            const name = referenced
              ? getLocalizedText(referenced.name, locale)
              : `Spell #${id}`;
            const rank = referenced
              ? getLocalizedText(referenced.subtext, locale)
              : "";
            const icon = referenced
              ? getSpellIconUrl(referenced.spell_icon, iconBaseUrl)
              : "";
            return (
              <button
                key={id}
                type="button"
                aria-pressed={known}
                title={`${known ? "Known" : "Not known"}: ${name}${rank ? ` (${rank})` : ""} #${id}`}
                onClick={() => onKnownSpellChange(id, !known)}
                className={`${chip} gap-1.5 pl-0.5 pr-2 ${
                  known
                    ? "border-yellow-500/60 text-yellow-300"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                {icon ? (
                  <img
                    src={icon}
                    alt=""
                    className={`h-5 w-5 rounded-sm ${known ? "" : "opacity-50 grayscale"}`}
                  />
                ) : (
                  <span className="h-5 w-5 rounded-sm bg-[#4a4a6a]/50" />
                )}
                <span className="max-w-40 truncate">{name}</span>
                {rank && (
                  <span className="text-[10px] text-gray-500">
                    {rank.replace(/^Rank\s*/i, "R")}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {hasDiagnostics && (
        <p className="font-mono text-[10px] leading-relaxed text-muted-foreground/70">
          {requirements.descriptionVariables.length > 0 &&
            requirements.descriptionVariables
              .map((name) => `$<${name}>`)
              .join(" → ")}
          {requirements.unsupportedVariables.length > 0 && (
            <span className="text-orange-400/80">
              {requirements.descriptionVariables.length > 0 && " · "}
              unsupported: {requirements.unsupportedVariables.join(", ")}
            </span>
          )}
        </p>
      )}
    </div>
  );
}
