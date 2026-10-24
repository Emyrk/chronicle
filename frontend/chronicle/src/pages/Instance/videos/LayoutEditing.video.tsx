/**
 * Announcement: layout Edit Mode and Save As.
 *
 * A mock raid page in a browser window. Shift+E turns the layout editable;
 * a panel is removed, another resized, and a new one added. Save as… opens
 * the Layout Book drawer, saves the layout, and puts it on the action bar.
 * Shift+E leaves Edit Mode. 700 frames @ 30fps, 1280x720.
 */
import type { ReactNode } from "react";
import { Check, GripVertical, LockKeyhole, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { clamp, entranceEasing, INTRO_FRAMES } from "@/pages/Instance/PanelExplainer/videos/animation";
import { Cursor, LessonIntro, StepCaption, VideoStage } from "@/pages/Instance/PanelExplainer/videos/shared";

// Content-local frames (the content mounts at INTRO_FRAMES - 10).
const ENTER = 70;
const REMOVE = 150;
const RESIZE = 190;
const RESIZE_END = 240;
const ADD = 280;
const SAVE_AS = 330;
const TYPE = 368;
const SAVE = 440;
const SLOT = 500;
const CLOSE = 556;
const EXIT = 600;
const TRANSITION = 24;

const ease = { ...clamp, easing: entranceEasing };

// Browser window and page geometry, in window-local pixels.
const WINDOW = { left: 112, top: 34, width: 1056, height: 520 };
const BROWSER_BAR = 30;
const PRESET_ROW = 34;
const TOOLBAR = 40;
const PAD = 16;
const GRID_TOP = BROWSER_BAR + PRESET_ROW;
const GRID_WIDTH = WINDOW.width - PAD * 2;
const GAP = 8;
const ROW_HEIGHT = 112;
const COLUMN = (GRID_WIDTH + GAP) / 12;

// The Save drawer, in window-local pixels.
const DRAWER = { width: 380, left: WINDOW.width - 380, top: BROWSER_BAR };
const ROW = 38;
const LIST_TOP = 124;

const SAVED_TITLE = "Onyxia progression";

export default function LayoutEditingVideo() {
  return (
    <VideoStage>
      <div className="absolute inset-0 bg-[#0b1b2a]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(56,189,248,0.25),transparent_42%),radial-gradient(circle_at_15%_85%,rgba(163,53,238,0.12),transparent_36%)]" />
      <Sequence from={INTRO_FRAMES - 10}>
        <Content />
      </Sequence>
      <LessonIntro
        title="Edit layouts on the raid page"
        bullets={[
          <>Press <Kbd>Shift</Kbd> + <Kbd>E</Kbd> to edit the layout you are looking at</>,
          "Move, resize, add, and remove panels in place",
          "Save it to your Layout Book and cast it from the action bar",
        ]}
      />
    </VideoStage>
  );
}

/** Stage coordinates of a window-local point. */
function stage(x: number, y: number) {
  return { x: WINDOW.left + x, y: WINDOW.top + y };
}

/** Window-local rectangle of a grid cell span, below the (animated) toolbar. */
function cell(x: number, y: number, w: number, toolbar: number) {
  return {
    left: PAD + x * COLUMN,
    top: GRID_TOP + toolbar + PAD / 2 + y * (ROW_HEIGHT + GAP),
    width: w * COLUMN - GAP,
    height: ROW_HEIGHT,
  };
}

function Content() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 28 });

  // 0 = viewing, 1 = Edit Mode.
  const editing = interpolate(frame, [ENTER, ENTER + TRANSITION, EXIT, EXIT + TRANSITION], [0, 1, 1, 0], ease);
  const toolbar = TOOLBAR * editing;
  const deathsGone = interpolate(frame, [REMOVE, REMOVE + 16], [0, 1], ease);
  const timelineWidth = interpolate(frame, [RESIZE, RESIZE_END], [8, 12], ease);
  const dispelsIn = interpolate(frame, [ADD, ADD + 18], [0, 1], ease);
  const drawer = interpolate(frame, [SAVE_AS, SAVE_AS + 22, CLOSE, CLOSE + 18], [0, 1, 1, 0], ease);
  const saved = frame >= SAVE + 4;
  const slotted = frame >= SLOT + 4;
  const typed = SAVED_TITLE.slice(0, Math.max(0, Math.floor((frame - TYPE) / 2.4)));

  // Cursor targets in stage coordinates.
  const editingToolbar = TOOLBAR;
  const deaths = cell(8, 1, 4, editingToolbar);
  const timelineStart = cell(0, 1, 8, editingToolbar);
  const timelineEnd = cell(0, 1, 12, editingToolbar);
  const trash = stage(deaths.left + deaths.width - 20, deaths.top + 16);
  const resizeFrom = stage(timelineStart.left + timelineStart.width - 8, timelineStart.top + timelineStart.height - 8);
  const resizeTo = stage(timelineEnd.left + timelineEnd.width - 8, timelineEnd.top + timelineEnd.height - 8);
  // Centers of the toolbar's "+ Panel" and "Save as…" buttons.
  const addPanel = stage(PAD + 263, GRID_TOP + 20);
  const saveAs = stage(WINDOW.width - PAD - 276, GRID_TOP + 20);
  const saveButton = stage(DRAWER.left + DRAWER.width - 100, WINDOW.height - 26);
  const slotButton = stage(DRAWER.left + DRAWER.width - 65, LIST_TOP + ROW * 4 + 90);
  const closeButton = stage(DRAWER.left + DRAWER.width - 22, BROWSER_BAR + 22);

  const keys = [0, 110, REMOVE - 22, REMOVE, RESIZE - 6, RESIZE, RESIZE_END, ADD - 24, ADD, SAVE_AS - 24, SAVE_AS, SAVE - 30, SAVE, SLOT - 26, SLOT, CLOSE - 22, CLOSE];
  const xs = [1180, 1180, trash.x, trash.x, resizeFrom.x, resizeFrom.x, resizeTo.x, addPanel.x, addPanel.x, saveAs.x, saveAs.x, saveButton.x, saveButton.x, slotButton.x, slotButton.x, closeButton.x, closeButton.x];
  const ys = [660, 660, trash.y, trash.y, resizeFrom.y, resizeFrom.y, resizeTo.y, addPanel.y, addPanel.y, saveAs.y, saveAs.y, saveButton.y, saveButton.y, slotButton.y, slotButton.y, closeButton.y, closeButton.y];
  const cursorX = interpolate(frame, keys, xs, ease);
  const cursorY = interpolate(frame, keys, ys, ease);
  const cursorOpacity = interpolate(frame, [100, 118, CLOSE + 10, CLOSE + 24], [0, 1, 1, 0], clamp);
  const click = Math.max(
    ...[REMOVE, ADD, SAVE_AS, SAVE, SLOT, CLOSE].map((at) => interpolate(frame, [at - 4, at, at + 10], [0, 1, 0], clamp)),
    interpolate(frame, [RESIZE - 4, RESIZE, RESIZE_END, RESIZE_END + 8], [0, 1, 1, 0], clamp),
  );

  const step = frame >= SLOT - 26 ? 4 : frame >= SAVE_AS - 24 ? 3 : frame >= REMOVE - 30 ? 2 : 1;
  const captionOpacity = interpolate(frame, [8, 18, 630, 645], [0, 1, 1, 0], clamp);

  return (
    <>
      <div
        className="absolute overflow-hidden rounded-xl border border-zinc-700 bg-[#0a0a0b] shadow-2xl"
        style={{
          ...WINDOW,
          opacity: entrance,
          translate: `0 ${interpolate(entrance, [0, 1], [24, 0])}px`,
        }}
      >
        <BrowserBar />
        <PresetRow editing={editing} />
        <Toolbar height={toolbar} opacity={editing} />

        <Panel rect={cell(0, 0, 6, toolbar)} title="Damage Done" editing={editing}><Bars seed={1} /></Panel>
        <Panel rect={cell(6, 0, 6, toolbar)} title="Healing Done" editing={editing}><Bars seed={2} healing /></Panel>
        <Panel rect={cell(0, 1, timelineWidth, toolbar)} title="Timeline" editing={editing} resizing={frame >= RESIZE && frame < RESIZE_END + 6}><Line /></Panel>
        {deathsGone < 1 && (
          <Panel
            rect={cell(8, 1, 4, toolbar)}
            title="Deaths"
            editing={editing}
            showTrash={frame >= REMOVE - 30}
            style={{ opacity: 1 - deathsGone, scale: interpolate(deathsGone, [0, 1], [1, 0.9]) }}
          >
            <DeathList />
          </Panel>
        )}
        {dispelsIn > 0 && (
          <Panel
            rect={cell(0, 2, 6, toolbar)}
            title="Dispels"
            editing={editing}
            style={{ opacity: dispelsIn, translate: `0 ${interpolate(dispelsIn, [0, 1], [16, 0])}px` }}
          >
            <Bars seed={5} />
          </Panel>
        )}

        <Toast show={frame >= ADD + 2 && frame < ADD + 50}>Panel added below</Toast>
        <Toast show={frame >= SAVE + 4 && frame < SAVE + 60}>Layout saved</Toast>

        <div className="absolute inset-0 bg-black/45" style={{ opacity: drawer * 0.9, top: BROWSER_BAR }} />
        <SaveDrawer progress={drawer} saved={saved} slotted={slotted} title={typed || (frame >= TYPE ? "" : "My layout")} />
      </div>

      <Keys keys={["Shift", "E"]} frame={frame} at={ENTER} label="Edit layout" />
      <Keys keys={["Shift", "E"]} frame={frame} at={EXIT} label="Done" />

      <div style={{ opacity: cursorOpacity }}>
        <Cursor x={cursorX} y={cursorY} clicking={click} />
      </div>

      <div style={{ position: "absolute", inset: 0, zIndex: 206 }}>
        <StepCaption
          step={step}
          opacity={captionOpacity}
          text={
            step === 1
              ? <>Shift+E: edit the layout you are looking at</>
              : step === 2
                ? "Remove, resize, and add panels in place"
                : step === 3
                  ? "Save as… puts it in your Layout Book"
                  : "Add it to your action bar, then cast it with a number key"
          }
        />
      </div>
    </>
  );
}

