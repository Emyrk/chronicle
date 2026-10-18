import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  Circle,
  Copy,
  Eraser,
  MapPin,
  MousePointer2,
  PenLine,
  Plus,
  Redo2,
  Ruler,
  Square,
  Trash2,
  Triangle,
  Type,
  Undo2,
  UserRound,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PLAN_COLORS, PLAN_LIMITS, PLAN_MARKER_ICONS, type PlanMarkerIcon } from "./mapPlan";
import { drawPlanMarker, MARKER_NAMES, PLAN_ART_SIZE } from "./planArt";
import { CIRCLE_PRESETS, CONE_WIDTHS, type PlanEditor, type PlanRosterEntry, type PlanTokenChoice, type PlanTool } from "./usePlanEditor";

const TOOLS: { tool: PlanTool; label: string; hint: string; icon: ReactNode }[] = [
  { tool: "select", label: "Select", hint: "Click to select, drag to move, Delete to remove", icon: <MousePointer2 className="h-4 w-4" /> },
  { tool: "marker", label: "Marker", hint: "Click to place a raid marker", icon: <MapPin className="h-4 w-4" /> },
  { tool: "arrow", label: "Arrow", hint: "Drag from start to end", icon: <ArrowUpRight className="h-4 w-4" /> },
  { tool: "pen", label: "Pen", hint: "Drag to draw", icon: <PenLine className="h-4 w-4" /> },
  { tool: "text", label: "Text", hint: "Type the text, then click to place it", icon: <Type className="h-4 w-4" /> },
  { tool: "circle", label: "Circle", hint: "Drag out a radius, or click for the chosen size", icon: <Circle className="h-4 w-4" /> },
  { tool: "cone", label: "Cone", hint: "Drag from its tip toward where it points", icon: <Triangle className="h-4 w-4" /> },
  { tool: "rect", label: "Area", hint: "Drag from corner to corner", icon: <Square className="h-4 w-4" /> },
  { tool: "measure", label: "Measure", hint: "Drag to measure in yards (not kept)", icon: <Ruler className="h-4 w-4" /> },
  { tool: "token", label: "Player", hint: "Pick a player or role, then click to place them", icon: <UserRound className="h-4 w-4" /> },
  { tool: "eraser", label: "Eraser", hint: "Click an item to remove it", icon: <Eraser className="h-4 w-4" /> },
];


const toolbarClass = "pointer-events-auto flex items-center gap-0.5 rounded-sm border border-black/80 bg-black/80 p-1 text-white shadow-[0_4px_16px_rgba(0,0,0,.5)]";

function IconButton({ active = false, disabled = false, title, onClick, children }: { active?: boolean; disabled?: boolean; title: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "grid h-7 min-w-7 place-items-center rounded-sm px-1 text-xs disabled:opacity-35",
        active ? "bg-amber-400/90 text-black" : "text-white/75 enabled:hover:bg-white/10 enabled:hover:text-white",
      )}
    >
      {children}
    </button>
  );
}

function MarkerIcon({ icon, size = 18 }: { icon: PlanMarkerIcon; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const context = ref.current?.getContext("2d");
    if (context) drawPlanMarker(context, icon);
  }, [icon]);
  return <canvas ref={ref} width={PLAN_ART_SIZE} height={PLAN_ART_SIZE} style={{ width: size, height: size }} aria-hidden />;
}

/**
 * The map's planning toolbar (top centre): tools, colour, the active tool's
 * options, undo/redo; and its steps bar (bottom centre).
 */
