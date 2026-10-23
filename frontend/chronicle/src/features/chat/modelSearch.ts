import type { InferenceModel } from "@/api/typesGenerated";

interface ModelMatch {
  model: InferenceModel;
  score: number;
}

function normalize(value: string): string {
  return value.toLowerCase().trim();
}

export function filterInferenceModels(models: readonly InferenceModel[], query: string): InferenceModel[] {
  const needle = normalize(query);
  if (!needle) return [...models];

  return models
    .map((model): ModelMatch | null => {
      const name = normalize(model.name);
      const id = normalize(model.id);
      const description = normalize(model.description ?? "");
      const score = name.startsWith(needle)
        ? 4
        : id.startsWith(needle)
          ? 3
          : name.includes(needle)
            ? 2
            : id.includes(needle) || description.includes(needle)
              ? 1
              : 0;
      return score > 0 ? { model, score } : null;
    })
    .filter((match): match is ModelMatch => match !== null)
    .sort((left, right) => right.score - left.score || left.model.name.localeCompare(right.model.name))
    .map(({ model }) => model);
}