function BrowserBar() {
  return (
    <div className="flex items-center gap-3 border-b border-zinc-800 bg-[#18181b] px-3" style={{ height: BROWSER_BAR }}>
      <div className="flex gap-1.5">
        <span className="h-3 w-3 rounded-full bg-red-500/80" />
        <span className="h-3 w-3 rounded-full bg-amber-400/80" />
        <span className="h-3 w-3 rounded-full bg-green-500/80" />
      </div>
      <div className="flex-1 truncate rounded-md bg-[#0a0a0b] px-3 py-1 font-mono text-[11px] text-zinc-400">
        chronicleclassic.com/instances/onyxias-lair
      </div>
    </div>
  );
}

function PresetRow({ editing }: { editing: number }) {
  return (
    <div className="absolute flex items-center gap-1 text-[12px]" style={{ left: PAD, right: PAD, top: BROWSER_BAR + 4, height: PRESET_ROW - 8 }}>
      {["Summary", "Damage", "Healing", "Dispels", "Deaths", "Player Timeline", "Map"].map((label) => (
        <span
          key={label}
          className={`rounded px-2.5 py-1 ${label === "Summary" ? "bg-primary text-primary-foreground" : "text-zinc-400"}`}
          style={{ opacity: label === "Summary" ? 1 : 1 - editing * 0.5 }}
        >
          {label}
        </span>
      ))}
      <span className="ml-auto flex items-center gap-1.5 rounded px-2.5 py-1 text-zinc-300" style={{ opacity: 1 - editing }}>
        <Pencil className="h-3.5 w-3.5" /> Edit layout
      </span>
    </div>
  );
}

