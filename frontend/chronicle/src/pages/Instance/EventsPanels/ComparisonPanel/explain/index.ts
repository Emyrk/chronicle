import { createElement } from "react";
import type { PanelExplainer } from "../../../PanelExplainer/types";
import type { ComparisonResult } from "../comparison.processor";
import {
  deriveCapabilities,
  type ComparisonCapabilities,
} from "./capabilities";
import { ExampleComparisonPanel } from "./ExampleComparisonPanel";
import { COMPARISON_LESSONS } from "./lessons";

export const comparisonExplainer: PanelExplainer<
  ComparisonResult,
  ComparisonCapabilities
> = {
  summary:
    "Combines metric bar data from two or more panels into one stacked view, so every row shows how the selected sources split the total.",
  tips: [
    "Place the source panels in the layout before opening Comparison",
    "Assign each source panel a distinct border color",
    "Select at least two panels; add more whenever you need another metric",
    "Use Matched only to keep rows present in every selected source",
    "Per second applies the same encounter-duration conversion to every source",
  ],
  lessonSet: {
    deriveCapabilities,
    lessons: COMPARISON_LESSONS,
    renderExample: () => createElement(ExampleComparisonPanel),
  },
};
