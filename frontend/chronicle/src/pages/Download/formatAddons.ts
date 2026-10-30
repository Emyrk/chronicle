import type { SiteConfig } from "@/api/typesGenerated";
import { hasExplicitServerCapabilities, serverCapabilities } from "@/config/serverCapabilities";

/** A Chronicle addon that turns on combat logging when you log in. */
export interface CompanionAddon {
  name: string;
  url: string;
  /** Client the addon is built for, e.g. "1.12a". */
  client: string;
  /** Client mods the addon needs alongside it. */
  requires: { name: string; url: string }[];
}

const COMPANION: CompanionAddon = {
  name: "ChronicleCompanion",
  url: "https://github.com/Emyrk/ChronicleCompanion/",
  client: "1.12a",
  requires: [{ name: "Nampower", url: "https://github.com/Emyrk/nampower" }],
};

const WOTLK: CompanionAddon = {
  name: "ChronicleCompanionWoTLK",
  url: "https://github.com/Emyrk/ChronicleCompanionWoTLK",
  client: "3.3.5a",
  requires: [],
};

/**
 * Addon per log format, matching the upload page's instructions. A format
 * mapped to null (WoW Forever's Blizzard log) has no addon.
 */
const FORMAT_ADDONS: Record<string, CompanionAddon | null> = {
  "1.12a-cc-addon": COMPANION,
  "1.12a-superwow-addon": {
    ...COMPANION,
    requires: [{ name: "SuperWoW", url: "https://github.com/balakethelock/SuperWoW" }],
  },
  "2.4.3-cc-addon": {
    name: "ChronicleCompanionTBC",
    url: "https://github.com/Emyrk/ChronicleCompanionTBC",
    client: "2.4.3",
    requires: [],
  },
  "3.3.5a-cc-addon": WOTLK,
  "azerothcore-mod": WOTLK,
  "hermesproxy_1_14_2_cc": {
    name: "ChronicleCompanionJimsProxy",
    url: "https://github.com/Smopraq/ChronicleCompanionJimsProxy",
    client: "1.14.2 (HermesProxy)",
    requires: [],
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
