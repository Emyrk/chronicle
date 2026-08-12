import { useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, Pencil } from "lucide-react";
import { useGuildCharacters } from "@/api/queries";
import type { GuildInfo } from "@/api/typesGenerated";
import { serverCapabilities } from "@/config/serverCapabilities";
import { gearClassesForFlavor } from "@/pages/Gear/classInfo";
import { CLASS_CSS_VAR } from "@/pages/Rankings/classDisplay";
import type { Board, DragPayload, HoverTarget, SlotEntry, SlotLocation } from "./types";
import { GROUP_SIZE, emptyBoard, entryName, playerEntry } from "./types";
import { GuildSelector } from "./GuildSelector";
import { RosterDrawer } from "./RosterDrawer";
import { GroupCard } from "./GroupCard";
import { SlotEditorModal } from "./SlotEditorModal";
import { SizePicker } from "./SizePicker";
import { ClassIcon } from "./ClassIcon";
import { KeybindsOverlay } from "./KeybindsOverlay";

type Phase = "picking" | "set";

interface Composition {
  board: Board;
  bench: SlotEntry[];
}

function entryFromDrag(drag: DragPayload, comp: Composition): SlotEntry | null {
  switch (drag.kind) {
    case "class":
      return { kind: "placeholder", cls: drag.cls, spec: "", note: "" };
    case "roster":
      return drag.entry;
    case "roster-multi":
      return null; // handled as a batch, never as a single entry
    case "slot":
      return drag.from.area === "board"
        ? (comp.board[drag.from.gi]?.[drag.from.si] ?? null)
        : (comp.bench[drag.from.index] ?? null);
  }
}

function placedIds(comp: Composition): Set<string> {
  const ids = new Set<string>();
  for (const entry of [...comp.board.flat(), ...comp.bench]) {
    if (entry?.kind === "player") ids.add(entry.id);
  }
  return ids;
}

const HISTORY_LIMIT = 200;

