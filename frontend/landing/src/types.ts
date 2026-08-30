export type Expansion = "vanilla" | "tbc" | "wotlk";
export type Client = "1.12.1" | "2.4.3" | "2.5.3" | "3.3.5a";
export type Logging = "server" | "client";
export type Engine =
  | "azerothcore"
  | "trinitycore"
  | "mangos"
  | "custom"
  | "unknown";

export type StatusTag =
  | "closed"
  | "beta"
  | "new"
  | "hardcore"
  | "fresh"
  | "progression"
  | "custom-content";

export interface ServerEntry {
  /** URL slug and Chronicle subdomain prefix. */
  id: string;
  name: string;
  /** One-line tagline shown below the name. */
  tagline: string;
  /** 1–3 sentence description. */
  description: string;

  // Visual
  logo: string;
  banner?: string;
  /** CSS color for optional accent glow on card hover. */
  accentColor?: string;

  // Attributes
  expansion: Expansion;
  client: Client;
  logging: Logging;
  engine: Engine;

  // Links
  chronicleUrl: string;
  homepageUrl?: string;
  discordUrl?: string;

  // Tags
  status?: StatusTag[];

  /** Chronicle infrastructure and hosting costs are managed by the Chronicle project. */
  hostedByChronicle?: boolean;

  /** Reserved for future sponsorship tier; ignored for now. */
  sponsored?: boolean;

  // Discovery metrics (populated from /api/v1/discovery)
  /** Number of instances uploaded in the last 14 days. */
  instances14d?: number;
  /** Distinct players across instances in the last 14 days. */
  uniquePlayers14d?: number;
}

/** Single entry from GET /api/v1/discovery on a Chronicle deployment. */
export interface DiscoveryEntry {
  branding: DiscoveryBranding | null;
  url: string;
  instances_14d?: number;
  unique_players_14d?: number;
}

export interface DiscoveryBranding {
  square_logo?: string;
  logo_wide?: string;
  favicon?: string;
  display_name?: string;
  tagline?: string;
  description?: string;
  background_banner?: string;
  tags?: string[];
}


