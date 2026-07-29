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
  "Emerald Sanctum": { background: "/c/images/loadingscreens/LoadScreenEmeraldSanctum.webp", bossCount: 2, abbrev: "ES", category: "raid" },
  // 20-man Raids
  "Zul'Gurub": { background: "/c/images/loadingscreens/LoadScreenZulGurub.webp", bossCount: 10, abbrev: "ZG", category: "raid" },
  "Ruins of Ahn'Qiraj": { background: "/c/images/loadingscreens/LoadScreenAhnQiraj20man.webp", bossCount: 6, abbrev: "AQ20", category: "raid" },
  // Single Boss
  "Onyxia's Lair": { background: "/c/images/loadingscreens/LoadScreenRaid.webp", bossCount: 1, abbrev: "Ony", category: "raid" },
  // Turtle WoW Custom
  "Tower of Karazhan": { background: "/c/images/loadingscreens/LoadScreenKarazhan.webp", bossCount: 5, abbrev: "Kara", category: "raid" },
  "Lower Tower of Karazhan": { background: "/c/images/loadingscreens/LoadScreenKarazhan.webp", bossCount: 5, abbrev: "Lower Kara", category: "raid" },
  "Upper Tower of Karazhan": { background: "/c/images/loadingscreens/LoadScreenKarazhan.webp", bossCount: 9, abbrev: "Upper Kara", category: "raid" },
  "Karazhan Crypts": { background: "/c/images/loadingscreens/LoadscreenKarazhanCrypt.webp", bossCount: 3, abbrev: "Crypt", },
  "Hateforge Quarry": { background: "/c/images/loadingscreens/LoadScreenHateforge.webp", bossCount: 4, abbrev: "HQ", },
  "Gilneas City": { background: "/c/images/loadingscreens/LoadScreenGilneasCity.webp", bossCount: 3, abbrev: "Gilneas", },
  "Icecrown Citadel": { background: "/c/images/loadingscreens/loadscreenicecrowncitadel.webp", bossCount: 12, abbrev: "ICC", category: "raid" },
  "Ruby Sanctum": { background: "/c/images/loadingscreens/loadscreenrubysanctum.webp", bossCount: 1, abbrev: "RS", category: "raid" },
  "Vault of Archavon": { background: "/c/images/loadingscreens/LoadScreenVaultofArchavon.webp", bossCount: 4, abbrev: "VoA", category: "raid" },
  "Obsidian Sanctum": { background: "/c/images/loadingscreens/LoadScreenObsidianSanctum.webp", bossCount: 1, abbrev: "OS", category: "raid" },
  "Eye of Eternity": { background: "/c/images/loadingscreens/LoadScreenEyeofEternity.webp", bossCount: 1, abbrev: "EoE", category: "raid" },
  "Trial of the Crusader": { background: "/c/images/loadingscreens/LoadScreenTrialoftheCrusader.webp", bossCount: 5, abbrev: "ToC", category: "raid" },
  "Ulduar": { background: "/c/images/loadingscreens/LoadScreenUlduar.webp", bossCount: 14, abbrev: "Uld", category: "raid" },

  // TBC Raids
  "Zul'Aman": { background: "/c/images/loadingscreens/LOADSCREENZULAMAN.webp", bossCount: 6, abbrev: "ZA", category: "raid" },
  "Black Temple": { background: "/c/images/loadingscreens/LoadScreenBlackTemple.webp", bossCount: 9, abbrev: "BT", category: "raid" },
  "Hyjal Summit": { background: "/c/images/loadingscreens/LoadScreenHyjal.webp", bossCount: 5, abbrev: "Hyjal", category: "raid" },
  "Magtheridon's Lair": { background: "/c/images/loadingscreens/LOADSCREENHELLFIRECITADELRAID.webp", bossCount: 1, abbrev: "Mag", category: "raid" },
  "Gruul's Lair": { background: "/c/images/loadingscreens/LoadScreenGruulsLair.webp", bossCount: 2, abbrev: "Gruul", category: "raid" },
  "Tempest Keep": { background: "/c/images/loadingscreens/LOADSCREENTEMPESTKEEP.webp", bossCount: 4, abbrev: "TK", category: "raid" },
  "Sunwell Plateau": { background: "/c/images/loadingscreens/LoadScreenSunwell5Man.webp", bossCount: 6, abbrev: "SWP", category: "raid" },
  "World Bosses": { background: "/c/images/loadingscreens/LoadScreenRaid.webp", abbrev: "World", category: "raid" },
  "Timbermaw Hold": { background: "/c/images/loadingscreens/LoadScreenTimbermaw.webp", abbrev: "TMH", category: "raid"},
  "Windhorn Canyon": { background: "/c/images/loadingscreens/LoadScreenWindhorn.webp", abbrev: "WHC" },
  // Dungeons
  "Frostmane Hollow": { background: "/c/images/loadingscreens/LoadScreenFrostmane.webp", abbrev: "FH" },
  "Black Morass": { background: "/c/images/loadingscreens/LoadScreenCavernsTime.webp", bossCount: 4, abbrev: "BM" },
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
  "Stormwind Vault": { background: "/c/images/loadingscreens/LoadScreenStormwindStockade.webp", abbrev: "SV" },

  "Stockade": { background: "/c/images/loadingscreens/LoadScreenStormwindStockade.webp", abbrev: "Stocks" },
  "Caverns of Time": { background: "/c/images/loadingscreens/LoadScreenCavernsTime.webp", abbrev: "CoT" },
  // TBC Dungeons
  "Auchenai Crypts": { background: "/c/images/loadingscreens/LOADSCREENAUCHINDOUN.webp", abbrev: "AC" },
  "Mana-Tombs": { background: "/c/images/loadingscreens/LOADSCREENAUCHINDOUN.webp", abbrev: "MT" },
  "Sethekk Halls": { background: "/c/images/loadingscreens/LOADSCREENAUCHINDOUN.webp", abbrev: "SH" },
  "Shadow Labyrinth": { background: "/c/images/loadingscreens/LOADSCREENAUCHINDOUN.webp", abbrev: "SLab" },
  "Hellfire Ramparts": { background: "/c/images/loadingscreens/LOADSCREENHELLFIRECITADEL5MAN.webp", abbrev: "Ramps" },
  "Blood Furnace": { background: "/c/images/loadingscreens/LOADSCREENHELLFIRECITADEL5MAN.webp", abbrev: "BF" },
  "Shattered Halls": { background: "/c/images/loadingscreens/LOADSCREENHELLFIRECITADEL5MAN.webp", abbrev: "SHalls" },
  "The Mechanar": { background: "/c/images/loadingscreens/LOADSCREENTEMPESTKEEP.webp", abbrev: "Mech" },
  "The Botanica": { background: "/c/images/loadingscreens/LOADSCREENTEMPESTKEEP.webp", abbrev: "Bot" },
  "The Arcatraz": { background: "/c/images/loadingscreens/LOADSCREENTEMPESTKEEP.webp", abbrev: "Arc" },
  "Magisters' Terrace": { background: "/c/images/loadingscreens/LoadScreenSunwell5Man.webp", abbrev: "MgT" },
  // WotLK Dungeons
  "The Nexus": { background: "/c/images/loadingscreens/loadscreennexus80.webp", abbrev: "Nexus" },
  "Forge of Souls": { background: "/c/images/loadingscreens/loadscreenicecrown5man.webp", abbrev: "FoS" },
  "Pit of Saron": { background: "/c/images/loadingscreens/loadscreenpitofsaron.webp", abbrev: "PoS" },
  "Halls of Reflection": { background: "/c/images/loadingscreens/loadscreenhallsofreflection.webp", abbrev: "HoR" },
  "The Oculus": { background: "/c/images/loadingscreens/LoadScreenTheOculus.webp", abbrev: "Ocu" },
  "Utgarde Keep": { background: "/c/images/loadingscreens/LoadScreenUtgardeKeep.webp", abbrev: "UK" },
  "Utgarde Pinnacle": { background: "/c/images/loadingscreens/LoadScreenUtgardePinnacle.webp", abbrev: "UP" },
  "Culling of Stratholme": { background: "/c/images/loadingscreens/LoadScreenCullingofStratholme.webp", abbrev: "CoS" },
  "Halls of Stone": { background: "/c/images/loadingscreens/LoadScreenHallsofStone.webp", abbrev: "HoS" },
  "Halls of Lightning": { background: "/c/images/loadingscreens/LoadScreenHallsofLightning.webp", abbrev: "HoL" },
  "Drak'Tharon Keep": { background: "/c/images/loadingscreens/LoadScreenDrakTharonKeep.webp", abbrev: "DTK" },
  "Azjol-Nerub": { background: "/c/images/loadingscreens/LoadScreenAzjolNerub.webp", abbrev: "AN" },
  "Gundrak": { background: "/c/images/loadingscreens/LoadScreenGundrak.webp", abbrev: "GD" },
  "Violet Hold": { background: "/c/images/loadingscreens/LoadScreenVioletHold.webp", abbrev: "VH" },
  "Ahn'kahet: The Old Kingdom": { background: "/c/images/loadingscreens/LoadScreenAhnkahet.webp", abbrev: "OK" },
  "Trial of the Champion": { background: "/c/images/loadingscreens/LoadScreenTrialoftheChampion.webp", abbrev: "ToC5" },

};

