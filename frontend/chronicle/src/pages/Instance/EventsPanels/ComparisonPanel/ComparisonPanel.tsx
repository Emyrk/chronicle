/**
 * ComparisonPanel – Panel definition for comparing data across multiple panels.
 */

import { BarChart3 } from "lucide-react";
import type { PanelDefinition } from "../types";
import { comparisonProcessor, type ComparisonResult } from "./comparison.processor";
import { ComparisonContent } from "./ComparisonContent";

export function createComparisonPanel(): PanelDefinition<ComparisonResult> {
  return {
    ...comparisonProcessor,
    label: "Comparison",
    icon: <BarChart3 className="h-4 w-4" />,
    render: (props) => <ComparisonContent {...props} />,
  };
}