export function RaidPlannerPage() {
  const [phase, setPhase] = useState<Phase>("picking");
  const [pendingGroups, setPendingGroups] = useState(8);
  const [title, setTitle] = useState("");
  const [guild, setGuild] = useState<GuildInfo | null>(null);
  const [comp, setComp] = useState<Composition>({ board: [], bench: [] });
  const [groupNotes, setGroupNotes] = useState<Record<number, string>>({});
  const [editing, setEditing] = useState<SlotLocation | null>(null);
  const [drawerCollapsed, setDrawerCollapsed] = useState(false);
  const [benchDropTarget, setBenchDropTarget] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [keybindsOpen, setKeybindsOpen] = useState(false);
  /** Slots ("gi:si") a multi-selection drag would land in, previewed live. */
  const [multiPreview, setMultiPreview] = useState<Set<string>>(new Set());
  const dragRef = useRef<DragPayload | null>(null);
  const hoverRef = useRef<HoverTarget | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const pastRef = useRef<Composition[]>([]);
  const futureRef = useRef<Composition[]>([]);

  const classes = useMemo(() => gearClassesForFlavor(serverCapabilities.defaultFlavor), []);
  const { data: rosterData, isLoading: rosterLoading } = useGuildCharacters(guild?.id);

  const placedPlayerIds = useMemo(() => placedIds(comp), [comp]);

  const availableRoster = useMemo(
    () =>
      (rosterData?.members ?? [])
        .filter((m) => !placedPlayerIds.has(m.id))
        .map(playerEntry),
    [rosterData, placedPlayerIds],
  );

  // ---------------------------------------------------------------------------
  // Composition updates flow through here so every change is undoable.
  // ---------------------------------------------------------------------------

  const updateComp = (updater: (prev: Composition) => Composition) => {
    const next = updater(comp);
    if (next === comp) return;
    pastRef.current.push(comp);
    if (pastRef.current.length > HISTORY_LIMIT) pastRef.current.shift();
    futureRef.current = [];
    setComp(next);
  };

  const undo = () => {
    const prev = pastRef.current.pop();
    if (!prev) return;
    futureRef.current.push(comp);
    setComp(prev);
    setEditing(null);
  };

  const redo = () => {
    const next = futureRef.current.pop();
    if (!next) return;
    pastRef.current.push(comp);
    setComp(next);
    setEditing(null);
  };

  const takeDrag = (): DragPayload | null => {
    const drag = dragRef.current;
    dragRef.current = null;
    return drag;
  };

  // ---------------------------------------------------------------------------
  // Placement helpers
  // ---------------------------------------------------------------------------

  /**
   * Place entries into empty slots in board order starting at (gi, si);
   * whatever doesn't fit goes to the bench. Already-placed players are
   * skipped so stale hover/drag references can't duplicate anyone.
   */
  const placeEntries = (entries: SlotEntry[], gi = 0, si = 0) => {
    updateComp((prev) => {
      const already = placedIds(prev);
      const queue = entries.filter((e) => e.kind !== "player" || !already.has(e.id));
      if (queue.length === 0) return prev;
      const board = prev.board.map((g) => g.slice());
      const bench = prev.bench.slice();
      for (let g = gi; g < board.length && queue.length > 0; g++) {
        for (let s = g === gi ? si : 0; s < board[g].length && queue.length > 0; s++) {
          if (board[g][s] === null) board[g][s] = queue.shift()!;
        }
      }
      bench.push(...queue);
      return { board, bench };
    });
    setSelectedIds((sel) => {
      if (sel.size === 0) return sel;
      const next = new Set(sel);
      for (const e of entries) if (e.kind === "player") next.delete(e.id);
      return next;
    });
  };

  /** Fill only group gi's empty slots; entries that don't fit stay put. */
  const placeInGroup = (entries: SlotEntry[], gi: number) => {
    updateComp((prev) => {
      if (!prev.board[gi]) return prev;
      const already = placedIds(prev);
      const queue = entries.filter((e) => e.kind !== "player" || !already.has(e.id));
      if (queue.length === 0) return prev;
      const board = prev.board.map((g) => g.slice());
      let changed = false;
      for (let s = 0; s < board[gi].length && queue.length > 0; s++) {
        if (board[gi][s] === null) {
          board[gi][s] = queue.shift()!;
          changed = true;
        }
      }
      return changed ? { board, bench: prev.bench } : prev;
    });
    setSelectedIds((sel) => {
      if (sel.size === 0) return sel;
      const next = new Set(sel);
      for (const e of entries) if (e.kind === "player") next.delete(e.id);
      return next;
    });
  };

  /** Append entries to the bench (skipping anyone already placed). */
  const benchEntries = (entries: SlotEntry[]) => {
    updateComp((prev) => {
      const already = placedIds(prev);
      const queue = entries.filter((e) => e.kind !== "player" || !already.has(e.id));
      return queue.length ? { board: prev.board, bench: [...prev.bench, ...queue] } : prev;
    });
    setSelectedIds((sel) => {
      if (sel.size === 0) return sel;
      const next = new Set(sel);
      for (const e of entries) if (e.kind === "player") next.delete(e.id);
      return next;
    });
  };

  const at = (c: Composition, loc: SlotLocation): SlotEntry | null =>
    loc.area === "board" ? (c.board[loc.gi]?.[loc.si] ?? null) : (c.bench[loc.index] ?? null);

  /** Remove the entry at loc (players return to the roster automatically). */
  const removeAt = (loc: SlotLocation) => {
    updateComp((prev) => {
      if (!at(prev, loc)) return prev;
      if (loc.area === "board") {
        const board = prev.board.map((g) => g.slice());
        board[loc.gi][loc.si] = null;
        return { board, bench: prev.bench };
      }
      const bench = prev.bench.slice();
      bench.splice(loc.index, 1);
      return { board: prev.board, bench };
    });
    setEditing(null);
  };

  /** Move a board entry to the bench. */
  const benchAt = (loc: SlotLocation) => {
    if (loc.area !== "board") return;
    updateComp((prev) => {
      const entry = prev.board[loc.gi]?.[loc.si];
      if (!entry) return prev;
      const board = prev.board.map((g) => g.slice());
      board[loc.gi][loc.si] = null;
      return { board, bench: [...prev.bench, entry] };
    });
    setEditing(null);
  };

  /** Move an already-placed entry to the board's first empty slot. */
  const moveToFirstEmpty = (loc: SlotLocation) => {
    updateComp((prev) => {
      const entry = at(prev, loc);
      if (!entry) return prev;
      let target: [number, number] | null = null;
      outer: for (let g = 0; g < prev.board.length; g++) {
        for (let s = 0; s < prev.board[g].length; s++) {
          if (prev.board[g][s] === null) {
            target = [g, s];
            break outer;
          }
        }
      }
      if (!target) return prev;
      const board = prev.board.map((g) => g.slice());
      let bench = prev.bench;
      if (loc.area === "board") {
        board[loc.gi][loc.si] = null;
      } else {
        bench = prev.bench.slice();
        bench.splice(loc.index, 1);
      }
      board[target[0]][target[1]] = entry;
      return { board, bench };
    });
    setEditing(null);
  };

  /** Move an already-placed entry into group gi's first empty slot. */
  const moveToGroup = (loc: SlotLocation, gi: number) => {
    updateComp((prev) => {
      const entry = at(prev, loc);
      if (!entry || !prev.board[gi]) return prev;
      if (loc.area === "board" && loc.gi === gi) return prev;
      const si = prev.board[gi].findIndex((s) => s === null);
      if (si < 0) return prev;
      const board = prev.board.map((g) => g.slice());
      let bench = prev.bench;
      if (loc.area === "board") {
        board[loc.gi][loc.si] = null;
      } else {
        bench = prev.bench.slice();
        bench.splice(loc.index, 1);
      }
      board[gi][si] = entry;
      return { board, bench };
    });
    setEditing(null);
  };

  const clearGroup = (gi: number) => {
    updateComp((prev) => {
      if (!prev.board[gi]?.some(Boolean)) return prev;
      const board = prev.board.map((g) => g.slice());
      board[gi] = board[gi].map(() => null);
      return { board, bench: prev.bench };
    });
  };

  /** Move every entry in group gi to the bench. */
  const benchGroup = (gi: number) => {
    updateComp((prev) => {
      const entries = prev.board[gi]?.filter((e): e is SlotEntry => e !== null) ?? [];
      if (entries.length === 0) return prev;
      const board = prev.board.map((g) => g.slice());
      board[gi] = board[gi].map(() => null);
      return { board, bench: [...prev.bench, ...entries] };
    });
    setEditing(null);
  };

  const clearBoard = () => {
    updateComp((prev) => {
      if (prev.board.flat().every((s) => s === null) && prev.bench.length === 0) return prev;
      return { board: emptyBoard(prev.board.length), bench: [] };
    });
    setEditing(null);
  };

  // ---------------------------------------------------------------------------
  // Drag and drop
  // ---------------------------------------------------------------------------

  /** Highlight every slot the hovered multi-drag would fill on release. */
  const previewMultiAt = (gi: number, si: number) => {
    const drag = dragRef.current;
    if (drag?.kind !== "roster-multi") return;
    const next = new Set<string>();
    let remaining = drag.entries.length;
    for (let g = gi; g < comp.board.length && remaining > 0; g++) {
      for (let s = g === gi ? si : 0; s < comp.board[g].length && remaining > 0; s++) {
        if (comp.board[g][s] === null) {
          next.add(`${g}:${s}`);
          remaining--;
        }
      }
    }
    setBenchDropTarget(remaining > 0); // overflow lands on the bench
    setMultiPreview((prev) =>
      prev.size === next.size && [...next].every((k) => prev.has(k)) ? prev : next,
    );
  };

  const clearMultiPreview = () => {
    setMultiPreview((prev) => (prev.size > 0 ? new Set<string>() : prev));
    setBenchDropTarget(false);
  };

  // Native drags always finish with a dragend on the source — clear any
  // lingering landing preview there.
  useEffect(() => {
    const onDragEnd = () => clearMultiPreview();
    document.addEventListener("dragend", onDragEnd);
    return () => document.removeEventListener("dragend", onDragEnd);
  });

  const dropOnSlot = (gi: number, si: number) => {
    clearMultiPreview();
    const drag = takeDrag();
    if (!drag) return;
    if (drag.kind === "roster-multi") {
      placeEntries(drag.entries, gi, si);
      setEditing(null);
      return;
    }
    updateComp((prev) => {
      const entry = entryFromDrag(drag, prev);
      if (!entry) return prev;
      if (drag.kind === "slot" && drag.from.area === "board" && drag.from.gi === gi && drag.from.si === si) {
        return prev;
      }
      const occupant = prev.board[gi][si];
      // Fresh entries (roster/class) only land on empty slots; moves swap.
      if (occupant && drag.kind !== "slot") return prev;
      const board = prev.board.map((g) => g.slice());
      let bench = prev.bench;
      if (drag.kind === "slot") {
        if (drag.from.area === "board") {
          board[drag.from.gi][drag.from.si] = occupant;
        } else {
          bench = prev.bench.slice();
          if (occupant) bench[drag.from.index] = occupant;
          else bench.splice(drag.from.index, 1);
        }
      }
      board[gi][si] = entry;
      return { board, bench };
    });
    setEditing(null);
  };

  const dropOnBench = () => {
    clearMultiPreview();
    const drag = takeDrag();
    if (!drag) return;
    if (drag.kind === "roster-multi") {
      updateComp((prev) => {
        const already = placedIds(prev);
        const queue = drag.entries.filter((e) => !already.has(e.id));
        return queue.length ? { board: prev.board, bench: [...prev.bench, ...queue] } : prev;
      });
      setEditing(null);
      return;
    }
    updateComp((prev) => {
      const entry = entryFromDrag(drag, prev);
      if (!entry) return prev;
      if (drag.kind === "slot") {
        if (drag.from.area === "bench") return prev;
        const board = prev.board.map((g) => g.slice());
        board[drag.from.gi][drag.from.si] = null;
        return { board, bench: [...prev.bench, entry] };
      }
      return { board: prev.board, bench: [...prev.bench, entry] };
    });
    setEditing(null);
  };

  // ---------------------------------------------------------------------------
  // Slot editor
  // ---------------------------------------------------------------------------

  // Spec/note edits bypass the history: note typing would spam one entry per
  // keystroke.
  const patchEditing = (patch: Partial<Pick<SlotEntry, "spec" | "note">>) => {
    if (!editing) return;
    setComp((prev) => {
      if (editing.area === "board") {
        const current = prev.board[editing.gi]?.[editing.si];
        if (!current) return prev;
        const board = prev.board.map((g) => g.slice());
        board[editing.gi][editing.si] = { ...current, ...patch };
        return { board, bench: prev.bench };
      }
      const current = prev.bench[editing.index];
      if (!current) return prev;
      const bench = prev.bench.slice();
      bench[editing.index] = { ...current, ...patch };
      return { board: prev.board, bench };
    });
  };

  const confirmSize = () => {
    updateComp((prev) => {
      if (prev.board.length === 0) return { board: emptyBoard(pendingGroups), bench: [] };
      if (pendingGroups === prev.board.length) return prev;
      if (pendingGroups > prev.board.length) {
        return {
          board: [...prev.board.map((g) => g.slice()), ...emptyBoard(pendingGroups - prev.board.length)],
          bench: prev.bench,
        };
      }
      const kept = prev.board.slice(0, pendingGroups).map((g) => g.slice());
      const overflow = prev.board.slice(pendingGroups).flat().filter((e): e is SlotEntry => e !== null);
      return { board: kept, bench: [...prev.bench, ...overflow] };
    });
    setEditing(null);
    setPhase("set");
  };

  // ---------------------------------------------------------------------------
  // Keybinds: hover a player, press a key. Re-attached each render so the
  // handler always sees fresh state.
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target.isContentEditable;
      if (typing) return; // inputs handle their own Escape

      // Undo/redo work in any phase.
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }

      if (e.key === "Escape") {
        if (keybindsOpen) setKeybindsOpen(false);
        else if (editing) setEditing(null);
        else if (selectedIds.size > 0) setSelectedIds(new Set());
        return;
      }
      if (e.key === "?") {
        e.preventDefault();
        setKeybindsOpen((o) => !o);
        return;
      }

      if (phase !== "set") return;

      if (e.key === "/" || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k")) {
        e.preventDefault();
        setDrawerCollapsed(false);
        // The drawer may need a render to uncollapse before the input exists.
        setTimeout(() => searchInputRef.current?.focus(), 0);
        return;
      }

      // Hover-target actions. A live drag payload (kept for completeness —
      // browsers rarely deliver keys mid-drag) takes precedence.
      const hover = hoverRef.current;
      const groupKey = /^[1-8]$/.test(e.key) ? Number(e.key) - 1 : null;

      const rosterBatch = (entry: (typeof availableRoster)[number]): SlotEntry[] =>
        selectedIds.has(entry.id) && selectedIds.size > 1
          ? availableRoster.filter((p) => selectedIds.has(p.id))
          : [entry];

      if (!hover) return;
      if (hover.area === "roster") {
        // Stale hover (row placed while hovered) — availableRoster filter in
        // placeEntries guards duplicates, but skip if already placed.
        if (placedPlayerIds.has(hover.entry.id)) return;
        if (e.key.toLowerCase() === "b") {
          benchEntries(rosterBatch(hover.entry));
        } else if (groupKey !== null) {
          placeInGroup(rosterBatch(hover.entry), groupKey);
        }
        return;
      }

      // Board/bench hover
      if (e.key.toLowerCase() === "b") benchAt(hover);
      else if (e.key === "Delete" || e.key === "Backspace") removeAt(hover);
      else if (e.key.toLowerCase() === "e") setEditing(hover);
      else if (groupKey !== null) moveToGroup(hover, groupKey);
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  });

  const groupCount = comp.board.length;
  const filledCount = comp.board.flat().filter(Boolean).length;
  const totalSlots = groupCount * GROUP_SIZE;
  const editingEntry = editing ? at(comp, editing) : null;

  return (
    <div className="w-full p-4 md:p-6 space-y-3.5">
      {/* Header bar */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border border-border rounded-lg bg-card">
        {phase === "set" && <GuildSelector guild={guild} onSelect={setGuild} />}
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Untitled composition"
          className="flex-none w-64 bg-transparent text-[15px] font-semibold text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-ring rounded px-1 -mx-1"
        />
        {phase === "set" && (
          <button
            onClick={() => {
              setPendingGroups(groupCount || 8);
              setPhase("picking");
            }}
            title="Click to change raid size"
            className="group flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors"
          >
            {totalSlots}-man · {groupCount} {groupCount === 1 ? "group" : "groups"}
            <Pencil className="h-2.5 w-2.5 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        )}
        <div className="ml-auto flex gap-2">
          <button
            disabled
            title="Not wired up yet"
            className="px-3 py-1.5 border border-border rounded-md text-xs text-muted-foreground/50 cursor-not-allowed"
          >
            Import from raid
          </button>
          <button
            disabled
            title="Not wired up yet"
            className="px-3 py-1.5 rounded-md bg-muted text-xs font-medium text-muted-foreground/50 cursor-not-allowed"
          >
            Save
          </button>
        </div>
      </div>

      {/* Size picker */}
      {phase === "picking" && (
        <SizePicker
          pending={pendingGroups}
          onPendingChange={setPendingGroups}
          onConfirm={confirmSize}
          onCancel={groupCount > 0 ? () => setPhase("set") : undefined}
        />
      )}

      {/* Board */}
      {phase === "set" && (
        <div
          className="relative border border-border rounded-lg bg-card overflow-hidden grid"
          style={{
            gridTemplateColumns: drawerCollapsed ? "36px 1fr" : "236px 1fr",
            // Grow into spare viewport height (nav + page header + padding
            // ≈ 340px) so the roster gets the room; small screens fall back
            // to content height.
            minHeight: "max(480px, calc(100vh - 340px))",
          }}
        >
          {editingEntry && editing && (
            <SlotEditorModal
              entry={editingEntry}
              onPatch={patchEditing}
              onRemove={() => removeAt(editing)}
              onClose={() => setEditing(null)}
            />
          )}
          {/* The absolute fill keeps the drawer from stretching the grid row:
              the board dictates the height and the roster list scrolls inside. */}
          <div className="relative min-h-[480px]">
            <div className="absolute inset-0">
              <RosterDrawer
                collapsed={drawerCollapsed}
                onToggleCollapsed={() => setDrawerCollapsed((c) => !c)}
                classes={classes}
                available={availableRoster}
                rosterLoading={rosterLoading}
                hasGuild={!!guild}
                dragRef={dragRef}
                hoverRef={hoverRef}
                searchInputRef={searchInputRef}
                selectedIds={selectedIds}
                onSelectionChange={setSelectedIds}
                onQuickPlace={(entries, toBench) =>
                  toBench ? benchEntries(entries) : placeEntries(entries)
                }
              />
            </div>
          </div>
          {/* Capped at four group-columns wide; the space to the right is
              reserved for the coverage rail later. */}
          <div className="p-3 flex flex-col gap-2.5 min-w-0 max-w-[1060px]">
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              <span>
                {totalSlots} slots · <span className="text-foreground">{filledCount} filled</span> ·{" "}
                {totalSlots - filledCount} empty · bench {comp.bench.length}
              </span>
              <div className="ml-auto flex items-center gap-3">
                {(filledCount > 0 || comp.bench.length > 0) && (
                  <button
                    onClick={clearBoard}
                    title="Empty every group and the bench (undo with Ctrl+Z)"
                    className="text-destructive hover:text-destructive/80 transition-colors"
                  >
                    Clear board
                  </button>
                )}
                <button
                  onClick={() => setKeybindsOpen(true)}
                  title="Keyboard shortcuts (?)"
                  className="flex items-center gap-1.5 text-primary hover:opacity-80 transition-opacity"
                >
                  <Keyboard className="h-3.5 w-3.5" />
                  Keybind Help
                </button>
              </div>
            </div>
            <div className="grid gap-2.5 flex-1 content-start grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
              {comp.board.map((slots, gi) => (
                <GroupCard
                  key={gi}
                  gi={gi}
                  slots={slots}
                  note={groupNotes[gi] ?? ""}
                  onNoteChange={(note) => setGroupNotes((n) => ({ ...n, [gi]: note }))}
                  onSlotClick={(si) => setEditing({ area: "board", gi, si })}
                  onSlotDrop={(si) => dropOnSlot(gi, si)}
                  onSlotMultiOver={(si) => previewMultiAt(gi, si)}
                  previewSlots={multiPreview}
                  onSlotBench={(si) => benchAt({ area: "board", gi, si })}
                  onSlotRemove={(si) => removeAt({ area: "board", gi, si })}
                  onClearGroup={() => clearGroup(gi)}
                  onBenchGroup={() => benchGroup(gi)}
                  dragRef={dragRef}
                  hoverRef={hoverRef}
                />
              ))}
            </div>
            {/* Bench */}
            <div
              onDragOver={(e) => {
                const drag = dragRef.current;
                // Everything can drop here except an entry already on the bench.
                if (!drag || (drag.kind === "slot" && drag.from.area === "bench")) return;
                e.preventDefault();
                setBenchDropTarget(true);
              }}
              onDragLeave={(e) => {
                if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                setBenchDropTarget(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setBenchDropTarget(false);
                dropOnBench();
              }}
              className={`border border-dashed rounded-lg px-2.5 py-2 transition-colors ${
                benchDropTarget ? "border-ring bg-primary/10" : "border-border bg-muted/20"
              }`}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[11px] font-semibold text-foreground/90">Bench</span>
                <span className="text-[10px] text-muted-foreground">
                  {comp.bench.length} · drop players or classes here
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {comp.bench.map((entry, index) => (
                  <button
                    key={entry.kind === "player" ? entry.id : `ph-${index}`}
                    draggable
                    onDragStart={() => {
                      dragRef.current = { kind: "slot", from: { area: "bench", index } };
                    }}
                    onDragEnd={() => {
                      dragRef.current = null;
                    }}
                    onClick={() => setEditing({ area: "bench", index })}
                    onMouseDown={(e) => {
                      // Stop middle-click autoscroll.
                      if (e.button === 1) e.preventDefault();
                    }}
                    onAuxClick={(e) => {
                      if (e.button !== 1) return;
                      e.preventDefault();
                      moveToFirstEmpty({ area: "bench", index });
                    }}
                    onMouseEnter={() => {
                      hoverRef.current = { area: "bench", index };
                    }}
                    onMouseLeave={() => {
                      if (hoverRef.current?.area === "bench" && hoverRef.current.index === index) {
                        hoverRef.current = null;
                      }
                    }}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-card border border-border/60 cursor-pointer hover:border-ring transition-colors"
                  >
                    {entry.kind === "player" ? (
                      <ClassIcon cls={entry.cls} className="h-4 w-4 rounded border border-border/60" />
                    ) : (
                      <span
                        className="h-4 w-1 rounded-sm"
                        style={{ backgroundColor: CLASS_CSS_VAR[entry.cls] ?? CLASS_CSS_VAR.UNKNOWN }}
                      />
                    )}
                    <span
                      className="text-[11px]"
                      style={{ color: CLASS_CSS_VAR[entry.cls] ?? CLASS_CSS_VAR.UNKNOWN }}
                    >
                      {entryName(entry)}
                    </span>
                    {(entry.spec || entry.note) && entry.kind === "player" && (
                      <span className="text-[9px] text-muted-foreground">
                        {entry.spec}
                        {entry.note ? ` · ${entry.note}` : ""}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <KeybindsOverlay open={keybindsOpen} onClose={() => setKeybindsOpen(false)} />
    </div>
  );
}
