import { describe, expect, it } from "vitest";
import type { InferenceModel } from "@/api/typesGenerated";
import { filterInferenceModels } from "./modelSearch";

const models: InferenceModel[] = [
  {
    id: "anthropic/claude-sonnet",
    name: "Anthropic: Claude Sonnet",
    description: "General purpose model",
    context_length: 200_000,
  },
  {
    id: "typesafe/jev-router",
    name: "TypeSafe: Jev Router",
    description: "Routes each request to an appropriate model",
    context_length: 1_000_000,
  },
  {
    id: "openai/gpt",
    name: "OpenAI: GPT",
    description: "General purpose model",
    context_length: 128_000,
  },
];

describe("filterInferenceModels", () => {
  it("searches model names and IDs case-insensitively", () => {
    expect(filterInferenceModels(models, "jev").map((model) => model.id)).toEqual(["typesafe/jev-router"]);
    expect(filterInferenceModels(models, "TYPESAFE").map((model) => model.id)).toEqual(["typesafe/jev-router"]);
  });

  it("keeps equally relevant matches in alphabetical order", () => {
    const result = filterInferenceModels(models, "general");
    expect(result.map((model) => model.id)).toEqual(["anthropic/claude-sonnet", "openai/gpt"]);
  });
});
