import { ToolsBackLink } from "@/pages/Tools/ToolsBackLink";
import { MapLegend } from "./MapLegend";

/** The replay map legend in Tools & FAQ; the Map panel's "?" explainer shows the same legend. */
export function MapLegendPage() {
  return (
    <div className="container mx-auto max-w-5xl px-4 py-12">
      <ToolsBackLink className="mb-6" />
      <h1 className="mb-2 text-3xl font-bold">Replay map legend</h1>
      <p className="mb-8 max-w-2xl text-muted-foreground">
        What everything on the replay map means: open an encounter, pick the <strong>Map</strong> panel and watch the fight in 3D.
        Every unit is a token on the ground; click one to select it and follow who it is acting on.
      </p>
      <MapLegend />
    </div>
  );
}
