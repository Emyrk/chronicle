import { Check, LayoutPanelTop, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MAX_LAYOUT_PANELS } from "./layoutDraft";
import type { LayoutDraftController } from "./useLayoutDraft";

interface LayoutEditToolbarProps {
  controller: LayoutDraftController;
  dirty: boolean;
  onCancel: () => void;
  onDone: () => void;
  className?: string;
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="bg-muted text-muted-foreground rounded border px-1 font-mono text-[10px]">{children}</kbd>;
}

/** Controls shown while a page's layout is in Edit Mode. */
export function LayoutEditToolbar({ controller, dirty, onCancel, onDone, className }: LayoutEditToolbarProps) {
  const atLimit = controller.panelCount >= MAX_LAYOUT_PANELS;
  const seamless = controller.draft.appearance.seamless === true;
  return (
    <div
      role="toolbar"
      aria-label="Layout editing"
      className={cn("border-primary/40 bg-primary/5 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2", className)}
    >
      <span className="text-sm font-semibold">Editing layout</span>
      <span className="text-muted-foreground text-xs">{dirty ? "Unsaved changes" : "No changes"}</span>
      <div className="bg-border mx-1 h-5 w-px" />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => controller.addPanel() && toast.success("Panel added below")}
        disabled={atLimit}
      >
        <Plus /> Panel
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => controller.addStrip() && toast.success("Strip added below")}
        disabled={atLimit}
      >
        <Plus /> Strip
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          controller.addGroup();
          toast.success("Group row added below");
        }}
      >
        <LayoutPanelTop /> Group
      </Button>
      <span className="text-muted-foreground text-xs">{controller.panelCount} / {MAX_LAYOUT_PANELS} panels</span>
      <div className="border-input ml-1 flex overflow-hidden rounded-md border text-xs" role="group" aria-label="Panel spacing">
        {([false, true] as const).map((value) => (
          <button
            key={String(value)}
            type="button"
            aria-pressed={seamless === value}
            onClick={() => controller.setAppearance((previous) => ({ ...previous, seamless: value ? true : undefined }))}
            className={cn(
              "px-2.5 py-1 transition-colors",
              seamless === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
            )}
          >
            {value ? "Seamless" : "Cards"}
          </button>
        ))}
      </div>
      <div className="ml-auto flex items-center gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} title="Discard changes and leave Edit Mode">
          <X /> Cancel <Kbd>Esc</Kbd>
        </Button>
        <Button type="button" size="sm" onClick={onDone} title="Apply changes and leave Edit Mode">
          <Check /> Done <Kbd>⇧E</Kbd>
        </Button>
      </div>
    </div>
  );
}
