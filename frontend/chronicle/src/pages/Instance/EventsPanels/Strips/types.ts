import type { StripOrientation } from "@/components/layout/GridLayoutEditor";
import type { PanelDefinition, PanelRenderProps } from "../types";
import type { ProcessorEvent } from "../processorTypes";

export type StripType = "replay" | "raid_durability" | "consumables_cost";

export interface StripSizeProfile {
  minLength: number;
  preferredLength: number;
  maxLength?: number;
  minThickness: number;
  preferredThickness: number;
  maxThickness?: number;
}

export interface ResolvedStripSize {
  minW: number;
  minH: number;
  maxW?: number;
  maxH?: number;
  preferredW: number;
  preferredH: number;
}

export function resolveStripSize(
  size: StripSizeProfile,
  orientation: StripOrientation,
): ResolvedStripSize {
  if (orientation === "vertical") {
    return {
      minW: size.minThickness,
      minH: size.minLength,
      maxW: size.maxThickness,
      maxH: size.maxLength,
      preferredW: size.preferredThickness,
      preferredH: size.preferredLength,
    };
  }

  return {
    minW: size.minLength,
    minH: size.minThickness,
    maxW: size.maxLength,
    maxH: size.maxThickness,
    preferredW: size.preferredLength,
    preferredH: size.preferredThickness,
  };
}

export interface StripRenderProps<TResult> extends PanelRenderProps<TResult> {
  orientation: StripOrientation;
}

export interface StripDefinition<
  TResult,
  TEvent extends ProcessorEvent = ProcessorEvent,
> extends Omit<PanelDefinition<TResult, TEvent>, "render"> {
  supportedOrientations: readonly StripOrientation[];
  defaultOrientation: StripOrientation;
  size: StripSizeProfile;
  render: (props: StripRenderProps<TResult>) => React.ReactNode;
}
