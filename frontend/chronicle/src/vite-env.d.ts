/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SERVER_NAME: string;
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
