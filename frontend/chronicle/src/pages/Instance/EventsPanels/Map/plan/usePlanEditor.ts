import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  coneBearing,
  emptyPlan,
  movePlanItem,
  PLAN_COLORS,
  PLAN_LIMITS,
  planDistance,
  planId,
  planItemAt,
  readMapPlan,
  STROKE_SPACING,
  type MapPlanData,
  type PlanInput,
  type PlanItem,
  type PlanMarkerIcon,
  type PlanPoint,
} from "./mapPlan";

/** The editor's tools; "select" moves and deletes, "measure" draws nothing that is kept. */
export type PlanTool = "select" | "marker" | "arrow" | "pen" | "text" | "circle" | "cone" | "rect" | "measure" | "eraser" | "token";

/** Who a token tool places: a player from the log, or a role. */
export interface PlanTokenChoice {
  label: string;
  color: string;
  icon?: string;
  guid?: string;
}

/** A player of the log (or a role) the token tool can place. */
export interface PlanRosterEntry extends PlanTokenChoice {
  group: string;
}

export const ROLE_TOKENS: PlanRosterEntry[] = [
  { group: "Roles", label: "Tank", color: "#c79c6e" },
  { group: "Roles", label: "Healer", color: "#22c55e" },
  { group: "Roles", label: "Melee", color: "#ef4444" },
  { group: "Roles", label: "Ranged", color: "#3b82f6" },
];

export const CIRCLE_PRESETS = [5, 8, 10, 15, 20, 30, 40] as const;
export const CONE_WIDTHS = [45, 60, 90, 120, 180] as const;
/** Clicking (rather than dragging) with these tools uses the last size. */
const CLICK_SLOP_YARDS = 0.75;
/** How close (yards) a click must be to pick an item. */
const PICK_YARDS = 2.5;
const MAX_UNDO = 60;

export interface PlanEditorState {
  plan: MapPlanData;
  stepIndex: number;
  tool: PlanTool;
  color: string;
  markerIcon: PlanMarkerIcon;
  text: string;
  circleRadius: number;
  coneWidth: number;
  token: PlanTokenChoice | null;
  selectedId: string | null;
  /** Undo and redo history (plans before / after the current one). */
  past: MapPlanData[];
  future: MapPlanData[];
  /** The item being dragged (drawn moved in the preview instead), or null. */
  draggingId: string | null;
}

// Browser drafts, one per world map, until a plan is saved to the account.
const draftKey = (mapId: number) => `chronicle.map.plan.${mapId}`;

function readDraft(mapId: number): MapPlanData {
  try {
    const plan = readMapPlan(JSON.parse(localStorage.getItem(draftKey(mapId)) ?? "null"));
    if (plan && plan.mapId === mapId) return plan;
  } catch {
    // A missing or broken draft starts a new plan.
  }
  return emptyPlan(mapId);
}

function writeDraft(plan: MapPlanData) {
  try {
    localStorage.setItem(draftKey(plan.mapId), JSON.stringify(plan));
  } catch {
    // Storage may be full or blocked; the plan still works for this session.
  }
}

/**
 * The plan editor for one world map: the plan (a browser draft), the current
 * step, the tool and its options, undo/redo, the item being drawn, and the
 * scene's pointer handlers for the active tool.
 */
