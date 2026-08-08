import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { GearProgression } from "@/api/typesGenerated";
import { useUpdateGearProgression } from "@/api/gearProgressionQueries";
import {
  parseProgressionPayload,
  serializeProgressionPayload,
  type ProgressionPayload,
} from "../progressionModel";

export interface ProgressionEditor {
  payload: ProgressionPayload;
  dirty: boolean;
  saving: boolean;
  /** Apply a document operation (from progressionModel) to the draft. */
  update: (fn: (payload: ProgressionPayload) => ProgressionPayload) => void;
  save: () => void;
}

/**
 * Draft state for editing a progression: local payload, dirty tracking
 * against the last-saved snapshot, explicit save (button or Ctrl/Cmd-S),
 * and a beforeunload guard while dirty. Mirrors useGearListEditor.
 */
export function useProgressionEditor(progression: GearProgression): ProgressionEditor {
  const [payload, setPayload] = useState<ProgressionPayload>(() =>
    parseProgressionPayload(progression.payload),
  );
  // Baseline is state, not a ref: `dirty` is derived during render.
  const [baseline, setBaseline] = useState(() => serializeProgressionPayload(payload));
  const updateProgression = useUpdateGearProgression();

  // Navigating between progressions remounts this hook's owner (the page
  // keys the view on the progression ID), so there is no reset to do here.
  const progressionId = progression.id;

  const snapshot = useMemo(() => serializeProgressionPayload(payload), [payload]);
  const dirty = snapshot !== baseline;

  const save = useCallback(() => {
    if (updateProgression.isPending) return;
    const saved = snapshot;
    updateProgression.mutate(
      {
        id: progressionId,
        // Send the document as a JSON object (json.RawMessage server-side);
        // a pre-stringified payload would double-encode.
        payload: payload as unknown as Record<string, string>,
      },
      {
        onSuccess: () => {
          setBaseline(saved);
          toast.success("Progression saved");
        },
        onError: (err) => toast.error(err.message),
      },
    );
  }, [payload, progressionId, snapshot, updateProgression]);

  // Ctrl/Cmd-S saves while dirty.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (dirty) save();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dirty, save]);

  // Warn before closing the tab with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  return {
    payload,
    dirty,
    saving: updateProgression.isPending,
    update: useCallback((fn) => setPayload((p) => fn(p)), []),
    save,
  };
}
