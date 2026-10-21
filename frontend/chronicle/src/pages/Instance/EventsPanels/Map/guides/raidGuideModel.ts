import type { PlanItem, PlanPoint } from "../plan/mapPlan";

export type RaidGuideExample = "correct" | "wrong";
export type RaidGuideRole = "tank" | "healer" | "melee" | "ranged" | "boss" | "add";

export interface RaidGuideUnit {
  id: string;
  name: string;
  role: RaidGuideRole;
  at: PlanPoint;
  facing?: number;
  entry?: number;
}

export interface RaidGuideScene {
  units: RaidGuideUnit[];
  planItems: PlanItem[];
  callout: string;
}

export interface RaidGuideChapter {
  id: string;
  eyebrow: string;
  title: string;
  summary: string;
  duration: string;
  objectives: string[];
  correct: RaidGuideScene;
  wrong: RaidGuideScene;
}

export interface RaidGuide {
  slug: string;
  encounter: string;
  instance: string;
  server: string;
  difficulty: string;
  chapters: RaidGuideChapter[];
}

export function guideChapter(guide: RaidGuide, chapterId: string): RaidGuideChapter | null {
  return guide.chapters.find((chapter) => chapter.id === chapterId) ?? null;
}

export function guideScene(chapter: RaidGuideChapter, example: RaidGuideExample): RaidGuideScene {
  return chapter[example];
}

export function validateRaidGuide(guide: RaidGuide): string[] {
  const problems: string[] = [];
  const chapterIds = new Set<string>();

  if (guide.chapters.length === 0) problems.push("guide needs at least one chapter");
  for (const chapter of guide.chapters) {
    if (chapterIds.has(chapter.id)) problems.push(`duplicate chapter id: ${chapter.id}`);
    chapterIds.add(chapter.id);
    if (chapter.objectives.length === 0) problems.push(`${chapter.id}: needs at least one objective`);

    for (const example of ["correct", "wrong"] as const) {
      const scene = chapter[example];
      const unitIds = new Set<string>();
      for (const unit of scene.units) {
        if (unitIds.has(unit.id)) problems.push(`${chapter.id}.${example}: duplicate unit id: ${unit.id}`);
        unitIds.add(unit.id);
      }
      const itemIds = new Set<string>();
      for (const item of scene.planItems) {
        if (itemIds.has(item.id)) problems.push(`${chapter.id}.${example}: duplicate plan item id: ${item.id}`);
        itemIds.add(item.id);
      }
    }
  }

  return problems;
}
