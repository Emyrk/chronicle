/**
 * PanelExplainerView — full-page learning mode for a single panel.
 *
 * Panels with a LessonSet get the full shell (lesson sidebar + video player +
 * live panel — built in subsequent commits); panels with only summary/tips get
 * the simple fallback layout below.
 *
 * Mobile: this view is not shown on mobile — tooltips are used instead.
 */

import { ArrowLeft, BookOpen, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card/Card";
import { PANELS, type EventsPanelType } from "../EventsPanels/EventsPanel";
import { getExplainer } from "../EventsPanels/explainers";
import { EventsPanel } from "../EventsPanels";
import type { PanelContext } from "../EventsPanels/types";
import type { PanelExplainer } from "./types";

export interface PanelExplainerViewProps {
  /** The panel type being explained */
  panelType: EventsPanelType;
  /** Panel context for rendering the live panel */
  context: PanelContext;
  /** Duration in ms for per-second calculations */
  durationMs: number;
  /** Callback to exit explainer mode */
  onExit: () => void;
}

export function PanelExplainerView({
  panelType,
  context,
  durationMs,
  onExit,
}: PanelExplainerViewProps) {
  const explainer = getExplainer(panelType);

  if (!explainer) {
    // Shouldn't happen (the ? button is gated by hasExplainer), but fall back gracefully.
    return (
      <div className="p-6">
        <Button variant="ghost" onClick={onExit}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <p className="mt-4 text-muted-foreground">
          No explainer available for this panel.
        </p>
      </div>
    );
  }

  return (
    <FallbackExplainer
      panelType={panelType}
      explainer={explainer}
      context={context}
      durationMs={durationMs}
      onExit={onExit}
    />
  );
}

/**
 * Simple summary/tips layout for panels without a lesson set.
 */
function FallbackExplainer({
  panelType,
  explainer,
  context,
  durationMs,
  onExit,
}: {
  panelType: EventsPanelType;
  explainer: PanelExplainer;
  context: PanelContext;
  durationMs: number;
  onExit: () => void;
}) {
  const panel = PANELS[panelType];

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-10 flex h-[52px] items-center gap-3 border-b border-border bg-card px-4">
        <Button variant="ghost" size="sm" onClick={onExit}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Exit Explainer
        </Button>
        <div className="h-5 w-px bg-border" />
        <div className="flex items-center gap-2">
          {panel?.icon}
          <span className="font-wow text-[15px]">{panel?.label ?? panelType}</span>
          <span className="font-mono text-[11px] text-muted-foreground">Explainer</span>
        </div>
      </div>

      <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpen className="h-4 w-4" />
              What this panel shows
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{explainer.summary}</p>
          </CardContent>
        </Card>

        <div className="h-[500px] rounded-lg border border-border bg-card p-2">
          <EventsPanel
            panelType={panelType}
            onPanelTypeChange={() => {}}
            durationMs={durationMs}
            context={context}
            panelIndex={0}
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Lightbulb className="h-4 w-4" />
              Tips
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {explainer.tips.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
