/**
 * Explainer top bar: exit, panel identity, selection context.
 */

import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export function ExplainerTopBar({
  panelLabel,
  panelIcon,
  instanceName,
  encounterCount,
  onExit,
}: {
  panelLabel: string;
  panelIcon?: ReactNode;
  instanceName?: string;
  encounterCount: number;
  onExit: () => void;
}) {
  return (
    <div className="flex h-[52px] flex-shrink-0 items-center gap-3.5 border-b border-border bg-card px-4">
      <Button variant="ghost" size="sm" onClick={onExit} className="text-muted-foreground">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Exit Explainer
      </Button>
      <div className="h-5 w-px bg-border" />
      <div className="flex items-center gap-2">
        {panelIcon}
        <span className="font-wow text-[15px]">{panelLabel}</span>
        <span className="font-mono text-[11px] text-muted-foreground">Explainer</span>
      </div>
      <div className="ml-auto flex items-center gap-2.5 font-mono text-[11px] text-muted-foreground">
        {instanceName && <span>{instanceName}</span>}
        {instanceName && <span className="opacity-50">/</span>}
        <span>
          {encounterCount} encounter{encounterCount === 1 ? "" : "s"} selected
        </span>
      </div>
    </div>
  );
}
