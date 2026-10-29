/// <reference types="vite/client" />

interface Window {
  sizes: () => void;
  __CHRONICLE_BLOG_FLAVOR__?: string[];
}

interface ImportMetaEnv {
  readonly VITE_SERVER_NAME: string;
  /** /start hero: the featured public instance replayed in 3D (unset: the poster only). */
  readonly VITE_LANDING_FEATURED_INSTANCE?: string;
  /** /start hero: seconds into the featured run where the replay starts. */
  readonly VITE_LANDING_FEATURED_START_S?: string;
  readonly CHRONICLE_PREVIEW_ADS: boolean;
  readonly CHRONICLE_PREVIEW_ADS_DEMO: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Alias for server-specific spell test vectors (resolved via vite.config.ts).
declare module "@testdata/spellTestVectors" {
  import type { WoWSpell } from "@/api/wowdb";
  export const testSpells: Array<{
    id: number;
    name: string;
    descriptionTemplate: string;
    auraDescriptionTemplate: string;
    crossSpellRefs: number[];
  }>;
  export const spells: Record<number, WoWSpell>;
}
