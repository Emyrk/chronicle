import type { MiniatureManifest } from "@/pages/Instance/EventsPanels/Map/bossMinis";

export type ModelRegistryTab = "miniatures" | "game_models";
export type RegistryModel = MiniatureManifest["miniatures"][number];

const EMPTY_MODELS: RegistryModel[] = [];

export function registryModels(manifest: MiniatureManifest | undefined, tab: ModelRegistryTab): RegistryModel[] {
  return manifest?.[tab] ?? EMPTY_MODELS;
}

export function filterRegistryModels(models: RegistryModel[], search: string): RegistryModel[] {
  const query = search.trim().toLowerCase();
  if (!query) return models;
  return models.filter((model) =>
    model.name.toLowerCase().includes(query)
    || model.path.toLowerCase().includes(query)
    || model.entry_ids.some((entry) => String(entry).includes(query)),
  );
}
