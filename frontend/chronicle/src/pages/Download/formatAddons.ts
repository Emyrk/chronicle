import type { SiteConfig } from "@/api/typesGenerated";
import { hasExplicitServerCapabilities, serverCapabilities } from "@/config/serverCapabilities";

/** A client mod installed alongside the addon. */
export interface ClientMod {
  name: string;
  url: string;
  /** What it does for Chronicle. */
  note: string;
  /** A caveat worth calling out on its own. */
  warning?: string;
}

/** A Chronicle addon that turns on combat logging when you log in. */
export interface CompanionAddon {
  name: string;
  url: string;
  /** Client the addon is built for, e.g. "1.12a". */
  client: string;
  /** Client mods the addon needs alongside it. */
  requires: ClientMod[];
  /** Client mods that add unit positions for the replay map. */
  optional: ClientMod[];
}

const NAMPOWER: ClientMod = {
  name: "Nampower",
  url: "https://github.com/Emyrk/nampower/releases",
  note: "A DLL mod the addon logs through. Put nampower.dll in your WoW folder, add it to dlls.txt and launch the game with VanillaFixes.",
};

const SUPERWOW: ClientMod = {
  name: "SuperWoW",
  url: "https://github.com/balakethelock/SuperWoW",
  note: "Friendly unit positions only.",
  warning: "SuperWoW doesn't record enemy unit positions, so bosses and adds won't show on the replay map.",
};

const COMPANION: CompanionAddon = {
  name: "ChronicleCompanion",
  url: "https://github.com/Emyrk/ChronicleCompanion/",
  client: "1.12a",
  requires: [NAMPOWER],
  optional: [
    { name: "ClassicAPI", url: "https://github.com/brues-code/ClassicAPI", note: "Positions for every unit, friend and enemy." },
    SUPERWOW,
  ],
};

const WOTLK: CompanionAddon = {
  name: "ChronicleCompanionWoTLK",
  url: "https://github.com/Emyrk/ChronicleCompanionWoTLK",
  client: "3.3.5a",
  requires: [],
  optional: [
    {
      name: "ChronicleSidekickBridgeWoTLK",
      url: "https://github.com/Emyrk/ChronicleSidekickBridgeWoTLK",
      note: "Friendly unit positions.",
    },
  ],
};

/**
 * Addon per log format, matching the upload page's instructions. A format
 * mapped to null (WoW Forever's Blizzard log) has no addon.
 */
const FORMAT_ADDONS: Record<string, CompanionAddon | null> = {
  "1.12a-cc-addon": COMPANION,
  "1.12a-superwow-addon": { ...COMPANION, requires: [SUPERWOW], optional: [] },
  "2.4.3-cc-addon": {
    name: "ChronicleCompanionTBC",
    url: "https://github.com/Emyrk/ChronicleCompanionTBC",
    client: "2.4.3",
    requires: [],
    optional: [],
  },
  "3.3.5a-cc-addon": WOTLK,
  "azerothcore-mod": WOTLK,
  "hermesproxy_1_14_2_cc": {
    name: "ChronicleCompanionJimsProxy",
    url: "https://github.com/Smopraq/ChronicleCompanionJimsProxy",
    client: "1.14.2 (HermesProxy)",
    requires: [],
    optional: [],
  },
  "v22-cleu": null,
};

export interface TenantAddons {
  /** Addons for the tenant's formats, default format's first. */
  addons: CompanionAddon[];
  /** The default format logs without an addon (WoW Forever). */
  defaultNeedsNoAddon: boolean;
}

/**
 * Resolves the addons for this site's upload formats, using the same
 * precedence as the upload page: tenant > site config > compiled-in default.
 */
export function tenantAddons(siteConfig: SiteConfig | undefined): TenantAddons {
  const tenant = siteConfig?.tenant;
  const defaultFormat =
    tenant?.default_format ??
    siteConfig?.default_format ??
    (hasExplicitServerCapabilities ? serverCapabilities.defaultFormat : "");
  const available = tenant?.available_formats?.length
    ? tenant.available_formats
    : (siteConfig?.available_formats ?? []);

  const addons: CompanionAddon[] = [];
  for (const format of [defaultFormat, ...available]) {
    const addon = FORMAT_ADDONS[format];
    if (addon && !addons.includes(addon)) addons.push(addon);
  }
  return { addons, defaultNeedsNoAddon: FORMAT_ADDONS[defaultFormat] === null };
}
