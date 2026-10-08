import type { ComponentType } from "react";
import {
  AbsorbAttributionPost,
  ArmoryRefreshPost,
  CommunitySupportPost,
  ConsumablePricingPost,
  ConsumablesPost,
  CooldownUsagePost,
  CustomPanelsPost,
  FavoritesPost,
  GearProgressionPost,
  GuildPagesPost,
  HistoricalPerformancePost,
  ParsingPost,
  PhaseSelectionsPost,
  TalentBuilderRefreshPost,
  VehicleSupportPost,
  YoutubeSyncPost,
} from "./posts/announcements";
import { BlogLaunchPost } from "./posts/BlogLaunchPost";

export type BlogFlavorSet = readonly string[];

/** Loot rarity communicates the size of an update: legendary for major releases down to common for docs. */
export type BlogRarity = "legendary" | "epic" | "rare" | "uncommon" | "common";

export const BLOG_RARITIES: readonly BlogRarity[] = ["legendary", "epic", "rare", "uncommon", "common"];

export interface BlogPostDefinition {
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
  flavorSets?: readonly BlogFlavorSet[];
  component: ComponentType<{ post: BlogPostDefinition }>;
}

export const BLOG_POSTS: readonly BlogPostDefinition[] = [
  {
    id: "welcome-to-the-chronicle-blog",
    title: "A home for what is new in Chronicle",
    description: "Release notes, feature tours, and the stories behind improvements to Chronicle.",
    publishedAt: "2026-10-08",
    rarity: "rare",
    tag: "Announcement",
    icon: "inv_misc_book_09",
    component: BlogLaunchPost,
  },
  {
    id: "custom-panels",
    title: "Custom panels are now available",
    description: "Community-built panels bring class, encounter, and guild-specific analysis to Chronicle, installable straight from GitHub.",
    publishedAt: "2026-10-07",
    rarity: "legendary",
    tag: "Feature",
    icon: "trade_engineering",
    flavor: "Some assembly required.",
    component: CustomPanelsPost,
  },
  {
    id: "cooldown-usage-panel",
    title: "New panel: Cooldown Usage",
    description: "A manually curated view of class cooldown usage across your raid, and a step towards a full consumable and cooldown view.",
    publishedAt: "2026-10-04",
    rarity: "rare",
    tag: "Panel",
    icon: "spell_nature_bloodlust",
    component: CooldownUsagePost,
  },
  {
    id: "historical-performance",
    title: "Historical performance",
    description: "Compare DPS and HPS growth over time against yourself, your guildies, or your rivals.",
    publishedAt: "2026-09-23",
    rarity: "epic",
    tag: "Feature",
    icon: "inv_misc_pocketwatch_01",
    flavor: "You were better last week. Probably.",
    component: HistoricalPerformancePost,
  },
  {
    id: "favorite-players-and-guilds",
    title: "Favorite players and guilds",
    description: "Armory pages have a Favorite button, and your favorites are a click away in the site settings menu.",
    publishedAt: "2026-09-21",
    rarity: "uncommon",
    tag: "Feature",
    icon: "spell_arcane_starfire",
    component: FavoritesPost,
  },
  {
    id: "community-support",
    title: "Community support",
    description: "Chronicle is free and paywall-free. Server costs are growing, and the support page explains how to help.",
    publishedAt: "2026-08-30",
    rarity: "common",
    tag: "Announcement",
    icon: "inv_misc_bag_10",
    component: CommunitySupportPost,
  },
  {
    id: "consumable-pricing",
    title: "Consumable pricing by WoWAuctions.net",
    description: "Consumables panels now show auction house prices for Capy and ChromieCraft, courtesy of WoWAuctions.net.",
    publishedAt: "2026-08-27",
    rarity: "rare",
    tag: "Integration",
    icon: "inv_misc_coin_01",
    flavor: "That pull was expensive!",
    component: ConsumablePricingPost,
  },
  {
    id: "gear-bis-progression",
    title: "Gear and BiS progression",
    description: "Share gear lists through Chronicle and compare an Armory character's progression against them.",
    publishedAt: "2026-08-26",
    rarity: "epic",
    tag: "Feature",
    icon: "inv_helmet_03",
    flavor: "Need before greed.",
    component: GearProgressionPost,
  },
  {
    id: "phase-selections",
    title: "Phase selections",
    description: "Bosses with multiple phases now have those phases explicitly marked.",
    publishedAt: "2026-08-26",
    rarity: "uncommon",
    tag: "Feature",
    icon: "spell_holy_borrowedtime",
    component: PhaseSelectionsPost,
  },
  {
    id: "consumables-panel",
    title: "Consumables have landed",
    description: "The new Consumables Used panel shows every flask, elixir, and potion used in a raid.",
    publishedAt: "2026-08-09",
    rarity: "epic",
    tag: "Panel",
    icon: "inv_potion_83",
    flavor: "Did you pot? Now we know.",
    component: ConsumablesPost,
  },
  {
    id: "vehicle-support",
    title: "3.3.5a addon update: vehicle support",
    description: "Update to addon 0.7 or newer for vehicle support in raids like Eye of Eternity and Ulduar, plus a new Vehicles panel.",
    publishedAt: "2026-08-09",
    rarity: "rare",
    tag: "Addon",
    icon: "ability_mount_mechastrider",
    flavorSets: [["wrath"]],
    component: VehicleSupportPost,
  },
  {
    id: "youtube-sync-refresh",
    title: "YouTube sync refresh",
    description: "Syncing raid VODs with combat logs got a refresh.",
    publishedAt: "2026-08-09",
    rarity: "uncommon",
    tag: "Improvement",
    icon: "ability_hunter_eagleeye",
    component: YoutubeSyncPost,
  },
  {
    id: "guild-pages",
    title: "Guild pages",
    description: "Guild and raid leaders can start building customizable guild pages.",
    publishedAt: "2026-08-06",
    rarity: "rare",
    tag: "Early access",
    icon: "inv_misc_tabardpvp_01",
    component: GuildPagesPost,
  },
  {
    id: "armory-refresh",
    title: "Armory page refresh",
    description: "Player armory pages got a lot more interesting, with historical data backfilled from old raids.",
    publishedAt: "2026-08-05",
    rarity: "rare",
    tag: "Improvement",
    icon: "inv_chest_plate06",
    component: ArmoryRefreshPost,
  },
  {
    id: "talent-builder-refresh",
    title: "Talent builder refresh",
    description: "Save builds to your account, browse top builds on your server, and see which talents the best players pick.",
    publishedAt: "2026-07-28",
    rarity: "epic",
    tag: "Feature",
    icon: "inv_misc_book_11",
    flavor: "Five clicks per talent was four too many.",
    component: TalentBuilderRefreshPost,
  },
  {
    id: "parsing",
    title: "Parsing",
    description: "Parse scores give players a gauge of their performance for their spec on selected encounters.",
    publishedAt: "2026-07-24",
    rarity: "legendary",
    tag: "Feature",
    icon: "ability_hunter_snipershot",
    flavor: "Gray parse? Never heard of her.",
    component: ParsingPost,
  },
  {
    id: "absorb-attribution",
    title: "Absorb attribution",
    description: "Chronicle now estimates who gets credit for absorbed damage, counted as effective healing.",
    publishedAt: "2026-07-20",
    rarity: "rare",
    tag: "Feature",
    icon: "spell_holy_powerwordshield",
    component: AbsorbAttributionPost,
  },
] as const;

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
