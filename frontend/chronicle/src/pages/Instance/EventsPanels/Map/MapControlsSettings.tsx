import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Link } from "react-router-dom";
import { Download, Keyboard, RotateCcw, Upload } from "lucide-react";
import { useUpdateMapControls } from "@/api/queries";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  changedMapKeyBindings,
  exportMapControls,
  importMapControls,
  keyLabel,
  MAP_CONTROL_ACTIONS,
  rebindMapKey,
  reservedKeyReason,
  type MapControlAction,
  type MapKeyBindings,
} from "./mapControls";
import { useMapKeyBindings } from "./useMapKeyBindings";

/** The map card's back: rebind, import, export and reset the camera keys. */
export function MapControlsSettings({ onClose }: { onClose: () => void }) {
  const { bindings, canEdit, loading, error: loadError } = useMapKeyBindings();
  const update = useUpdateMapControls();
  const [capturing, setCapturing] = useState<MapControlAction | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const disabled = !canEdit || loading || update.isPending;

  const save = (next: MapKeyBindings) => {
    setMessage(null);
    update.mutate(changedMapKeyBindings(next), {
      onError: (error) => setMessage(error.message),
    });
  };

  // Capture the next key press for the action being rebound. Capture phase and
  // stopImmediatePropagation keep it from also switching layouts (digits) or
  // moving the camera.
  useEffect(() => {
    if (!capturing) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.code === "Escape") {
        setCapturing(null);
        return;
      }
      const reason = reservedKeyReason(event.code);
      if (reason) {
        setMessage(`${keyLabel(event.code)}: ${reason}`);
        return;
      }
      setCapturing(null);
      if (bindings[capturing] !== event.code) save(rebindMapKey(bindings, capturing, event.code));
    };
    // A popped-out panel has its own window.
    const target = rootRef.current?.ownerDocument.defaultView ?? window;
    target.addEventListener("keydown", handleKeyDown, true);
    return () => target.removeEventListener("keydown", handleKeyDown, true);
    // save is recreated each render; the binding and action are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bindings, capturing]);

  const handleExport = () => {
    const url = URL.createObjectURL(new Blob([exportMapControls(bindings)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "chronicle-map-controls.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      save(importMapControls(await file.text()));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not import the file.");
    }
  };

  const handleRevert = () => {
    setMessage(null);
    update.mutate(null, { onError: (error) => setMessage(error.message) });
  };

  return (
    <div ref={rootRef} className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-center justify-between">
        <h4 className="flex items-center gap-1.5 text-sm font-semibold">
          <Keyboard className="h-4 w-4" />
          Map controls
        </h4>
        <Button size="sm" variant="ghost" onClick={() => { setCapturing(null); onClose(); }}>Back</Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Hover the 3D map and hold a key to move the camera.
        {canEdit ? " Click a key to change it." : null}
      </p>
      {!canEdit && (
        <div className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-200">
          <Link to="/login" className="font-medium underline">Log in</Link> to change the controls. The defaults apply until then.
        </div>
      )}
      <div className="styled-scrollbar min-h-0 flex-1 overflow-y-auto">
        <div className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 text-xs">
          {MAP_CONTROL_ACTIONS.map((action) => {
            const active = capturing === action.id;
            return (
              <div key={action.id} className="contents">
                <span className="text-foreground">{action.label}</span>
                <button
                  type="button"
                  disabled={disabled}
                  aria-label={`${action.label}: ${keyLabel(bindings[action.id])}`}
                  onClick={() => { setMessage(null); setCapturing(active ? null : action.id); }}
                  className={cn(
                    "min-w-20 rounded border px-2 py-0.5 font-mono text-xs",
                    active
                      ? "border-primary bg-primary/20 text-foreground"
                      : "border-border bg-background text-foreground enabled:hover:border-ring disabled:opacity-60",
                  )}
                >
                  {active ? "Press a key…" : keyLabel(bindings[action.id])}
                </button>
              </div>
            );
          })}
        </div>
      </div>
      {(message || loadError) && <p className="text-xs text-red-400">{message ?? loadError?.message}</p>}
      <div className="flex flex-wrap items-center gap-1.5">
        <Button size="sm" variant="outline" onClick={handleExport}>
          <Download className="mr-1 h-3.5 w-3.5" />
          Export
        </Button>
        <Button size="sm" variant="outline" disabled={disabled} onClick={() => fileRef.current?.click()}>
          <Upload className="mr-1 h-3.5 w-3.5" />
          Import
        </Button>
        <Button size="sm" variant="outline" disabled={disabled} onClick={handleRevert}>
          <RotateCcw className="mr-1 h-3.5 w-3.5" />
          Revert to defaults
        </Button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={handleImport} />
      </div>
    </div>
  );
}