export function usePlanEditor(mapId: number) {
  const [state, setState] = useState<PlanEditorState>(() => ({
    plan: readDraft(mapId),
    stepIndex: 0,
    tool: "select",
    color: PLAN_COLORS[0],
    markerIcon: "skull",
    text: "",
    circleRadius: 8,
    coneWidth: 90,
    token: null,
    selectedId: null,
    past: [],
    future: [],
    draggingId: null,
  }));
  const [preview, setPreview] = useState<PlanItem[]>([]);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Another map (a different instance): its own draft.
  const [shownMapId, setShownMapId] = useState(mapId);
  if (shownMapId !== mapId) {
    setShownMapId(mapId);
    setState((current) => ({ ...current, plan: readDraft(mapId), stepIndex: 0, selectedId: null, past: [], future: [] }));
  }

  useEffect(() => {
    writeDraft(state.plan);
  }, [state.plan]);

  /** Replaces the plan with an undoable edit. */
  const commit = useCallback((next: MapPlanData) => {
    setState((current) => ({
      ...current,
      plan: next,
      stepIndex: Math.min(current.stepIndex, next.steps.length - 1),
      past: [...current.past, current.plan].slice(-MAX_UNDO),
      future: [],
    }));
  }, []);

  const updateStepItems = useCallback((change: (items: PlanItem[]) => PlanItem[]) => {
    const { plan, stepIndex } = stateRef.current;
    const steps = plan.steps.map((step, index) => index === stepIndex ? { ...step, items: change(step.items).slice(-PLAN_LIMITS.itemsPerStep) } : step);
    commit({ ...plan, steps });
  }, [commit]);

  const addItem = useCallback((item: PlanItem) => updateStepItems((items) => [...items, item]), [updateStepItems]);
  const replaceItem = useCallback((item: PlanItem) => updateStepItems((items) => items.map((existing) => existing.id === item.id ? item : existing)), [updateStepItems]);
  const deleteItem = useCallback((id: string) => {
    updateStepItems((items) => items.filter((item) => item.id !== id));
    setState((current) => current.selectedId === id ? { ...current, selectedId: null } : current);
  }, [updateStepItems]);

  const set = useCallback((patch: Partial<PlanEditorState>) => setState((current) => ({ ...current, ...patch })), []);

  const undoLast = useCallback(() => {
    setState((current) => {
      const previous = current.past[current.past.length - 1];
      if (!previous) return current;
      return {
        ...current,
        plan: previous,
        stepIndex: Math.min(current.stepIndex, previous.steps.length - 1),
        selectedId: null,
        past: current.past.slice(0, -1),
        future: [current.plan, ...current.future],
      };
    });
  }, []);
  const redoLast = useCallback(() => {
    setState((current) => {
      const next = current.future[0];
      if (!next) return current;
      return {
        ...current,
        plan: next,
        stepIndex: Math.min(current.stepIndex, next.steps.length - 1),
        selectedId: null,
        past: [...current.past, current.plan],
        future: current.future.slice(1),
      };
    });
  }, []);

  // Steps.
  const steps = {
    go: (index: number) => setState((current) => ({ ...current, stepIndex: Math.max(0, Math.min(current.plan.steps.length - 1, index)), selectedId: null })),
    add: (copyCurrent: boolean) => {
      const { plan, stepIndex } = stateRef.current;
      if (plan.steps.length >= PLAN_LIMITS.steps) return;
      const source = plan.steps[stepIndex];
      const step = {
        id: planId(),
        name: copyCurrent ? `${source.name} (copy)`.slice(0, PLAN_LIMITS.nameLength) : `Step ${plan.steps.length + 1}`,
        items: copyCurrent ? source.items.map((item) => ({ ...item, id: planId() })) : [],
      };
      const next = [...plan.steps.slice(0, stepIndex + 1), step, ...plan.steps.slice(stepIndex + 1)];
      commit({ ...plan, steps: next });
      setState((current) => ({ ...current, stepIndex: stepIndex + 1, selectedId: null }));
    },
    rename: (index: number, name: string) => {
      const { plan } = stateRef.current;
      const trimmed = name.trim().slice(0, PLAN_LIMITS.nameLength);
      if (!trimmed) return;
      commit({ ...plan, steps: plan.steps.map((step, at) => at === index ? { ...step, name: trimmed } : step) });
    },
    remove: (index: number) => {
      const { plan } = stateRef.current;
      if (plan.steps.length <= 1) return;
      commit({ ...plan, steps: plan.steps.filter((_, at) => at !== index) });
    },
  };

  /** Starts a fresh plan (undoable). */
  const clearPlan = useCallback(() => commit(emptyPlan(stateRef.current.plan.mapId)), [commit]);
  /** Replaces the plan with a loaded one (a saved or shared plan); undoable. */
  const loadPlan = useCallback((plan: MapPlanData) => {
    commit(plan);
    setState((current) => ({ ...current, stepIndex: 0, selectedId: null }));
  }, [commit]);

  // The pointer gesture in progress.
  const gesture = useRef<{ start: PlanPoint; points: PlanPoint[]; moving?: PlanItem; moved: boolean } | null>(null);

  const input = useMemo((): PlanInput => {
    // The item the gesture would make, or null (too small, nothing chosen).
    const draft = (start: PlanPoint, end: PlanPoint, points: PlanPoint[]): PlanItem | null => {
      const { tool, color, circleRadius, coneWidth } = stateRef.current;
      const length = planDistance(start, end);
      const dragged = length > CLICK_SLOP_YARDS;
      switch (tool) {
        case "arrow":
          return dragged ? { id: "draft", kind: "arrow", points: [start, end], color } : null;
        case "pen":
          return points.length > 1 ? { id: "draft", kind: "pen", points, color } : null;
        case "circle":
          return { id: "draft", kind: "circle", at: start, radius: dragged ? Math.min(PLAN_LIMITS.radius, Math.round(length * 2) / 2) : circleRadius, color };
        case "cone":
          return dragged ? { id: "draft", kind: "cone", at: start, radius: Math.min(PLAN_LIMITS.radius, Math.round(length * 2) / 2), width: coneWidth, facing: coneBearing(start, end), color } : null;
        case "rect":
          return dragged ? { id: "draft", kind: "rect", from: start, to: end, color } : null;
        case "measure":
          return dragged ? { id: "draft", kind: "arrow", points: [start, end], color: "#f5f5f4" } : null;
        default:
          return null;
      }
    };
    // A size label at the end of the gesture (radii, lengths).
    const sizeLabel = (item: PlanItem, end: PlanPoint): PlanItem | null => {
      const yards = item.kind === "circle" || item.kind === "cone" ? item.radius
        : item.kind === "arrow" ? planDistance(item.points[0], item.points[item.points.length - 1]) : null;
      return yards === null ? null : { id: "draft-label", kind: "text", at: end, text: `${Math.round(yards * 10) / 10} yd`, color: "#f5f5f4" };
    };
    const showDraft = (start: PlanPoint, end: PlanPoint, points: PlanPoint[]) => {
      const item = draft(start, end, points);
      const label = item ? sizeLabel(item, end) : null;
      setPreview(item ? (label ? [item, label] : [item]) : []);
    };

    return {
      down(point) {
        if (!point) return;
        const { tool, plan, stepIndex, markerIcon, color, text, token } = stateRef.current;
        const items = plan.steps[stepIndex].items;
        gesture.current = { start: point, points: [point], moved: false };
        switch (tool) {
          case "select": {
            const hit = planItemAt(items, point, PICK_YARDS);
            set({ selectedId: hit?.id ?? null, draggingId: hit?.id ?? null });
            if (hit) gesture.current.moving = hit;
            return;
          }
          case "eraser": {
            const hit = planItemAt(items, point, PICK_YARDS);
            if (hit) deleteItem(hit.id);
            gesture.current = null;
            return;
          }
          case "marker":
            addItem({ id: planId(), kind: "marker", at: point, icon: markerIcon });
            gesture.current = null;
            return;
          case "text":
            if (text.trim()) addItem({ id: planId(), kind: "text", at: point, text: text.trim().slice(0, PLAN_LIMITS.textLength), color });
            gesture.current = null;
            return;
          case "token":
            if (token) addItem({ id: planId(), kind: "token", at: point, ...token });
            gesture.current = null;
            return;
          default:
            showDraft(point, point, [point]);
        }
      },
      move(point, _event, pressed) {
        const current = gesture.current;
        if (!current || !pressed || !point) return;
        current.moved = current.moved || planDistance(current.start, point) > CLICK_SLOP_YARDS;
        if (current.moving) {
          // Dragging the selection: preview it moved, commit on release.
          const moved = movePlanItem(current.moving, point.x - current.start.x, point.y - current.start.y);
          setPreview([{ ...moved, id: "draft" }]);
          return;
        }
        const last = current.points[current.points.length - 1];
        if (planDistance(last, point) >= STROKE_SPACING && current.points.length < PLAN_LIMITS.pointsPerStroke) current.points.push(point);
        showDraft(current.start, point, current.points);
      },
      up(point) {
        const current = gesture.current;
        gesture.current = null;
        setPreview([]);
        if (!current) return;
        const end = point ?? current.points[current.points.length - 1];
        if (current.moving) {
          set({ draggingId: null });
          if (current.moved) replaceItem(movePlanItem(current.moving, end.x - current.start.x, end.y - current.start.y));
          return;
        }
        const { tool } = stateRef.current;
        if (tool === "measure") return;
        if (current.points[current.points.length - 1] !== end && tool === "pen") current.points.push(end);
        const item = draft(current.start, end, current.points);
        if (!item) return;
        if (item.kind === "circle" && current.moved) set({ circleRadius: item.radius });
        addItem({ ...item, id: planId() });
      },
    };
  }, [addItem, deleteItem, replaceItem, set]);

  const currentStep = state.plan.steps[state.stepIndex];
  // The dragged item shows moved (the preview stands in for it).
  const dragging = preview.length > 0 ? state.draggingId : null;
  const drawnItems = useMemo(
    () => [...(dragging ? currentStep.items.filter((item) => item.id !== dragging) : currentStep.items), ...preview],
    [currentStep.items, dragging, preview],
  );

  return {
    state,
    set,
    currentStep,
    /** What the scene draws: the current step's items with any in progress. */
    drawnItems,
    input,
    deleteItem,
    undo: undoLast,
    redo: redoLast,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    steps,
    clearPlan,
    loadPlan,
  };
}

export type PlanEditor = ReturnType<typeof usePlanEditor>;

/**
 * Planning keys while the editor is open (never while typing): Delete removes
 * the selection, Ctrl+Z / Ctrl+Shift+Z (or Ctrl+Y) undo and redo, Esc drops
 * the tool to Select, then closes planning.
 */
export function usePlanShortcuts(editor: PlanEditor, open: boolean, onClose: () => void) {
  const { state, set, deleteItem, undo, redo } = editor;
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (mod && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
      } else if ((event.key === "Delete" || event.key === "Backspace") && state.selectedId) {
        event.preventDefault();
        deleteItem(state.selectedId);
      } else if (event.key === "Escape") {
        // Handled here so focus mode's Esc (which skips handled presses) stays put.
        event.preventDefault();
        if (state.tool !== "select" || state.selectedId) set({ tool: "select", selectedId: null });
        else onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [deleteItem, onClose, open, redo, set, state.selectedId, state.tool, undo]);
}
