import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { GearList } from "@/api/typesGenerated";
import { useUpdateGearList } from "@/api/gearBuilderQueries";
import { parsePayload, serializePayload, type GearPayload } from "./gearListModel";

export interface GearListMeta {
  title: string;
  description: string;
  spec_name: string;
}

export interface GearListEditor {
  payload: GearPayload;
  meta: GearListMeta;
  dirty: boolean;
  saving: boolean;
  /** Apply a document operation (from gearListModel) to the draft. */
  update: (fn: (payload: GearPayload) => GearPayload) => void;
  updateMeta: (patch: Partial<GearListMeta>) => void;
  save: () => void;
}

function metaOf(list: GearList): GearListMeta {
  return {
    title: list.title,
    description: list.description,
    spec_name: list.spec_name,
  };
}

/**
 * Draft state for editing a gear list: local payload + metadata, dirty
 * tracking against the last-saved snapshot, explicit save (button or
 * Ctrl/Cmd-S), and a beforeunload guard while dirty.
 */
export function useGearListEditor(list: GearList): GearListEditor {
  const [payload, setPayload] = useState<GearPayload>(() => parsePayload(list.payload));
  const [meta, setMeta] = useState<GearListMeta>(() => metaOf(list));
  const baseline = useRef(JSON.stringify({ p: serializePayload(payload), m: meta }));
  const updateList = useUpdateGearList();

  // If the server copy changes identity (navigation between lists), reset.
  const listId = list.id;
  const lastListId = useRef(listId);
  useEffect(() => {
    if (lastListId.current === listId) return;
    lastListId.current = listId;
    const nextPayload = parsePayload(list.payload);
    const nextMeta = metaOf(list);
    setPayload(nextPayload);
    setMeta(nextMeta);
    baseline.current = JSON.stringify({ p: serializePayload(nextPayload), m: nextMeta });
  }, [listId, list]);

  const snapshot = useMemo(
    () => JSON.stringify({ p: serializePayload(payload), m: meta }),
    [payload, meta],
  );
  const dirty = snapshot !== baseline.current;

  const save = useCallback(() => {
    if (updateList.isPending) return;
    const saved = snapshot;
    updateList.mutate(
      {
        id: listId,
        title: meta.title,
        description: meta.description,
        spec_name: meta.spec_name,
        // Send the document as a JSON object (json.RawMessage server-side);
        // a pre-stringified payload would double-encode.
        payload: payload as unknown as Record<string, string>,
      },
      {
        onSuccess: () => {
          baseline.current = saved;
          toast.success("Gear list saved");
        },
        onError: (err) => toast.error(err.message),
      },
    );
  }, [listId, meta, payload, snapshot, updateList]);

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
    meta,
    dirty,
    saving: updateList.isPending,
    update: useCallback((fn) => setPayload((p) => fn(p)), []),
    updateMeta: useCallback((patch) => setMeta((m) => ({ ...m, ...patch })), []),
    save,
  };
}