function Toolbar({ height, opacity }: { height: number; opacity: number }) {
  return (
    <div
      className="absolute flex items-center gap-2 overflow-hidden rounded-lg border border-primary/40 bg-primary/10 px-3 text-[12px]"
      style={{ left: PAD, right: PAD, top: GRID_TOP + 2, height: Math.max(0, height - 6), opacity }}
    >
      <span className="font-semibold">Editing layout</span>
      <span className="text-zinc-400">Unsaved changes</span>
      <span className="mx-1 h-4 w-px bg-zinc-700" />
      <ToolbarButton><Plus className="h-3.5 w-3.5" /> Panel</ToolbarButton>
      <ToolbarButton><Plus className="h-3.5 w-3.5" /> Strip</ToolbarButton>
      <span className="ml-auto" />
      <ToolbarButton><Save className="h-3.5 w-3.5" /> Save as…</ToolbarButton>
      <span className="flex items-center gap-1 px-2 text-zinc-300"><X className="h-3.5 w-3.5" /> Cancel <MiniKey>Esc</MiniKey></span>
      <span className="flex items-center gap-1 rounded bg-primary px-2.5 py-1 font-medium text-primary-foreground"><Check className="h-3.5 w-3.5" /> Done <MiniKey>⇧E</MiniKey></span>
    </div>
  );
}

