import { useMemo, useRef, useState } from "react";
import { ChevronDown, Pencil } from "lucide-react";
import { useGuildCharacters } from "@/api/queries";
import type { GuildInfo } from "@/api/typesGenerated";
import { serverCapabilities } from "@/config/serverCapabilities";
import { gearClassesForFlavor } from "@/pages/Gear/classInfo";
import { CLASS_CSS_VAR } from "@/pages/Rankings/classDisplay";
import type { Board, DragPayload, SlotEntry, SlotLocation } from "./types";
import { GROUP_SIZE, emptyBoard, entryName, playerEntry } from "./types";
import { GuildSelector } from "./GuildSelector";
import { RosterDrawer } from "./RosterDrawer";
import { GroupCard } from "./GroupCard";
import { SlotEditorModal } from "./SlotEditorModal";
import { SizePicker } from "./SizePicker";
import { ClassIcon } from "./ClassIcon";

type Phase = "unset" | "picking" | "set";

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
    case "slot":
      return drag.from.area === "board"
        ? (comp.board[drag.from.gi]?.[drag.from.si] ?? null)
        : (comp.bench[drag.from.index] ?? null);
  }
}

export function RaidPlannerPage() {
  const [phase, setPhase] = useState<Phase>("unset");
  const [pendingGroups, setPendingGroups] = useState(8);
  const [title, setTitle] = useState("");
  const [guild, setGuild] = useState<GuildInfo | null>(null);
  const [comp, setComp] = useState<Composition>({ board: [], bench: [] });
  const [groupNotes, setGroupNotes] = useState<Record<number, string>>({});
  const [editing, setEditing] = useState<SlotLocation | null>(null);
  const [drawerCollapsed, setDrawerCollapsed] = useState(false);
  const dragRef = useRef<DragPayload | null>(null);

  const classes = useMemo(() => gearClassesForFlavor(serverCapabilities.defaultFlavor), []);
  const { data: rosterData, isLoading: rosterLoading } = useGuildCharacters(guild?.id);

  const placedPlayerIds = useMemo(() => {
    const ids = new Set<string>();
    for (const entry of [...comp.board.flat(), ...comp.bench]) {
      if (entry?.kind === "player") ids.add(entry.id);
    }
    return ids;
  }, [comp]);

  const availableRoster = useMemo(
    () =>
      (rosterData?.members ?? [])
        .filter((m) => !placedPlayerIds.has(m.id))
        .map(playerEntry),
    [rosterData, placedPlayerIds],
  );

  const takeDrag = (): DragPayload | null => {
    const drag = dragRef.current;
    dragRef.current = null;
    return drag;
  };

  const dropOnSlot = (gi: number, si: number) => {
    const drag = takeDrag();
    if (!drag) return;
    setComp((prev) => {
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
    const drag = takeDrag();
    if (!drag) return;
    setComp((prev) => {
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

  const entryAt = (loc: SlotLocation): SlotEntry | null =>
    loc.area === "board" ? (comp.board[loc.gi]?.[loc.si] ?? null) : (comp.bench[loc.index] ?? null);

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

  const removeEditing = () => {
    if (!editing) return;
    setComp((prev) => {
      if (editing.area === "board") {
        const board = prev.board.map((g) => g.slice());
        board[editing.gi][editing.si] = null;
        return { board, bench: prev.bench };
      }
      const bench = prev.bench.slice();
      bench.splice(editing.index, 1);
      return { board: prev.board, bench };
    });
    setEditing(null);
  };

  const confirmSize = () => {
    setComp((prev) => {
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

  const groupCount = comp.board.length;
  const filledCount = comp.board.flat().filter(Boolean).length;
  const totalSlots = groupCount * GROUP_SIZE;
  const editingEntry = editing ? entryAt(editing) : null;

  return (
    <div className="max-w-[1480px] mx-auto p-4 md:p-6 space-y-3.5">
      {/* Header bar */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border border-border rounded-lg bg-card">
        {phase === "set" && <GuildSelector guild={guild} onSelect={setGuild} />}
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Untitled composition"
          className="flex-none w-64 bg-transparent text-[15px] font-semibold text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-ring rounded px-1 -mx-1"
        />
        {phase === "unset" && (
          <>
            <button
              onClick={() => setPhase("picking")}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-ring/60 rounded-md bg-primary/10 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
            >
              Set raid size <ChevronDown className="h-3 w-3" />
            </button>
            <span className="text-[11px] text-muted-foreground">
              groups and the roster appear after size is set
            </span>
          </>
        )}
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
          style={{ gridTemplateColumns: drawerCollapsed ? "36px 1fr" : "236px 1fr" }}
        >
          {editingEntry && editing && (
            <SlotEditorModal
              entry={editingEntry}
              onPatch={patchEditing}
              onRemove={removeEditing}
              onClose={() => setEditing(null)}
            />
          )}
          <RosterDrawer
            collapsed={drawerCollapsed}
            onToggleCollapsed={() => setDrawerCollapsed((c) => !c)}
            classes={classes}
            available={availableRoster}
            rosterLoading={rosterLoading}
            hasGuild={!!guild}
            dragRef={dragRef}
          />
          <div className="p-3 flex flex-col gap-2.5 min-w-0">
            <p className="text-[11px] text-muted-foreground">
              {totalSlots} slots · <span className="text-foreground">{filledCount} filled</span> ·{" "}
              {totalSlots - filledCount} empty · bench {comp.bench.length}
              <span className="float-right">drag players or classes from the roster into a slot</span>
            </p>
            <div
              className="grid gap-2.5"
              style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}
            >
              {comp.board.map((slots, gi) => (
                <GroupCard
                  key={gi}
                  gi={gi}
                  slots={slots}
                  note={groupNotes[gi] ?? ""}
                  onNoteChange={(note) => setGroupNotes((n) => ({ ...n, [gi]: note }))}
                  onSlotClick={(si) => setEditing({ area: "board", gi, si })}
                  onSlotDrop={(si) => dropOnSlot(gi, si)}
                  dragRef={dragRef}
                />
              ))}
            </div>
            {/* Bench */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                dropOnBench();
              }}
              className="border border-dashed border-border rounded-lg bg-muted/20 px-2.5 py-2"
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
    </div>
  );
}
