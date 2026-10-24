import { useMemo, useState } from "react";
import { ArrowLeft, Lightbulb, Ruler } from "lucide-react";
import { Link } from "react-router-dom";
import { TechnicalHintCard } from "@/components/TechnicalHints/TechnicalHintCard";
import { TechnicalHintsCatalog } from "@/components/TechnicalHints/TechnicalHintsCatalog";
import { useTechnicalHints } from "@/components/TechnicalHints/useTechnicalHints";
import { Card } from "@/components/ui/Card/Card";

const SIZE_PRESETS = [
  { id: "recent-mobile", label: "Recent mobile card", width: 360, height: 100 },
  { id: "recent-desktop", label: "Recent desktop card", width: 340, height: 200 },
] as const;

export function TechnicalHintsPage() {
  const { data } = useTechnicalHints();
  const [presetID, setPresetID] = useState<string>("recent-desktop");
  const [width, setWidth] = useState(340);
  const [height, setHeight] = useState(200);
  const [hintID, setHintID] = useState("");
  const hints = useMemo(() => data?.payloads ?? [], [data]);
  const hint = useMemo(
    () => hints.find((candidate) => candidate.id === hintID) ?? hints[0],
    [hintID, hints],
  );

  const applyPreset = (nextID: string) => {
    setPresetID(nextID);
    const preset = SIZE_PRESETS.find((candidate) => candidate.id === nextID);
    if (preset) {
      setWidth(preset.width);
      setHeight(preset.height);
    }
  };

  const updateDimension = (setter: (value: number) => void, value: string) => {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) setter(Math.max(80, Math.min(1200, parsed)));
    setPresetID("custom");
  };

  return (
    <div className="container mx-auto max-w-6xl px-4 py-4">
      <Link to="/technical" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3" />
        Back to Technical Details
      </Link>

      <div className="mb-1 flex items-center gap-2">
        <Lightbulb className="h-5 w-5" />
        <h1 className="text-xl font-bold">Technical Hints</h1>
      </div>
      <p className="mb-6 text-sm text-muted-foreground">
        Preview the hint shown when a Recent inline ad has no creative, then browse the complete catalog.
      </p>

      <Card className="mb-10 overflow-hidden border-primary/20 p-0">
        <div className="border-b border-border/70 bg-muted/20 px-4 py-3">
          <div className="flex items-center gap-2">
            <Ruler className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Recent placeholder preview</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Unfilled Recent ads show a hint that fills the grid cell: raid-card height on desktop, 100px tall and full width on smaller screens.
          </p>
        </div>

        <div className="grid gap-4 p-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
          <div className="space-y-4">
            <label className="block space-y-1.5 text-xs font-medium">
              Ad size
              <select
                value={presetID}
                onChange={(event) => applyPreset(event.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {SIZE_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>{preset.label} ({preset.width} × {preset.height})</option>
                ))}
                <option value="custom">Custom size</option>
              </select>
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1.5 text-xs font-medium">
                Width
                <input
                  type="number"
                  min={80}
                  max={1200}
                  value={width}
                  onChange={(event) => updateDimension(setWidth, event.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                />
              </label>
              <label className="space-y-1.5 text-xs font-medium">
                Height
                <input
                  type="number"
                  min={80}
                  max={1200}
                  value={height}
                  onChange={(event) => updateDimension(setHeight, event.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                />
              </label>
            </div>

            <label className="block space-y-1.5 text-xs font-medium">
              Hint payload
              <select
                value={hint?.id ?? ""}
                onChange={(event) => setHintID(event.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {hints.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>{candidate.title}</option>
                ))}
              </select>
            </label>

            <div className="rounded-md border border-border/70 bg-muted/20 px-3 py-2 font-mono text-xs text-muted-foreground">
              {width} × {height}px
            </div>
          </div>

          <div className="styled-scrollbar flex overflow-auto rounded-md border border-dashed border-border/80 bg-black/10 p-6">
            <div
              className="m-auto shrink-0 overflow-hidden rounded-md shadow-lg shadow-black/20"
              style={{ width: `${width}px`, height: `${height}px` }}
            >
              {hint && <TechnicalHintCard hint={hint} compact={height <= 140} />}
            </div>
          </div>
        </div>
      </Card>

      <div className="mb-4">
        <h2 className="text-lg font-semibold">Hint catalog</h2>
        <p className="text-sm text-muted-foreground">Every payload currently available to the Recent fallback rotation.</p>
      </div>
      <TechnicalHintsCatalog cardSize={{ width, height }} />
    </div>
  );
}
