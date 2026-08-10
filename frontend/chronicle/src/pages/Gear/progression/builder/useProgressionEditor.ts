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
  title: string;
  classId: number;
  specName: string;
  dirty: boolean;
  saving: boolean;
  /** Apply a document operation (from progressionModel) to the draft. */
  update: (fn: (payload: ProgressionPayload) => ProgressionPayload) => void;
  setTitle: (title: string) => void;
  setClassAndSpec: (classId: number, specName: string) => void;
  setSpecName: (specName: string) => void;
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
  const [title, setTitle] = useState(progression.title);
  const [classId, setClassId] = useState(progression.class_id);
  const [specName, setSpecName] = useState(progression.spec_name);
  const updateProgression = useUpdateGearProgression();
  const [baseline, setBaseline] = useState(() =>
    JSON.stringify({
      payload: serializeProgressionPayload(payload),
      title: progression.title,
      classId: progression.class_id,
      specName: progression.spec_name,
    }),
  );

  // Navigating between progressions remounts this hook's owner (the page
  // keys the view on the progression ID), so there is no reset to do here.
  const progressionId = progression.id;

  const snapshot = useMemo(
    () =>
      JSON.stringify({
        payload: serializeProgressionPayload(payload),
        title,
        classId,
        specName,
      }),
    [classId, payload, specName, title],
  );
  const dirty = snapshot !== baseline;

  const save = useCallback(() => {
    if (updateProgression.isPending) return;
    const normalizedTitle = title.trim();
    if (!normalizedTitle) {
      toast.error("Progression name is required");
      return;
    }
    const saved = JSON.stringify({
      payload: serializeProgressionPayload(payload),
      title: normalizedTitle,
      classId,
      specName,
    });
    updateProgression.mutate(
      {
        id: progressionId,
        title: normalizedTitle,
        class_id: classId,
        spec_name: specName,
        // Send the document as a JSON object (json.RawMessage server-side);
        // a pre-stringified payload would double-encode.
        payload: payload as unknown as Record<string, string>,
      },
      {
        onSuccess: () => {
          setTitle(normalizedTitle);
          setBaseline(saved);
          toast.success("Progression saved");
        },
        onError: (err) => toast.error(err.message),
      },
    );
  }, [classId, payload, progressionId, specName, title, updateProgression]);

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
    title,
    classId,
    specName,
    dirty,
    saving: updateProgression.isPending,
    update: useCallback((fn) => setPayload((p) => fn(p)), []),
    setTitle,
    setClassAndSpec: useCallback((nextClassId, nextSpecName) => {
      setClassId(nextClassId);
      setSpecName(nextSpecName);
    }, []),
    setSpecName,
    save,
  };
}
