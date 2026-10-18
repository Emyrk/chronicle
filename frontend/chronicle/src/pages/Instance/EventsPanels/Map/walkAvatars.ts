/**
 * The characters you can walk as: the gold capsule, or a WoW creature
 * converted from the client by `scripts/dbcdata extract-models`. No three.js
 * here, so the settings and the legend can list them without pulling in the
 * 3D chunk.
 */
import { ICON_CDN } from "@/config/iconUrl";

/** Where the creatures' .glb files are served from: `<base><file>.glb`. */
export const WALK_AVATAR_BASE_URL = `${ICON_CDN}/game/models/`;

export type WalkAvatarGroup = "Critters" | "Beasts" | "Monsters" | "Bosses" | "Flyers";

export interface WalkAvatarOption {
  /** "capsule", or "<group>/<file>". */
  id: string;
  label: string;
  group: WalkAvatarGroup | null;
}

export const CAPSULE_AVATAR = "capsule";

interface AvatarGroup {
  group: WalkAvatarGroup;
  title: string;
  /** File names (the extractor's: the model's, lower case), with a label where the name alone reads badly. */
  models: (string | [file: string, label: string])[];
}

const GROUPS: AvatarGroup[] = [
  {
    group: "Critters", title: "Critters",
    models: ["cat", "chicken", ["corgi2", "Corgi"], "cow", "crab", "deer", "duck", "frog", "monkey", ["northrendpenguin", "Penguin"], "owl", "parrot", "pig",
      ["prariedog", "Prairie Dog"], "rabbit", "rat", "reindeer", "sheep", "skunk", "snowman", "squirrel", "stag", "turkey", "turtle"],
  },
  {
    group: "Beasts", title: "Beasts",
    models: ["bear", "boar", "crocodile", "giraffe", "gorilla", "hyena", ["kodobeast", "Kodo"], "lion", "raptor", "tallstrider", "tiger", "wolf"],
  },
  {
    group: "Monsters", title: "Monsters",
    models: ["felguard", "furbolg", "ghoul", "gnoll", "gnome", "goblin", "harpy", "imp", "infernal", "kobold", "murloc", "ogre", "quillboar", "skeleton",
      "slime", "succubus", "troll", "voidwalker", "wisp", "zombie"],
  },
  {
    group: "Bosses", title: "Bosses and pets",
    models: ["arthas", ["babylich", "Baby Lich"], ["babyragnoros", "Baby Ragnaros"], ["diablofunsized", "Mini Diablo"], ["dragonwhelp", "Dragon Whelp"],
      ["faeriedragon", "Faerie Dragon"], "illidan", ["kelthuzad", "Kel'Thuzad"], ["pandarenmonk", "Pandaren Monk"], "ragnaros", ["zerglingpet", "Zergling"]],
  },
  {
    group: "Flyers", title: "Flyers",
    models: [["carrionbird", "Carrion Bird"], "dragonhawk", "eagle", "gryphon", "hippogryph", ["mobat", "Bat"], "moth", ["netherray", "Nether Ray"], "phoenix",
      "sporebat", ["windserpent", "Wind Serpent"], "wyvern"],
  },
];

export const WALK_AVATAR_GROUPS: { group: WalkAvatarGroup; title: string }[] = GROUPS.map(({ group, title }) => ({ group, title }));

const fileOf = (model: AvatarGroup["models"][number]) => (typeof model === "string" ? model : model[0]);
const labelOf = (model: AvatarGroup["models"][number]) => (typeof model === "string" ? model.replace(/^./, (first) => first.toUpperCase()) : model[1]);

export const WALK_AVATARS: WalkAvatarOption[] = [
  { id: CAPSULE_AVATAR, label: "Classic", group: null },
  ...GROUPS.flatMap(({ group, models }) => models
    .map((model) => ({ id: `${group}/${fileOf(model)}`, label: labelOf(model), group }))
    .sort((a, b) => a.label.localeCompare(b.label))),
];

export const DEFAULT_WALK_AVATAR = "Critters/chicken";

/** The creature's model URL, or null for the capsule (or an unknown id). */
export function walkAvatarUrl(id: string): string | null {
  const [groupName, file] = id.split("/");
  const group = GROUPS.find((candidate) => candidate.group === groupName);
  return group?.models.some((model) => fileOf(model) === file) ? `${WALK_AVATAR_BASE_URL}${file}.glb` : null;
}

/** The extractor's clip names (AnimationData) to play, best first, for each state. */
export const WALK_AVATAR_CLIPS = {
  idle: ["Stand"],
  walk: ["WalkBackwards", "Walk"],
  run: ["Run", "Walk"],
  air: ["Fall", "Jump", "Stand"],
} as const;

export type WalkAvatarState = keyof typeof WALK_AVATAR_CLIPS;

const WALK_AVATAR_STORAGE_KEY = "chronicle.map.walkAvatar";

export function readStoredWalkAvatar(): string {
  try {
    const stored = localStorage.getItem(WALK_AVATAR_STORAGE_KEY);
    return stored && WALK_AVATARS.some((option) => option.id === stored) ? stored : DEFAULT_WALK_AVATAR;
  } catch {
    return DEFAULT_WALK_AVATAR;
  }
}

export function storeWalkAvatar(id: string) {
  try {
    localStorage.setItem(WALK_AVATAR_STORAGE_KEY, id);
  } catch {
    // Storage may be unavailable; the choice still applies for this session.
  }
}