export function PlanControls({ editor, roster, onClose, saveSlot }: {
  editor: PlanEditor;
  roster: PlanRosterEntry[];
  onClose: () => void;
  /** Saving and sharing controls, beside undo/redo. */
  saveSlot?: ReactNode;
}) {
  const { state, set } = editor;
  const tool = TOOLS.find((entry) => entry.tool === state.tool)!;
  const usesColor = ["arrow", "pen", "text", "circle", "cone", "rect"].includes(state.tool);
  return (
    <>
      <div className="pointer-events-none absolute left-1/2 top-2 z-40 flex -translate-x-1/2 flex-col items-center gap-1">
        <div role="toolbar" aria-label="Plan tools" className={toolbarClass}>
          {TOOLS.map((entry) => (
            <IconButton key={entry.tool} active={state.tool === entry.tool} title={`${entry.label}: ${entry.hint}`} onClick={() => set({ tool: entry.tool, selectedId: null })}>
              {entry.icon}
            </IconButton>
          ))}
          <span className="mx-1 h-5 w-px bg-white/15" />
          <IconButton title="Undo (Ctrl+Z)" disabled={!editor.canUndo} onClick={editor.undo}><Undo2 className="h-4 w-4" /></IconButton>
          <IconButton title="Redo (Ctrl+Shift+Z)" disabled={!editor.canRedo} onClick={editor.redo}><Redo2 className="h-4 w-4" /></IconButton>
          {saveSlot}
          <span className="mx-1 h-5 w-px bg-white/15" />
          <IconButton title="Close planning (Esc)" onClick={onClose}><X className="h-4 w-4" /></IconButton>
        </div>
        <div className={cn(toolbarClass, "text-[11px]")}>
          <span className="px-1 text-white/60">{tool.hint}</span>
          {usesColor && (
            <span className="flex items-center gap-0.5 pl-1">
              {PLAN_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  title={color}
                  aria-label={`Colour ${color}`}
                  aria-pressed={state.color === color}
                  onClick={() => set({ color })}
                  className={cn("h-4 w-4 rounded-full border", state.color === color ? "border-white" : "border-black/60")}
                  style={{ background: color }}
                />
              ))}
            </span>
          )}
          {state.tool === "marker" && (
            <span className="flex items-center gap-0.5 pl-1">
              {PLAN_MARKER_ICONS.map((icon) => (
                <IconButton key={icon} active={state.markerIcon === icon} title={MARKER_NAMES[icon]} onClick={() => set({ markerIcon: icon })}>
                  <MarkerIcon icon={icon} />
                </IconButton>
              ))}
            </span>
          )}
          {state.tool === "text" && (
            <input
              value={state.text}
              maxLength={PLAN_LIMITS.textLength}
              onChange={(event) => set({ text: event.target.value })}
              placeholder="Text to place"
              aria-label="Text to place"
              className="ml-1 w-44 rounded-sm border border-white/15 bg-black/60 px-1.5 py-0.5 text-[11px] text-white outline-none focus:border-amber-300"
            />
          )}
          {state.tool === "circle" && (
            <span className="flex items-center gap-0.5 pl-1">
              {CIRCLE_PRESETS.map((radius) => (
                <IconButton key={radius} active={state.circleRadius === radius} title={`${radius} yard radius`} onClick={() => set({ circleRadius: radius })}>{radius}</IconButton>
              ))}
              <span className="text-white/50">yd</span>
            </span>
          )}
          {state.tool === "cone" && (
            <span className="flex items-center gap-0.5 pl-1">
              {CONE_WIDTHS.map((width) => (
                <IconButton key={width} active={state.coneWidth === width} title={`${width}° wide`} onClick={() => set({ coneWidth: width })}>{width}°</IconButton>
              ))}
            </span>
          )}
          {state.tool === "token" && <TokenPicker roster={roster} chosen={state.token} onChoose={(token) => set({ token })} />}
          {state.tool === "select" && state.selectedId && (
            <IconButton title="Delete the selection (Delete)" onClick={() => editor.deleteItem(state.selectedId!)}><Trash2 className="h-3.5 w-3.5" /></IconButton>
          )}
        </div>
      </div>
      <PlanSteps editor={editor} />
    </>
  );
}

