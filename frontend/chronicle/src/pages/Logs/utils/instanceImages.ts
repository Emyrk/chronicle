// Shared instance configuration - maps instance names to loading screen images
// Source of truth - also used in RaidCard.tsx

export type InstanceCategory = "raid" | "dungeon" | "unknown";

export interface InstanceConfig {
  background: string;
  bossCount?: number;
  abbrev?: string;  // Short name for mobile display
  category?: Exclude<InstanceCategory, "unknown">;
}

export const INSTANCE_CONFIG: Record<string, InstanceConfig> = {
  // 40-man Raids
  "Molten Core": { background: "/c/images/loadingscreens/LoadScreenMoltenCore.webp", bossCount: 12, abbrev: "MC", category: "raid" },
  "Blackwing Lair": { background: "/c/images/loadingscreens/LoadScreenBlackWingLair.webp", bossCount: 8, abbrev: "BWL", category: "raid" },
  "Temple of Ahn'Qiraj": { background: "/c/images/loadingscreens/LoadScreenAhnQiraj40man.webp", bossCount: 9, abbrev: "AQ40", category: "raid" },
  "Naxxramas": { background: "/c/images/loadingscreens/LoadScreenNaxxramas.webp", bossCount: 15, abbrev: "Naxx", category: "raid" },
  "Vault of Archavon": { background: "/c/images/loadingscreens/LoadScreenRaid.webp", bossCount: 4, abbrev: "VoA", category: "raid" },
  "Obsidian Sanctum": { background: "/c/images/loadingscreens/LoadScreenRaid.webp", bossCount: 4, abbrev: "OS", category: "raid" },
  "Eye of Eternity": { background: "/c/images/loadingscreens/LoadScreenRaid.webp", bossCount: 1, abbrev: "EoE", category: "raid" },
  "Trial of the Crusader": { background: "/c/images/loadingscreens/LoadScreenRaid.webp", bossCount: 5, abbrev: "ToC", category: "raid" },
  "Ruby Sanctum": { background: "/c/images/loadingscreens/LoadScreenRaid.webp", bossCount: 4, abbrev: "RS", category: "raid" },
  "Emerald Sanctum": { background: "/c/images/loadingscreens/LoadScreenEmeraldSanctum.webp", bossCount: 2, abbrev: "ES", category: "raid" },
  // 20-man Raids
  "Zul'Gurub": { background: "/c/images/loadingscreens/LoadScreenZulGurub.webp", bossCount: 10, abbrev: "ZG", category: "raid" },
  "Ruins of Ahn'Qiraj": { background: "/c/images/loadingscreens/LoadScreenAhnQiraj20man.webp", bossCount: 6, abbrev: "AQ20", category: "raid" },
  // Single Boss
  "Onyxia's Lair": { background: "/c/images/loadingscreens/LoadScreenRaid.webp", bossCount: 1, abbrev: "Ony", category: "raid" },
  // Turtle WoW Custom
  "Tower of Karazhan": { background: "/c/images/loadingscreens/LoadScreenKarazhan.webp", bossCount: 5, abbrev: "Kara", category: "raid" },
  "Karazhan Crypts": { background: "/c/images/loadingscreens/LoadscreenKarazhanCrypt.webp", bossCount: 3, abbrev: "Crypt", },
  "Hateforge Quarry": { background: "/c/images/loadingscreens/LoadScreenHateforge.webp", bossCount: 4, abbrev: "HQ", },
  "Gilneas City": { background: "/c/images/loadingscreens/LoadScreenGilneasCity.webp", bossCount: 3, abbrev: "Gilneas", },
  "World Bosses": { background: "/c/images/loadingscreens/LoadScreenRaid.webp", abbrev: "World", category: "raid" },
  "Timbermaw Hold": { background: "/c/images/loadingscreens/LoadScreenTimbermaw.webp", abbrev: "TMH", category: "raid"},
  "Windhorn Canyon": { background: "/c/images/loadingscreens/LoadScreenWindhorn.webp", abbrev: "WHC" },
  // Dungeons
  "Frostmane Hollow": { background: "/c/images/loadingscreens/LoadScreenFrostmane.webp", abbrev: "FH" },
  "Black Morass": { background: "/c/images/loadingscreens/LoadScreenCavernsTime.webp", bossCount: 4, abbrev: "BM" },
  "Forge of Souls": { background: "/c/images/loadingscreens/LoadScreenDungeon.webp", bossCount: 2, abbrev: "FoS" },
  "Halls of Reflection": { background: "/c/images/loadingscreens/LoadScreenDungeon.webp", bossCount: 3, abbrev: "HoR" },
  "The Nexus": { background: "/c/images/loadingscreens/LoadScreenDungeon.webp", bossCount: 5, abbrev: "Nexus" },
  "The Oculus": { background: "/c/images/loadingscreens/LoadScreenDungeon.webp", bossCount: 4, abbrev: "Oculus" },
  "Blackrock Spire": { background: "/c/images/loadingscreens/LoadScreenBlackrockSpire.webp", abbrev: "BRS" },
  "Upper Blackrock Spire": { background: "/c/images/loadingscreens/LoadScreenBlackrockSpire.webp", bossCount: 5, abbrev: "UBRS"},
  "Lower Blackrock Spire": { background: "/c/images/loadingscreens/LoadScreenBlackrockSpire.webp", abbrev: "LBRS" },
  "Deadmines": { background: "/c/images/loadingscreens/LoadScreenDeadmines.webp", bossCount: 8, abbrev: "DM" },
  "Shadowfang Keep": { background: "/c/images/loadingscreens/LoadScreenShadowFangKeep.webp", abbrev: "SFK" },
  "Scarlet Monastery": { background: "/c/images/loadingscreens/LoadScreenMonastery.webp", abbrev: "SM" },
  "Scarlet Monastery Library": { background: "/c/images/loadingscreens/LoadScreenMonastery.webp", bossCount: 3, abbrev: "SM Lib" },
  "Scarlet Monastery Cathedral": { background: "/c/images/loadingscreens/LoadScreenMonastery.webp", bossCount: 2, abbrev: "SM Cath" },
  "Scarlet Monastery Graveyard": { background: "/c/images/loadingscreens/LoadScreenMonastery.webp", abbrev: "SM GY" },
  "Scarlet Monastery Armory": { background: "/c/images/loadingscreens/LoadScreenMonastery.webp", abbrev: "SM Arm" },
  "Stratholme": { background: "/c/images/loadingscreens/LoadScreenStrathome.webp", abbrev: "Strat" },
  "Scholomance": { background: "/c/images/loadingscreens/LoadScreenScholomance.webp", abbrev: "Scholo" },
  "Blackrock Depths": { background: "/c/images/loadingscreens/LoadScreenBlackrockDepths.webp", abbrev: "BRD" },
  "Dire Maul": { background: "/c/images/loadingscreens/LoadScreenDireMaul.webp", abbrev: "DM" },
  "Maraudon": { background: "/c/images/loadingscreens/LoadScreenMaraudon.webp", abbrev: "Mara" },
  "Sunken Temple": { background: "/c/images/loadingscreens/LoadScreenSunkenTemple.webp", abbrev: "ST" },
  "Zul'Farrak": { background: "/c/images/loadingscreens/LoadScreenZulFarrak.webp", abbrev: "ZF" },
  "Uldaman": { background: "/c/images/loadingscreens/LoadScreenUldaman.webp", abbrev: "Ulda" },
  "Razorfen Downs": { background: "/c/images/loadingscreens/LoadScreenRazorfenDowns.webp", abbrev: "RFD" },
  "Razorfen Kraul": { background: "/c/images/loadingscreens/LoadScreenRazorfenKraul.webp", abbrev: "RFK" },
  "Wailing Caverns": { background: "/c/images/loadingscreens/LoadScreenWailingCaverns.webp", abbrev: "WC" },
  "Blackfathom Deeps": { background: "/c/images/loadingscreens/LoadScreenBlackFathomDeeps.webp", abbrev: "BFD" },
  "Gnomeregan": { background: "/c/images/loadingscreens/LoadScreenGnomeregan.webp", abbrev: "Gnomer" },
  "Ragefire Chasm": { background: "/c/images/loadingscreens/LoadScreenRagefireChasm.webp", bossCount: 4, abbrev: "RFC" },
  "Stormwind Stockade": { background: "/c/images/loadingscreens/LoadScreenStormwindStockade.webp", abbrev: "Stocks" },
  "Stockade": { background: "/c/images/loadingscreens/LoadScreenStormwindStockade.webp", abbrev: "Stocks" },
  "Caverns of Time": { background: "/c/images/loadingscreens/LoadScreenCavernsTime.webp", abbrev: "CoT" },
};

export const DEFAULT_BACKGROUND = "/c/images/loadingscreens/LoadScreenDungeon.webp";

export function getInstanceConfig(name: string): InstanceConfig | undefined {
  return INSTANCE_CONFIG[name];
}

export function getInstanceCategory(name: string): InstanceCategory {
  const config = INSTANCE_CONFIG[name];
  if (!config) {
    return "unknown";
  }

  return config.category ?? "dungeon";
}

export function getInstanceBackground(name: string): string {
  return INSTANCE_CONFIG[name]?.background ?? DEFAULT_BACKGROUND;
}

export function getInstanceAbbrev(name: string): string {
  return INSTANCE_CONFIG[name]?.abbrev ?? name;
}
