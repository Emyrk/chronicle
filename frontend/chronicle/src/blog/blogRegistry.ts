import type { ComponentType } from "react";
import type { LessonVideo } from "@/pages/Instance/PanelExplainer/types";
import blogPostMetadataJSON from "../../../../assets/turtle/generated/blog-posts.json";
import {
  AbsorbAttributionPost,
  ArmoryRefreshPost,
  CharacterCosmeticsPost,
  CommunitySupportPost,
  ConsumablePricingPost,
  ConsumablesPost,
  CooldownUsagePost,
  CustomPanelsPost,
  FavoritesPost,
  FocusModePost,
  GearProgressionPost,
  GuildPagesPost,
  HistoricalPerformancePost,
  LayoutEditingPost,
  ParsingPost,
  PhaseSelectionsPost,
  PlayerTimelinePost,
  RankedDamagePost,
  ReplayPost,
  TalentBuilderRefreshPost,
  VehicleSupportPost,
  YoutubeSyncPost,
} from "./posts/announcements";

export type BlogFlavorSet = readonly string[];

/** Loot rarity communicates the size of an update: legendary for major releases down to common for docs. */
export type BlogRarity = "legendary" | "epic" | "rare" | "uncommon" | "common";

export const BLOG_RARITIES: readonly BlogRarity[] = ["legendary", "epic", "rare", "uncommon", "common"];

export interface BlogPostMetadata {
  id: string;
  title: string;
  description: string;
  publishedAt: string;
  rarity: BlogRarity;
  /** Short category label, e.g. "Feature", "Fix", "Docs". */
  tag: string;
  /** Icon name on the icon CDN, e.g. "inv_misc_map_01". */
  icon: string;
  /** Optional item-style flavor text shown on the featured card. */
  flavor?: string;
  /** Optional YouTube video ID embedded at the top of the post. */
  youtubeID?: string;
  flavorSets?: readonly BlogFlavorSet[];
  /** Optional feature-oriented copy and destination used by technical hint cards. */
  hintTitle?: string;
  hintDescription?: string;
  hintHref?: string;
  hintEnabled?: boolean;
}

export interface BlogPostDefinition extends BlogPostMetadata {
  /** Optional Remotion video shown at the top of the post. Loaded lazily. */
  video?: LessonVideo;
  component: ComponentType<{ post: BlogPostDefinition }>;
}

const BLOG_COMPONENTS = {
  "ranked-damage": RankedDamagePost,
  "character-cosmetics": CharacterCosmeticsPost,
  "layout-editing": LayoutEditingPost,
  "focus-mode": FocusModePost,
  "player-timeline": PlayerTimelinePost,
  replay: ReplayPost,
  "custom-panels": CustomPanelsPost,
  "cooldown-usage-panel": CooldownUsagePost,
  "historical-performance": HistoricalPerformancePost,
  "favorite-players-and-guilds": FavoritesPost,
  "community-support": CommunitySupportPost,
  "consumable-pricing": ConsumablePricingPost,
  "gear-bis-progression": GearProgressionPost,
  "phase-selections": PhaseSelectionsPost,
  "consumables-panel": ConsumablesPost,
  "vehicle-support": VehicleSupportPost,
  "youtube-sync-refresh": YoutubeSyncPost,
  "guild-pages": GuildPagesPost,
  "armory-refresh": ArmoryRefreshPost,
  "talent-builder-refresh": TalentBuilderRefreshPost,
  parsing: ParsingPost,
  "absorb-attribution": AbsorbAttributionPost,
} as const satisfies Record<string, ComponentType<{ post: BlogPostDefinition }>>;

type BlogPostID = keyof typeof BLOG_COMPONENTS;

/**
 * A 1280x720@30fps Remotion composition. durationInFrames must match the
 * composition's registration in videos/remotion/src/Root.tsx.
 */
function remotionVideo(load: LessonVideo["load"], durationInFrames: number): LessonVideo {
  return { load, durationInFrames, fps: 30, width: 1280, height: 720 };
}

const BLOG_VIDEOS = {
  "ranked-damage": remotionVideo(() => import("@/pages/Instance/videos/RankedDamage.video"), 900),
  "character-cosmetics": remotionVideo(() => import("@/pages/Instance/videos/CharacterCosmetics.video"), 720),
  "layout-editing": remotionVideo(() => import("@/pages/Instance/videos/LayoutEditing.video"), 700),
  "focus-mode": remotionVideo(() => import("@/pages/Instance/videos/FocusMode.video"), 630),
  replay: remotionVideo(() => import("@/pages/Instance/videos/ReplayExplainer.video"), 700),
  "phase-selections": remotionVideo(() => import("@/pages/Instance/videos/EncounterPhasesDiscord.video"), 650),
  "consumables-panel": remotionVideo(() => import("@/pages/Instance/EventsPanels/Consumables/explain/videos/RaidWide.video"), 410),
  parsing: remotionVideo(() => import("@/pages/Instance/EventsPanels/DamageDone/explain/videos/ParseScores.video"), 350),
} as const satisfies Partial<Record<BlogPostID, LessonVideo>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(record: Record<string, unknown>, field: string, id: string): string {
  const value = record[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Blog post ${id} has an empty or invalid ${field}`);
  }
  return value;
}

function optionalString(record: Record<string, unknown>, field: string, id: string): string | undefined {
  const value = record[field];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Blog post ${id} has an empty or invalid ${field}`);
  }
  return value;
}

