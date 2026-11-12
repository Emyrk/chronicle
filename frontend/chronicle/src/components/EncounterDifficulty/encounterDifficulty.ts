import type { KillType, WoWEncounterDifficulty } from "@/api/typesGenerated";

/** Tiered hard modes are a count; `hardest` says which end of the scale is hardest. */
export interface HardModeScale {
  unit: string;
  units: string;
  min: number;
  max: number;
  hardest: "max" | "min";
}

export interface HardModeInfo {
  /** How the hard mode is triggered, shown in the tooltip. */
  trigger: string;
  scale?: HardModeScale;
}

/** Ulduar bosses with a hard mode, keyed by encounter name. */
export const HARD_MODES: Readonly<Record<string, HardModeInfo>> = {
  "Flame Leviathan": {
    trigger: "Leave the towers standing. Each tower buffs Leviathan.",
    scale: { unit: "tower", units: "towers", min: 1, max: 4, hardest: "max" },
  },
  "XT-002 Deconstructor": { trigger: "Destroy the Heart during a heart phase. XT-002 heals and enrages." },
  "Assembly of Iron": { trigger: "Kill Steelbreaker last, after Molgeim and Brundir." },
  "Hodir": { trigger: "Kill Hodir before the Rare Cache shatters." },
  "Thorim": { trigger: "Reach Thorim before Sif leaves, so she joins the fight." },
  "Freya": {
    trigger: "Leave the elders alive. Each one gives Freya an ability.",
    scale: { unit: "elder", units: "elders", min: 1, max: 3, hardest: "max" },
  },
  "Mimiron": { trigger: "Press the big red button. The room fills with fire." },
  "General Vezax": { trigger: "Let the Saronite Vapors form the Saronite Animus and kill it." },
  "Yogg-Saron": {
    trigger: "Accept less help from the keepers. Fewer keepers is harder.",
    scale: { unit: "keeper", units: "keepers", min: 0, max: 3, hardest: "min" },
  },
};

/** "2 elders", "1 keeper"; undefined for untiered hard modes or unknown bosses. */
export function hardModeTierLabel(encounterName: string, difficulty: WoWEncounterDifficulty): string | undefined {
  const scale = HARD_MODES[encounterName]?.scale;
  if (!scale || difficulty.tier === undefined) return undefined;
  return `${difficulty.tier} ${difficulty.tier === 1 ? scale.unit : scale.units}`;
}

/** The fields a boss encounter needs for the difficulty summary. */
export interface DifficultyEncounter {
  name: string;
  boss: boolean;
  kill_type: KillType;
  difficulty?: WoWEncounterDifficulty;
}

export interface DifficultySummary {
  /** Boss kills (clean or partial); wipes and resets are left out. */
  kills: DifficultyEncounter[];
  heroicKills: number;
  hardModeKills: number;
  /** True when at least one boss kill carries a difficulty. */
  hasDifficulty: boolean;
}

export function summarizeDifficulty(encounters: readonly DifficultyEncounter[]): DifficultySummary {
  const kills = encounters.filter((e) => e.boss && (e.kill_type === "clean" || e.kill_type === "partial"));
  const heroicKills = kills.filter((e) => e.difficulty?.mode === "heroic").length;
  const hardModeKills = kills.filter((e) => e.difficulty?.mode === "hard_mode").length;
  return { kills, heroicKills, hardModeKills, hasDifficulty: heroicKills + hardModeKills > 0 };
}