function ToolbarButton({ children }: { children: ReactNode }) {
  return <span className="flex items-center gap-1 rounded border border-zinc-600 bg-zinc-900/80 px-2.5 py-1">{children}</span>;
}

function Panel({
  rect,
  title,
  editing,
  resizing = false,
  showTrash = false,
  style,
  children,
}: {
  rect: { left: number; top: number; width: number; height: number };
  title: string;
  editing: number;
  resizing?: boolean;
  showTrash?: boolean;
  style?: React.CSSProperties;
  children: ReactNode;
}) {
  return (
    <div
      className="absolute flex flex-col overflow-hidden rounded-lg border bg-[#111113]"
      style={{
        ...rect,
        borderColor: editing > 0.5 ? `color-mix(in oklch, var(--primary) ${resizing ? 90 : 45}%, transparent)` : "#27272a",
        borderStyle: editing > 0.5 ? "dashed" : "solid",
        ...style,
      }}
    >
      <div className="flex shrink-0 items-center gap-1.5 px-2.5 pt-2 text-[12px] font-semibold">
        <GripVertical className="h-3.5 w-3.5 text-zinc-400" style={{ opacity: editing, width: 14 * editing }} />
        {title}
      </div>
      <div className="min-h-0 flex-1 px-2.5 pb-2 pt-1.5">{children}</div>
      {showTrash && editing > 0.5 && (
        <span className="absolute right-2 top-1.5 grid h-6 w-7 place-items-center rounded bg-red-600 text-white"><Trash2 className="h-3.5 w-3.5" /></span>
      )}
      {editing > 0.5 && (
        <span className="absolute bottom-1 right-1 h-3 w-3 border-b-2 border-r-2 border-primary" style={{ opacity: editing }} />
      )}
    </div>
  );
}

const CLASS_COLORS = ["#C79C6E", "#69CCF0", "#FFF569", "#ABD473", "#9482C9", "#F58CBA"];

function Bars({ seed, healing = false }: { seed: number; healing?: boolean }) {
  return (
    <div className="space-y-1">
      {[0, 1, 2, 3].map((index) => {
        const width = 92 - index * 15 - ((seed * 7 + index * 3) % 9);
        const color = healing ? ["#F58CBA", "#FF7D0A", "#FFFFFF", "#F58CBA"][index] : CLASS_COLORS[(seed + index) % CLASS_COLORS.length];
        return (
          <div key={index} className="h-[14px] rounded-sm" style={{ width: `${width}%`, background: `color-mix(in oklch, ${color} 70%, #18181b)` }} />
        );
      })}
    </div>
  );
}