function normalizeFlavorSets(value: unknown, id: string): readonly BlogFlavorSet[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Blog post ${id} has invalid flavorSets`);
  }

  return value.map((set) => {
    if (!Array.isArray(set) || set.length === 0 || set.some((tag) => typeof tag !== "string" || tag.trim() === "")) {
      throw new Error(`Blog post ${id} has invalid flavorSets`);
    }
    return set as string[];
  });
}

function normalizeBlogPostMetadata(value: unknown): BlogPostMetadata {
  if (!isRecord(value)) {
    throw new Error("Blog post metadata must be an object");
  }

  const id = requiredString(value, "id", "with unknown ID");
  const rarity = requiredString(value, "rarity", id);
  if (!BLOG_RARITIES.includes(rarity as BlogRarity)) {
    throw new Error(`Blog post ${id} has invalid rarity ${rarity}`);
  }

  const flavor = optionalString(value, "flavor", id);
  const youtubeID = optionalString(value, "youtubeID", id);
  const flavorSets = normalizeFlavorSets(value.flavorSets, id);
  const hintTitle = optionalString(value, "hintTitle", id);
  const hintDescription = optionalString(value, "hintDescription", id);
  const hintHref = optionalString(value, "hintHref", id);
  if (value.hintEnabled !== undefined && typeof value.hintEnabled !== "boolean") {
    throw new Error(`Blog post ${id} has invalid hintEnabled`);
  }
  return {
    id,
    title: requiredString(value, "title", id),
    description: requiredString(value, "description", id),
    publishedAt: requiredString(value, "publishedAt", id),
    rarity: rarity as BlogRarity,
    tag: requiredString(value, "tag", id),
    icon: requiredString(value, "icon", id),
    ...(flavor ? { flavor } : {}),
    ...(youtubeID ? { youtubeID } : {}),
    ...(flavorSets ? { flavorSets } : {}),
    ...(hintTitle ? { hintTitle } : {}),
    ...(hintDescription ? { hintDescription } : {}),
    ...(hintHref ? { hintHref } : {}),
    ...(typeof value.hintEnabled === "boolean" ? { hintEnabled: value.hintEnabled } : {}),
  };
}

export function createBlogPosts(
  rawMetadata: readonly unknown[],
  components: Readonly<Record<string, ComponentType<{ post: BlogPostDefinition }>>>,
  videos: Readonly<Record<string, LessonVideo | undefined>> = {},
): BlogPostDefinition[] {
  const seen = new Set<string>();
  const posts = rawMetadata.map((rawPost) => {
    const metadata = normalizeBlogPostMetadata(rawPost);
    if (seen.has(metadata.id)) {
      throw new Error(`Duplicate blog post ID: ${metadata.id}`);
    }
    seen.add(metadata.id);

    const component = components[metadata.id];
    if (!component) {
      throw new Error(`Blog post ${metadata.id} has no component mapping`);
    }

    const video = videos[metadata.id];
    return {
      ...metadata,
      component,
      ...(video ? { video } : {}),
    };
  });

  for (const id of Object.keys(components)) {
    if (!seen.has(id)) {
      throw new Error(`Blog component mapping ${id} has no metadata`);
    }
  }
  for (const id of Object.keys(videos)) {
    if (!seen.has(id)) {
      throw new Error(`Blog video mapping ${id} has no metadata`);
    }
  }

  return posts;
}

export const BLOG_POSTS: readonly BlogPostDefinition[] = createBlogPosts(
  blogPostMetadataJSON,
  BLOG_COMPONENTS,
  BLOG_VIDEOS,
);

export function blogPostPath(postID: string): string {
  return `/blog/${postID}`;
}

export function findBlogPost(postID: string | undefined): BlogPostDefinition | undefined {
  return BLOG_POSTS.find((post) => post.id === postID);
}

export function blogPostMatchesFlavor(post: BlogPostDefinition, flavor: readonly string[]): boolean {
  if (!post.flavorSets || post.flavorSets.length === 0) {
    return true;
  }

  const available = new Set(flavor.map((tag) => tag.toLowerCase()));
  return post.flavorSets.some((required) => required.every((tag) => available.has(tag.toLowerCase())));
}

export function blogPostsForFlavor(flavor: readonly string[]): BlogPostDefinition[] {
  return [...BLOG_POSTS]
    .filter((post) => blogPostMatchesFlavor(post, flavor))
    .sort((left, right) =>
      right.publishedAt.localeCompare(left.publishedAt)
      // Same-day posts list the bigger drop first so it becomes the featured card.
      || BLOG_RARITIES.indexOf(left.rarity) - BLOG_RARITIES.indexOf(right.rarity));
}
