// Shared instance configuration - maps instance names to loading screen images
// Source of truth - also used in RaidCard.tsx

export type InstanceContentLevel = 60 | 70 | 80;

export interface InstanceConfig {
  background: string;
  bossCount?: number;
  abbrev?: string;  // Short name for mobile display
  accentColor?: string;
  contentLevel: InstanceContentLevel | readonly InstanceContentLevel[];
}

export const INSTANCE_CONFIG: Record<string, InstanceConfig> = {
  // 40-man Raids
  "Molten Core": { background: "/c/images/loadingscreens/LoadScreenMoltenCore.webp", bossCount: 12, abbrev: "MC", accentColor: "#f97316", contentLevel: 60 },
  "Blackwing Lair": { background: "/c/images/loadingscreens/LoadScreenBlackWingLair.webp", bossCount: 8, abbrev: "BWL", accentColor: "#ef4444", contentLevel: 60 },
  "Temple of Ahn'Qiraj": { background: "/c/images/loadingscreens/LoadScreenAhnQiraj40man.webp", bossCount: 9, abbrev: "AQ40", accentColor: "#d9aa42", contentLevel: 60 },
  "Naxxramas": { background: "/c/images/loadingscreens/LoadScreenNaxxramas.webp", bossCount: 15, abbrev: "Naxx", accentColor: "#82c8b4", contentLevel: [60, 80] },
  "Emerald Sanctum": { background: "/c/images/loadingscreens/LoadScreenEmeraldSanctum.webp", bossCount: 2, abbrev: "ES", accentColor: "#34d399", contentLevel: 60 },
  // 20-man Raids
  "Zul'Gurub": { background: "/c/images/loadingscreens/LoadScreenZulGurub.webp", bossCount: 10, abbrev: "ZG", accentColor: "#ea580c", contentLevel: 60 },
  "Ruins of Ahn'Qiraj": { background: "/c/images/loadingscreens/LoadScreenAhnQiraj20man.webp", bossCount: 6, abbrev: "AQ20", accentColor: "#c8a050", contentLevel: 60 },
  // Single Boss
  "Onyxia's Lair": { background: "/c/images/loadingscreens/LoadScreenRaid.webp", bossCount: 1, abbrev: "Ony", accentColor: "#22c55e", contentLevel: [60, 80] },
  // Turtle WoW Custom
  "Tower of Karazhan": { background: "/c/images/loadingscreens/LoadScreenKarazhan.webp", bossCount: 5, abbrev: "Kara", accentColor: "#8b5cf6", contentLevel: 60 },
  "Lower Tower of Karazhan": { background: "/c/images/loadingscreens/LoadScreenKarazhan.webp", bossCount: 5, abbrev: "Lower Kara", accentColor: "#8b5cf6", contentLevel: 60 },
  "Upper Tower of Karazhan": { background: "/c/images/loadingscreens/LoadScreenKarazhan.webp", bossCount: 9, abbrev: "Upper Kara", accentColor: "#8b5cf6", contentLevel: 60 },
  "Karazhan Crypts": { background: "/c/images/loadingscreens/LoadscreenKarazhanCrypt.webp", bossCount: 3, abbrev: "Crypt", accentColor: "#7c3aed", contentLevel: 60 },
  "Hateforge Quarry": { background: "/c/images/loadingscreens/LoadScreenHateforge.webp", bossCount: 4, abbrev: "HQ", contentLevel: 60, },
  "Gilneas City": { background: "/c/images/loadingscreens/LoadScreenGilneasCity.webp", bossCount: 3, abbrev: "Gilneas", contentLevel: 60, },
  "Icecrown Citadel": { background: "/c/images/loadingscreens/loadscreenicecrowncitadel.webp", bossCount: 12, abbrev: "ICC", contentLevel: 80 },
  "Ruby Sanctum": { background: "/c/images/loadingscreens/loadscreenrubysanctum.webp", bossCount: 1, abbrev: "RS", contentLevel: 80 },
  "Vault of Archavon": { background: "/c/images/loadingscreens/LoadScreenVaultofArchavon.webp", bossCount: 4, abbrev: "VoA", contentLevel: 80 },
  "Obsidian Sanctum": { background: "/c/images/loadingscreens/LoadScreenObsidianSanctum.webp", bossCount: 1, abbrev: "OS", contentLevel: 80 },
  "Eye of Eternity": { background: "/c/images/loadingscreens/LoadScreenEyeofEternity.webp", bossCount: 1, abbrev: "EoE", contentLevel: 80 },
  "Trial of the Crusader": { background: "/c/images/loadingscreens/LoadScreenTrialoftheCrusader.webp", bossCount: 5, abbrev: "ToC", contentLevel: 80 },
  "Ulduar": { background: "/c/images/loadingscreens/LoadScreenUlduar.webp", bossCount: 14, abbrev: "Uld", contentLevel: 80 },

  // TBC Raids
  "Zul'Aman": { background: "/c/images/loadingscreens/LOADSCREENZULAMAN.webp", bossCount: 6, abbrev: "ZA", contentLevel: 70 },
  "Black Temple": { background: "/c/images/loadingscreens/LoadScreenBlackTemple.webp", bossCount: 9, abbrev: "BT", contentLevel: 70 },
  "Hyjal Summit": { background: "/c/images/loadingscreens/LoadScreenHyjal.webp", bossCount: 5, abbrev: "Hyjal", contentLevel: 70 },
  "Magtheridon's Lair": { background: "/c/images/loadingscreens/LOADSCREENHELLFIRECITADELRAID.webp", bossCount: 1, abbrev: "Mag", contentLevel: 70 },
  "Gruul's Lair": { background: "/c/images/loadingscreens/LoadScreenGruulsLair.webp", bossCount: 2, abbrev: "Gruul", contentLevel: 70 },
  "Serpentshrine Cavern": { background: "/c/images/loadingscreens/LoadScreenSerpentshrine.webp", bossCount: 6, abbrev: "SSC", contentLevel: 70 },
  "Tempest Keep": { background: "/c/images/loadingscreens/LOADSCREENTEMPESTKEEP.webp", bossCount: 4, abbrev: "TK", contentLevel: 70 },
  "Sunwell Plateau": { background: "/c/images/loadingscreens/LoadScreenSunwell5Man.webp", bossCount: 6, abbrev: "SWP", contentLevel: 70 },
  "World Bosses": { background: "/c/images/loadingscreens/LoadScreenRaid.webp", abbrev: "World", contentLevel: 60 },
  "Timbermaw Hold": { background: "/c/images/loadingscreens/LoadScreenTimbermaw.webp", abbrev: "TMH", contentLevel: 60 },
  "Windhorn Canyon": { background: "/c/images/loadingscreens/LoadScreenWindhorn.webp", abbrev: "WHC", contentLevel: 60 },
  // Dungeons
  "Frostmane Hollow": { background: "/c/images/loadingscreens/LoadScreenFrostmane.webp", abbrev: "FH", contentLevel: 60 },
  "Black Morass": { background: "/c/images/loadingscreens/LoadScreenCavernsTime.webp", bossCount: 4, abbrev: "BM", contentLevel: 60 },
  "Blackrock Spire": { background: "/c/images/loadingscreens/LoadScreenBlackrockSpire.webp", abbrev: "BRS", contentLevel: 60 },
  "Upper Blackrock Spire": { background: "/c/images/loadingscreens/LoadScreenBlackrockSpire.webp", bossCount: 5, abbrev: "UBRS", contentLevel: 60 },
  "Lower Blackrock Spire": { background: "/c/images/loadingscreens/LoadScreenBlackrockSpire.webp", abbrev: "LBRS", contentLevel: 60 },
  "Deadmines": { background: "/c/images/loadingscreens/LoadScreenDeadmines.webp", bossCount: 8, abbrev: "DM", contentLevel: 60 },
  "Shadowfang Keep": { background: "/c/images/loadingscreens/LoadScreenShadowFangKeep.webp", abbrev: "SFK", contentLevel: 60 },
  "Scarlet Monastery": { background: "/c/images/loadingscreens/LoadScreenMonastery.webp", abbrev: "SM", contentLevel: 60 },
  "Scarlet Monastery Library": { background: "/c/images/loadingscreens/LoadScreenMonastery.webp", bossCount: 3, abbrev: "SM Lib", contentLevel: 60 },
  "Scarlet Monastery Cathedral": { background: "/c/images/loadingscreens/LoadScreenMonastery.webp", bossCount: 2, abbrev: "SM Cath", contentLevel: 60 },
  "Scarlet Monastery Graveyard": { background: "/c/images/loadingscreens/LoadScreenMonastery.webp", abbrev: "SM GY", contentLevel: 60 },
  "Scarlet Monastery Armory": { background: "/c/images/loadingscreens/LoadScreenMonastery.webp", abbrev: "SM Arm", contentLevel: 60 },
  "Stratholme": { background: "/c/images/loadingscreens/LoadScreenStrathome.webp", abbrev: "Strat", contentLevel: 60 },
  "Scholomance": { background: "/c/images/loadingscreens/LoadScreenScholomance.webp", abbrev: "Scholo", contentLevel: 60 },
  "Blackrock Depths": { background: "/c/images/loadingscreens/LoadScreenBlackrockDepths.webp", abbrev: "BRD", contentLevel: 60 },
  "Dire Maul": { background: "/c/images/loadingscreens/LoadScreenDireMaul.webp", abbrev: "DM", contentLevel: 60 },
  "Maraudon": { background: "/c/images/loadingscreens/LoadScreenMaraudon.webp", abbrev: "Mara", contentLevel: 60 },
  "Sunken Temple": { background: "/c/images/loadingscreens/LoadScreenSunkenTemple.webp", abbrev: "ST", contentLevel: 60 },
  "Zul'Farrak": { background: "/c/images/loadingscreens/LoadScreenZulFarrak.webp", abbrev: "ZF", contentLevel: 60 },
  "Uldaman": { background: "/c/images/loadingscreens/LoadScreenUldaman.webp", abbrev: "Ulda", contentLevel: 60 },
  "Razorfen Downs": { background: "/c/images/loadingscreens/LoadScreenRazorfenDowns.webp", abbrev: "RFD", contentLevel: 60 },
  "Razorfen Kraul": { background: "/c/images/loadingscreens/LoadScreenRazorfenKraul.webp", abbrev: "RFK", contentLevel: 60 },
  "Wailing Caverns": { background: "/c/images/loadingscreens/LoadScreenWailingCaverns.webp", abbrev: "WC", contentLevel: 60 },
  "Blackfathom Deeps": { background: "/c/images/loadingscreens/LoadScreenBlackFathomDeeps.webp", abbrev: "BFD", contentLevel: 60 },
  "Gnomeregan": { background: "/c/images/loadingscreens/LoadScreenGnomeregan.webp", abbrev: "Gnomer", contentLevel: 60 },
  "Ragefire Chasm": { background: "/c/images/loadingscreens/LoadScreenRagefireChasm.webp", bossCount: 4, abbrev: "RFC", contentLevel: 60 },
  "Stormwind Stockade": { background: "/c/images/loadingscreens/LoadScreenStormwindStockade.webp", abbrev: "Stocks", contentLevel: 60 },
  "Stormwind Vault": { background: "/c/images/loadingscreens/LoadScreenStormwindStockade.webp", abbrev: "SV", contentLevel: 60 },

  "Stockade": { background: "/c/images/loadingscreens/LoadScreenStormwindStockade.webp", abbrev: "Stocks", contentLevel: 60 },
  "Caverns of Time": { background: "/c/images/loadingscreens/LoadScreenCavernsTime.webp", abbrev: "CoT", contentLevel: 60 },
  // TBC Dungeons
  "Auchenai Crypts": { background: "/c/images/loadingscreens/LOADSCREENAUCHINDOUN.webp", abbrev: "AC", contentLevel: 70 },
  "Mana-Tombs": { background: "/c/images/loadingscreens/LOADSCREENAUCHINDOUN.webp", abbrev: "MT", contentLevel: 70 },
  "Sethekk Halls": { background: "/c/images/loadingscreens/LOADSCREENAUCHINDOUN.webp", abbrev: "SH", contentLevel: 70 },
  "Shadow Labyrinth": { background: "/c/images/loadingscreens/LOADSCREENAUCHINDOUN.webp", abbrev: "SLab", contentLevel: 70 },
  "Hellfire Ramparts": { background: "/c/images/loadingscreens/LOADSCREENHELLFIRECITADEL5MAN.webp", abbrev: "Ramps", contentLevel: 70 },
  "Blood Furnace": { background: "/c/images/loadingscreens/LOADSCREENHELLFIRECITADEL5MAN.webp", abbrev: "BF", contentLevel: 70 },
  "Shattered Halls": { background: "/c/images/loadingscreens/LOADSCREENHELLFIRECITADEL5MAN.webp", abbrev: "SHalls", contentLevel: 70 },
  "The Mechanar": { background: "/c/images/loadingscreens/LOADSCREENTEMPESTKEEP.webp", abbrev: "Mech", contentLevel: 70 },
  "The Botanica": { background: "/c/images/loadingscreens/LOADSCREENTEMPESTKEEP.webp", abbrev: "Bot", contentLevel: 70 },
  "The Arcatraz": { background: "/c/images/loadingscreens/LOADSCREENTEMPESTKEEP.webp", abbrev: "Arc", contentLevel: 70 },
  "Magisters' Terrace": { background: "/c/images/loadingscreens/LoadScreenSunwell5Man.webp", abbrev: "MgT", contentLevel: 70 },
  // WotLK Dungeons
  "The Nexus": { background: "/c/images/loadingscreens/loadscreennexus80.webp", abbrev: "Nexus", contentLevel: 80 },
  "Forge of Souls": { background: "/c/images/loadingscreens/loadscreenicecrown5man.webp", abbrev: "FoS", contentLevel: 80 },
  "Pit of Saron": { background: "/c/images/loadingscreens/loadscreenpitofsaron.webp", abbrev: "PoS", contentLevel: 80 },
  "Halls of Reflection": { background: "/c/images/loadingscreens/loadscreenhallsofreflection.webp", abbrev: "HoR", contentLevel: 80 },
  "The Oculus": { background: "/c/images/loadingscreens/LoadScreenTheOculus.webp", abbrev: "Ocu", contentLevel: 80 },
  "Utgarde Keep": { background: "/c/images/loadingscreens/LoadScreenUtgardeKeep.webp", abbrev: "UK", contentLevel: 80 },
  "Utgarde Pinnacle": { background: "/c/images/loadingscreens/LoadScreenUtgardePinnacle.webp", abbrev: "UP", contentLevel: 80 },
  "Culling of Stratholme": { background: "/c/images/loadingscreens/LoadScreenCullingofStratholme.webp", abbrev: "CoS", contentLevel: 80 },
  "Halls of Stone": { background: "/c/images/loadingscreens/LoadScreenHallsofStone.webp", abbrev: "HoS", contentLevel: 80 },
  "Halls of Lightning": { background: "/c/images/loadingscreens/LoadScreenHallsofLightning.webp", abbrev: "HoL", contentLevel: 80 },
  "Drak'Tharon Keep": { background: "/c/images/loadingscreens/LoadScreenDrakTharonKeep.webp", abbrev: "DTK", contentLevel: 80 },
  "Azjol-Nerub": { background: "/c/images/loadingscreens/LoadScreenAzjolNerub.webp", abbrev: "AN", contentLevel: 80 },
  "Gundrak": { background: "/c/images/loadingscreens/LoadScreenGundrak.webp", abbrev: "GD", contentLevel: 80 },
  "Violet Hold": { background: "/c/images/loadingscreens/LoadScreenVioletHold.webp", abbrev: "VH", contentLevel: 80 },
  "Ahn'kahet: The Old Kingdom": { background: "/c/images/loadingscreens/LoadScreenAhnkahet.webp", abbrev: "OK", contentLevel: 80 },
  "Trial of the Champion": { background: "/c/images/loadingscreens/LoadScreenTrialoftheChampion.webp", abbrev: "ToC5", contentLevel: 80 },

};

