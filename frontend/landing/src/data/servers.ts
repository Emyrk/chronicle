import type { ServerEntry } from "../types";

/**
 * Static registry of Chronicle-enabled WoW private servers.
 * This is the baseline data — always shown even if discovery fails.
 *
 * To add a server, append an entry here. Logos go in public/servers/<id>/logo.png.
 * Banners (optional) go in public/servers/<id>/banner.webp.
 */
export const SERVERS: ServerEntry[] = [
  // {
  //   id: "turtle",
  //   name: "Turtle WoW",
  //   tagline: "Vanilla+ with custom content",
  //   description:
  //     "Vanilla 1.12-based server with extensive custom quests, zones, dungeons, raids, races, and class changes. Focuses on expanding the original Azeroth while preserving a Classic-style experience.",
  //   logo: "servers/turtle/logo.png",
  //   banner: "servers/turtle/banner.webp",
  //   accentColor: "#4ade80",
  //   expansion: "vanilla",
  //   client: "1.12.1",
  //   logging: "client",
  //   engine: "unknown",
  //   chronicleUrl: "https://turtle.chronicleclassic.com",
  //   homepageUrl: "https://turtlecraft.gg",
  //   status: ["closed", "custom-content"],
  // },
  {
    id: "alterac",
    name: "Alterac",
    tagline: "Phased WotLK+ with custom content",
    description:
      "A phased WotLK 3.3.5a server with new questlines, level-up raids, heroic dungeons, cross-faction play, and optional free-for-all War Mode.",
    logo: "https://icons.chronicleclassic.com/servers/alterac/logo.webp",
    banner: "https://icons.chronicleclassic.com/servers/alterac/background.webp",
    accentColor: "#ef4444",
    expansion: "wotlk",
    client: "3.3.5a",
    logging: "server",
    engine: "custom",
    chronicleUrl: "https://logs.alterac.gg",
    homepageUrl: "https://alterac.gg",
    status: ["progression", "custom-content"],
  },
  {
    id: "oldmanwarcraft",
    name: "Old Man Warcraft",
    tagline: "WotLK with PlayerBots",
    description:
      "Laid-back WotLK 3.3.5a community server built around AzerothCore and PlayerBots. Designed to support small-group progression with bot-assisted dungeon and raid play.",
    logo: "servers/oldmanwarcraft/logo.png",
    banner: "servers/oldmanwarcraft/banner.webp",
    accentColor: "#d97706",
    expansion: "wotlk",
    client: "3.3.5a",
    logging: "server",
    engine: "azerothcore",
    chronicleUrl: "https://logs.oldmanwarcraft.com",
    homepageUrl: "https://oldmanwarcraft.com",
  },
];

/**
 * Additional Chronicle deployment URLs to auto-discover via /api/v1/discovery.
 * Discovered servers are merged on top of SERVERS by chronicleUrl match
 * (enriching with instances24h, live branding, etc). New URLs not in SERVERS
 * are appended to the list.
 */
export const DISCOVERY_URLS: string[] = [
  // Add URLs here as servers configure their branding.
  // e.g. "https://turtle.chronicleclassic.com",
  "https://legacy.chronicleclassic.com",
  "https://turtle.chronicleclassic.com"
];

