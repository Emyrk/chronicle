import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import type { WoWSpell, LocaleIndex } from "@/api/wowdb";
import {
  getLocalizedText,
  getSpellIconUrl,
  formatCastTime,
  formatRange,
  formatCooldown,
  formatDuration,
  resolveSpellDescription,
  extractReferencedSpellIds,
} from "@/api/wowdb";
import { SpellSchoolText } from "@/components/SpellSchoolBadge";

interface SpellTooltipProps {
  spell: WoWSpell;
  locale?: LocaleIndex;
  /** Show detailed view with duration and aura effects. Defaults to false (simple view). */
  detailed?: boolean;
}

export function SpellTooltip({ spell, locale = "0", detailed = false }: SpellTooltipProps) {
  const name = getLocalizedText(spell.name, locale);
  const rank = getLocalizedText(spell.subtext, locale);
  const descriptionTemplate = getLocalizedText(spell.description, locale);
  const auraDescTemplate = getLocalizedText(spell.aura_description, locale);
  const iconUrl = getSpellIconUrl(spell.spell_icon);
  const cooldown = formatCooldown(spell.recovery_time);
  // schoolColor handled by SpellSchoolText component

  // Extract referenced spell IDs from templates
  const referencedIds = useMemo(() => {
    const ids = [
      ...extractReferencedSpellIds(descriptionTemplate),
      ...extractReferencedSpellIds(auraDescTemplate),
    ];
    return [...new Set(ids)];
  }, [descriptionTemplate, auraDescTemplate]);

  // Fetch all referenced spells in parallel
  const refQueries = useQueries({
    queries: referencedIds.map((id) => ({
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

  // Build the referenced spells map
  const referencedSpells = useMemo(() => {
    const map = new Map<number, WoWSpell>();
    referencedIds.forEach((id, i) => {
      const data = refQueries[i]?.data;
      if (data) map.set(id, data);
    });
    return map;
  }, [referencedIds, refQueries]);

  // Resolve descriptions with cross-spell references
  const description = resolveSpellDescription(spell, descriptionTemplate, referencedSpells);
  const auraDesc = resolveSpellDescription(spell, auraDescTemplate, referencedSpells);

  // Determine resource cost display
  const hasCost = spell.mana_cost > 0 || spell.mana_cost_pct > 0;
  const costDisplay = spell.mana_cost_pct > 0 
    ? `${spell.mana_cost_pct}% of base ${spell.power_type.string}`
    : `${spell.mana_cost} ${spell.power_type.string}`;

  return (
    <div className="bg-[#1a1a2e] border-2 border-[#4a4a6a] rounded-lg p-4 max-w-md shadow-lg">
      {/* Header with icon */}
      <div className="flex gap-3 items-start">
        {iconUrl && (
          <img
            src={iconUrl}
            alt=""
            width={44}
            height={44}
            className="rounded border-2 border-yellow-600/60 flex-shrink-0"
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-start gap-2">
            <div className="flex flex-col min-w-0">
              <h2 className="font-bold text-lg leading-tight text-white">
                {name}
              </h2>
              {spell.spell_level > 0 && (
                <span className="text-gray-500 text-xs">
                  Level {spell.spell_level}
                </span>
              )}
            </div>
            <div className="flex flex-col items-end flex-shrink-0">
              {rank && (
                <span className="text-gray-400 text-sm">{rank}</span>
              )}
              <SpellSchoolText school={spell.school.string} className="text-xs" />
            </div>
          </div>
        </div>
      </div>

      {/* Cost/Cast and Range/Cooldown rows */}
      <div className="mt-3 space-y-1">
        {hasCost ? (
          <>
            {/* Row 1: Cost and Range */}
            <div className="flex justify-between text-white text-sm">
              <span>{costDisplay}</span>
              <span>{formatRange(spell.range)}</span>
            </div>
            {/* Row 2: Cast time and cooldown */}
            <div className="flex justify-between text-white text-sm">
              <span>{formatCastTime(spell)}</span>
              {cooldown && <span>{cooldown}</span>}
            </div>
          </>
        ) : (
          <>
            {/* Row 1: Cast time and Range */}
            <div className="flex justify-between text-white text-sm">
              <span>{formatCastTime(spell)}</span>
              <span>{formatRange(spell.range)}</span>
            </div>
            {/* Row 2: Cooldown only (if present) */}
            {cooldown && (
              <div className="flex justify-end text-white text-sm">
                <span>{cooldown}</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Duration if applicable (detailed view only) */}
      {detailed && spell.duration.Duration > 0 && (
        <div className="text-white text-sm mt-1">
          Duration: {formatDuration(spell.duration)}
        </div>
      )}

      {/* Description */}
      {description && (
        <p className="text-yellow-400 mt-1 text-sm whitespace-pre-wrap leading-relaxed">
          {description}
        </p>
      )}

      {/* Aura description (buff/debuff text, detailed view only) */}
      {detailed && auraDesc && (
        <p className="text-green-400 mt-1 text-sm italic">{auraDesc}</p>
      )}

      {/* Dispel and mechanic info (detailed view only) */}
      {detailed && (spell.dispel_type.string !== "None" || spell.mechanic.string !== "None") && (
        <div className="mt-3 pt-2 border-t border-gray-700 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
          {spell.dispel_type.string !== "None" && (
            <span>Dispel: {spell.dispel_type.string}</span>
          )}
          {spell.mechanic.string !== "None" && (
            <span>Mechanic: {spell.mechanic.string}</span>
          )}
        </div>
      )}
    </div>
  );
}
