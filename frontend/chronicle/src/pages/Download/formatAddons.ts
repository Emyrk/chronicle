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

/** A game client players can pick, and the addon it logs with. */
export interface ClientOption {
  /** Short client name for the picker, e.g. "1.12". */
  label: string;
  /** Null when the client logs without an addon (WoW Forever's Blizzard log). */
  addon: CompanionAddon | null;
}

/** Client per log format, matching the upload page's instructions. */
const FORMAT_CLIENTS: Record<string, ClientOption> = {
  "1.12a-cc-addon": { label: "1.12", addon: COMPANION },
  "1.12a-superwow-addon": {
    label: "1.12 · SuperWoW",
    addon: { ...COMPANION, requires: [SUPERWOW], optional: [] },
  },
  "2.4.3-cc-addon": {
    label: "2.4.3",
    addon: {
      name: "ChronicleCompanionTBC",
      url: "https://github.com/Emyrk/ChronicleCompanionTBC",
      client: "2.4.3",
      requires: [],
      optional: [],
    },
  },
  "3.3.5a-cc-addon": { label: "3.3.5a", addon: WOTLK },
  "azerothcore-mod": { label: "3.3.5a", addon: WOTLK },
  "hermesproxy_1_14_2_cc": {
    label: "1.14",
    addon: {
      name: "ChronicleCompanionJimsProxy",
      url: "https://github.com/Smopraq/ChronicleCompanionJimsProxy",
      client: "1.14.2 (HermesProxy)",
      requires: [],
      optional: [],
    },
  },
  "v22-cleu": { label: "WoW Forever", addon: null },
};

/**
 * Resolves the clients for this site's upload formats, default format first,
 * using the same precedence as the upload page: tenant > site config >
 * compiled-in default. Formats sharing an addon collapse into one option.
 */
export function tenantClients(siteConfig: SiteConfig | undefined): ClientOption[] {
  const tenant = siteConfig?.tenant;
  const defaultFormat =
    tenant?.default_format ??
    siteConfig?.default_format ??
    (hasExplicitServerCapabilities ? serverCapabilities.defaultFormat : "");
  const available = tenant?.available_formats?.length
    ? tenant.available_formats
    : (siteConfig?.available_formats ?? []);

  const clients: ClientOption[] = [];
  for (const format of [defaultFormat, ...available]) {
    const client = FORMAT_CLIENTS[format];
    if (client && !clients.some((c) => c.addon === client.addon)) clients.push(client);
  }
  return clients;
}