function Line() {
  const points = Array.from({ length: 41 }, (_, index) => {
    const x = (index / 40) * 100;
    const y = 34 - (Math.sin(index * 0.5) * 12 + Math.sin(index * 1.7) * 6 + 14);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-full w-full">
      <polyline points={points} fill="none" stroke="#3b82f6" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function DeathList() {
  return (
    <div className="space-y-1 text-[11px] text-zinc-300">
      {[["Welf", "Deep Breath", "4:12"], ["Gogus", "Flame Breath", "5:40"], ["Kresh", "Whelps", "6:03"]].map(([name, cause, time]) => (
        <div key={name} className="flex justify-between gap-2"><span className="truncate">{name} · {cause}</span><span className="font-mono text-zinc-500">{time}</span></div>
      ))}
    </div>
  );
}

function Toast({ show, children }: { show: boolean; children: ReactNode }) {
  if (!show) return null;
  return (
    <div className="absolute bottom-4 left-4 z-30 flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-[12px] shadow-xl">
      <Check className="h-3.5 w-3.5 text-emerald-400" /> {children}
    </div>
  );
}

function SaveDrawer({ progress, saved, slotted, title }: { progress: number; saved: boolean; slotted: boolean; title: string }) {
  if (progress <= 0) return null;
  const rows: { title: string; subtitle: string; icon: string; selected?: boolean; locked?: boolean; onScreen?: boolean }[] = [
    { title: "New layout", subtitle: "Add a new layout to your Layout Book", icon: "+", selected: !saved },
    { title: "Raid Night", subtitle: "Your layout", icon: "#c2410c" },
    { title: "Healer View", subtitle: "Tracked · by Kresh", icon: "#ca8a04", locked: true },
    ...(saved ? [{ title: SAVED_TITLE, subtitle: "Your layout", icon: "#7c3aed", selected: true, onScreen: true }] : []),
  ];
  const listBottom = LIST_TOP + ROW * 4;
  return (
    <div
      className="absolute z-20 flex flex-col border-l border-zinc-700 bg-[#0c0c0e] shadow-2xl"
      style={{ left: DRAWER.left, top: DRAWER.top, width: DRAWER.width, bottom: 0, translate: `${(1 - progress) * DRAWER.width}px 0` }}
    >
      <div className="relative border-b border-zinc-800 px-4 py-3">
        <p className="text-[15px] font-semibold">Save layout</p>
        <p className="text-[11px] text-zinc-400">Save this layout to your Layout Book and put it on your action bar.</p>
        <X className="absolute right-3 top-3 h-4 w-4 text-zinc-400" />
      </div>
      <p className="absolute left-4 text-[12px] font-medium" style={{ top: LIST_TOP - BROWSER_BAR - 22 }}>Save to</p>
      <div className="absolute left-4 right-4 overflow-hidden rounded-md border border-zinc-800" style={{ top: LIST_TOP - BROWSER_BAR }}>
        {rows.map((row) => (
          <div
            key={row.title}
            className={`flex items-center gap-2.5 border-b border-zinc-800 px-2.5 last:border-b-0 ${row.selected ? "bg-primary/15 shadow-[inset_3px_0_0_var(--primary)]" : ""}`}
            style={{ height: ROW }}
          >
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded border border-zinc-700 text-[13px] text-primary" style={{ background: row.icon.startsWith("#") ? row.icon : undefined }}>
              {row.icon.startsWith("#") ? null : row.icon}
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-[12px] font-medium">{row.title}</span>
              <span className="block truncate text-[10px] text-zinc-400">{row.subtitle}</span>
            </span>
            {row.onScreen && <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[9px] text-primary">On screen</span>}
            {row.locked && <LockKeyhole className="h-3.5 w-3.5 text-zinc-400" />}
          </div>
        ))}
      </div>

      <div className="absolute left-4 right-4" style={{ top: listBottom - BROWSER_BAR + 12 }}>
        <p className="mb-1 text-[11px] text-zinc-400">Title</p>
        <div className="flex h-8 items-center rounded-md border border-zinc-700 bg-zinc-950 px-2.5 text-[12px]">
          {title}<span className="ml-px h-4 w-px bg-zinc-300" style={{ opacity: saved ? 0 : 1 }} />
        </div>
        <div className="mt-3 flex items-center justify-between">
          <p className="text-[12px] font-medium">Action bar</p>
          {saved && !slotted && (
            <span className="flex items-center gap-1 rounded border border-zinc-600 px-2 py-1 text-[11px]"><Plus className="h-3 w-3" /> Add to slot 3</span>
          )}
          {slotted && <span className="flex items-center gap-1 text-[11px] text-zinc-400"><Check className="h-3 w-3" /> On slot 3</span>}
        </div>
        <div className="mt-2 flex gap-1 rounded-md border border-zinc-800 bg-black/30 p-1.5">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].map((key) => {
            const color = key === "1" ? "#c2410c" : key === "2" ? "#ca8a04" : key === "3" && slotted ? "#7c3aed" : null;
            return (
              <span key={key} className="relative h-7 flex-1 rounded-sm border-2 border-zinc-700 bg-zinc-900" style={{ background: color ?? undefined }}>
                <span className="absolute right-0.5 top-0 text-[8px] font-bold text-zinc-200">{key}</span>
              </span>
            );
          })}
        </div>
      </div>

      <div className="mt-auto flex justify-end border-t border-zinc-800 px-4 py-2.5">
        <span className="flex items-center gap-1.5 rounded bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground">
          <Save className="h-3.5 w-3.5" /> Save as new layout
        </span>
      </div>
    </div>
  );
}

function MiniKey({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-zinc-500 bg-zinc-800 px-1 font-mono text-[9px] text-zinc-200">{children}</kbd>;
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <span className="mx-1 inline-flex min-w-9 items-center justify-center rounded-md border border-zinc-500 border-b-4 bg-zinc-800 px-2 py-0.5 font-mono text-[0.8em] font-semibold text-zinc-100">
      {children}
    </span>
  );
}

/** Keycaps that pop in before `at`, press down at `at`, and fade after. */
function Keys({ keys, frame, at, label }: { keys: string[]; frame: number; at: number; label?: string }) {
  const { fps } = useVideoConfig();
  const appear = spring({ frame: frame - (at - 22), fps, config: { damping: 14, stiffness: 160 } });
  const visible = interpolate(frame, [at - 22, at - 14, at + 30, at + 44], [0, 1, 1, 0], clamp);
  const press = interpolate(frame, [at - 3, at, at + 6], [0, 1, 0], clamp);
  if (visible <= 0) return null;
  return (
    <div
      className="absolute left-1/2 top-[260px] flex -translate-x-1/2 items-center gap-2 rounded-2xl bg-black/60 px-6 py-5 backdrop-blur-sm"
      style={{ opacity: visible, scale: interpolate(appear, [0, 1], [0.7, 1]), zIndex: 215 }}
    >
      {keys.map((key, index) => (
        <div key={key} className="flex items-center gap-2">
          {index > 0 && <span className="text-2xl font-bold text-zinc-300">+</span>}
          <span
            className="grid h-14 min-w-14 place-items-center rounded-lg border-2 border-zinc-400 bg-zinc-800 px-3 font-mono text-xl font-bold text-zinc-50 shadow-[0_6px_0_#27272a,0_10px_24px_rgba(0,0,0,.6)]"
            style={{ translate: `0 ${press * 5}px`, boxShadow: press > 0.5 ? "0 1px 0 #27272a,0 4px 14px rgba(0,0,0,.6)" : undefined }}
          >
            {key}
          </span>
        </div>
      ))}
      {label && <span className="ml-2 text-lg font-semibold text-zinc-200 drop-shadow">{label}</span>}
    </div>
  );
}