function TokenPicker({ roster, chosen, onChoose }: { roster: PlanRosterEntry[]; chosen: PlanTokenChoice | null; onChoose: (token: PlanTokenChoice) => void }) {
  const [filter, setFilter] = useState("");
  const shown = useMemo(() => roster.filter((entry) => entry.label.toLowerCase().includes(filter.toLowerCase())), [filter, roster]);
  return (
    <span className="flex max-w-[34rem] items-center gap-1 pl-1">
      <input
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        placeholder="Find"
        aria-label="Find a player"
        className="w-16 rounded-sm border border-white/15 bg-black/60 px-1.5 py-0.5 text-[11px] text-white outline-none focus:border-amber-300"
      />
      <span className="styled-scrollbar flex max-w-[28rem] gap-0.5 overflow-x-auto">
        {shown.map((entry) => (
          <button
            key={`${entry.group}|${entry.guid ?? entry.label}`}
            type="button"
            title={entry.group === "Roles" ? `Place a ${entry.label} token` : `Place ${entry.label}`}
            aria-pressed={chosen?.label === entry.label && chosen?.guid === entry.guid}
            onClick={() => onChoose({ label: entry.label, color: entry.color, icon: entry.icon, guid: entry.guid })}
            className={cn(
              "shrink-0 whitespace-nowrap rounded-sm border px-1.5 py-0.5 text-[11px]",
              chosen?.label === entry.label && chosen?.guid === entry.guid ? "border-white bg-white/15" : "border-transparent hover:bg-white/10",
            )}
            style={{ color: entry.color }}
          >
            {entry.label}
          </button>
        ))}
      </span>
    </span>
  );
}

function PlanSteps({ editor }: { editor: PlanEditor }) {
  const { state, steps } = editor;
  const [renaming, setRenaming] = useState<number | null>(null);
  return (
    <div className="pointer-events-none absolute bottom-2 left-1/2 z-40 -translate-x-1/2">
      <div role="tablist" aria-label="Plan steps" className={cn(toolbarClass, "max-w-[44rem]")}>
        <span className="styled-scrollbar flex max-w-[36rem] items-center gap-0.5 overflow-x-auto">
          {state.plan.steps.map((step, index) => (
            renaming === index ? (
              <input
                key={step.id}
                autoFocus
                defaultValue={step.name}
                maxLength={PLAN_LIMITS.nameLength}
                aria-label="Step name"
                onBlur={(event) => {
                  steps.rename(index, event.target.value);
                  setRenaming(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                  if (event.key === "Escape") setRenaming(null);
                  event.stopPropagation();
                }}
                className="w-28 rounded-sm border border-amber-300 bg-black/60 px-1.5 py-0.5 text-[11px] text-white outline-none"
              />
            ) : (
              <button
                key={step.id}
                type="button"
                role="tab"
                aria-selected={index === state.stepIndex}
                title="Click to show; double-click to rename"
                onClick={() => steps.go(index)}
                onDoubleClick={() => setRenaming(index)}
                className={cn(
                  "shrink-0 whitespace-nowrap rounded-sm px-2 py-1 text-[11px]",
                  index === state.stepIndex ? "bg-amber-400/90 font-semibold text-black" : "text-white/75 hover:bg-white/10",
                )}
              >
                {index + 1}. {step.name}
              </button>
            )
          ))}
        </span>
        <span className="mx-1 h-5 w-px bg-white/15" />
        <IconButton title="New step" onClick={() => steps.add(false)}><Plus className="h-4 w-4" /></IconButton>
        <IconButton title="Duplicate this step" onClick={() => steps.add(true)}><Copy className="h-3.5 w-3.5" /></IconButton>
        <IconButton title="Delete this step" disabled={state.plan.steps.length <= 1} onClick={() => steps.remove(state.stepIndex)}><Trash2 className="h-3.5 w-3.5" /></IconButton>
      </div>
    </div>
  );
}