export const DEFAULT_BACKGROUND = "/c/images/loadingscreens/LoadScreenDungeon.webp";

// Pre-computed lowercase → canonical name map for case-insensitive lookup
const INSTANCE_NAME_LOOKUP = new Map<string, string>(
  Object.keys(INSTANCE_CONFIG).map((name) => [name.toLowerCase(), name]),
);

/** Resolve an instance name case-insensitively, returning the canonical config key or undefined. */
export function resolveInstanceName(name: string): string | undefined {
  // Fast path: exact match
  if (name in INSTANCE_CONFIG) return name;
  return INSTANCE_NAME_LOOKUP.get(name.toLowerCase());
}

export function getInstanceConfig(name: string): InstanceConfig | undefined {
  const canonical = resolveInstanceName(name);
  return canonical ? INSTANCE_CONFIG[canonical] : undefined;
}

export function getInstanceCategory(
  name: string,
  flavor: readonly string[] = [],
): InstanceCategory {
  const canonical = resolveInstanceName(name);
  if (!canonical) return "unknown";
  if (canonical === "Scarlet Monastery" && flavor.includes("vanillaplus")) {
    return "raid";
  }
  return INSTANCE_CONFIG[canonical].category ?? "dungeon";
}

export function getInstanceBackground(name: string): string {
  const canonical = resolveInstanceName(name);
  return canonical ? INSTANCE_CONFIG[canonical].background : DEFAULT_BACKGROUND;
}

export function getInstanceAbbrev(name: string): string {
  const canonical = resolveInstanceName(name);
  return canonical ? (INSTANCE_CONFIG[canonical].abbrev ?? canonical) : name;
}