export const DEFAULT_BACKGROUND = "/c/images/loadingscreens/LoadScreenDungeon.webp";
export const DEFAULT_INSTANCE_ACCENT = "#64748b";

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

/** Returns the content-level bracket for an instance, using raid size to distinguish reused raid names. */
export function getInstanceContentLevel(
  name: string,
  maxPlayers?: number,
): InstanceContentLevel | undefined {
  const contentLevel = getInstanceConfig(name)?.contentLevel;
  if (contentLevel == null || typeof contentLevel === "number") return contentLevel;

  // Naxxramas and Onyxia's Lair exist as level 60 40-player raids and
  // level 80 10/25-player raids under the same instance name.
  if (maxPlayers == null || maxPlayers <= 0) return undefined;
  return maxPlayers >= 40 ? 60 : 80;
}

export function getInstanceBackground(name: string): string {
  const canonical = resolveInstanceName(name);
  return canonical ? INSTANCE_CONFIG[canonical].background : DEFAULT_BACKGROUND;
}

export function getInstanceAccentColor(name: string): string {
  return getInstanceConfig(name)?.accentColor ?? DEFAULT_INSTANCE_ACCENT;
}

export function getInstanceAbbrev(name: string): string {
  const canonical = resolveInstanceName(name);
  return canonical ? (INSTANCE_CONFIG[canonical].abbrev ?? canonical) : name;
}
