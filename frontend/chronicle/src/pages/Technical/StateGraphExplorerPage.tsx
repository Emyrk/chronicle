import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Box,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardPaste,
  Copy,
  Folder,
  FolderTree,
  Link2,
  LocateFixed,
  Maximize2,
  Network,
  RotateCcw,
  Upload,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import targetJSON from "../../../../../docs/logparse-snapshots/catalog/target.json";
import { Card } from "@/components/ui/Card/Card";
import {
  BOX_HEIGHT,
  BOX_WIDTH,
  baseName,
  boxedOwner,
  coerceStateGraph,
  indexStateGraph,
  isWithin,
  layoutStateGraph,
  metadataOf,
  parentPath,
  parseStateGraph,
  shortType,
  validateStateGraph,
  type GraphIndex,
  type GraphLayout,
  type ParseResult,
  type StateGraphIssue,
  type StateGraphKind,
} from "./stateGraph";

const DEFAULT_SOURCE = "docs/logparse-snapshots/catalog/target.json";
const SOURCE_URL_BASE = "https://github.com/Emyrk/chronicle/blob/main/";

// Accent per top-level group under the root (shared, encounters, instances, ...).
const GROUP_ACCENTS = [
  { fill: "fill-sky-400", text: "text-sky-400", bg: "bg-sky-400" },
  { fill: "fill-amber-400", text: "text-amber-400", bg: "bg-amber-400" },
  { fill: "fill-emerald-400", text: "text-emerald-400", bg: "bg-emerald-400" },
  { fill: "fill-violet-400", text: "text-violet-400", bg: "bg-violet-400" },
  { fill: "fill-rose-400", text: "text-rose-400", bg: "bg-rose-400" },
] as const;

interface Payload {
  label: string;
  result: ParseResult;
}

const defaultPayload = (): Payload => ({ label: DEFAULT_SOURCE, result: coerceStateGraph(targetJSON) });

export function StateGraphExplorerPage() {
  const [payload, setPayload] = useState<Payload>(defaultPayload);
  const [center, setCenterState] = useState<CenterPane>(() => loadLayout().center);
  const setCenter = (next: CenterPane) => {
    setCenterState(next);
    saveLayout({ center: next });
  };
  const [searchParams, setSearchParams] = useSearchParams();
  const selected = searchParams.get("path") ?? undefined;

  const graph = payload.result.graph;
  const index = useMemo(() => (graph ? indexStateGraph(graph) : undefined), [graph]);
  const layout = useMemo(() => (index ? layoutStateGraph(index) : undefined), [index]);
  const issues = useMemo(
    () => [...payload.result.issues, ...(graph ? validateStateGraph(graph) : [])],
    [payload, graph],
  );

  const select = (path?: string) => {
    const next = new URLSearchParams(searchParams);
    if (path) next.set("path", path);
    else next.delete("path");
    setSearchParams(next, { replace: true });
  };

  const load = (label: string, result: ParseResult) => {
    setPayload({ label, result });
    select(undefined);
  };

  return (
    <div className="container mx-auto max-w-[1600px] px-4 py-4">
      <Link to="/technical" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3" />
        Back to Technical Details
      </Link>

      <div className="mb-1 flex items-center gap-2">
        <Network className="h-5 w-5" />
        <h1 className="text-xl font-bold">Parser State Graph</h1>
      </div>
      <p className="mb-4 max-w-3xl text-sm text-muted-foreground">
        Explore a <code className="font-mono text-xs">stategraph</code> payload: the path tree of parser state, the references that alias
        shared values, and the dependency edges a snapshot restore must honor. Defaults to the committed target catalog; paste or
        upload any version 1 payload to inspect it.
      </p>

      <PayloadBar payload={payload} onLoad={load} />

      {!index || !layout ? (
        <Card className="p-4">
          <IssueList issues={issues} onSelect={select} />
        </Card>
      ) : (
        <ResizableColumns
          center={center}
          onCenterChange={setCenter}
          tree={<PathTree index={index} selected={selected} onSelect={select} />}
          graph={<GraphCanvas index={index} layout={layout} selected={selected} onSelect={select} fill={center === "graph"} />}
          inspector={<Inspector index={index} issues={issues} selected={selected} onSelect={select} />}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Resizable three-pane layout. The center pane flexes; the side panes have
// draggable widths. Either the tree or the graph can take the center.

type CenterPane = "graph" | "tree";

interface LayoutPrefs {
  center: CenterPane;
  left: number;
  right: number;
}

const LAYOUT_KEY = "chronicle.stateGraphExplorer.layout";
const DEFAULT_LAYOUT: LayoutPrefs = { center: "graph", left: 288, right: 320 };
const MIN_SIDE = 200;
const MAX_SIDE = 900;

// Kept outside components: try/catch inside React Compiler memos goes stale.
function loadLayout(): LayoutPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? "{}") as Partial<LayoutPrefs>;
    return {
      center: raw.center === "tree" ? "tree" : "graph",
      left: clampSide(raw.left ?? DEFAULT_LAYOUT.left),
      right: clampSide(raw.right ?? DEFAULT_LAYOUT.right),
    };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

function saveLayout(patch: Partial<LayoutPrefs>) {
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify({ ...loadLayout(), ...patch }));
  } catch {
    // Per-viewer convenience only.
  }
}

function clampSide(width: number) {
  return Number.isFinite(width) ? Math.max(MIN_SIDE, Math.min(MAX_SIDE, Math.round(width))) : MIN_SIDE;
}

function ResizableColumns({ center, onCenterChange, tree, graph, inspector }: {
  center: CenterPane;
  onCenterChange: (center: CenterPane) => void;
  tree: React.ReactNode;
  graph: React.ReactNode;
  inspector: React.ReactNode;
}) {
  const [widths, setWidths] = useState(() => {
    const { left, right } = loadLayout();
    return { left, right };
  });

  const startDrag = (side: "left" | "right", event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startWidth = widths[side];
    let latest = startWidth;
    const onMove = (move: PointerEvent) => {
      const delta = move.clientX - startX;
      latest = clampSide(side === "left" ? startWidth + delta : startWidth - delta);
      setWidths((current) => ({ ...current, [side]: latest }));
    };
    const onUp = () => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
      saveLayout({ [side]: latest });
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
  };

  const reset = (side: "left" | "right") => {
    setWidths((current) => ({ ...current, [side]: DEFAULT_LAYOUT[side] }));
    saveLayout({ [side]: DEFAULT_LAYOUT[side] });
  };

  const side = center === "graph" ? tree : graph;
  const main = center === "graph" ? graph : tree;

  return (
    <div>
      <div className="mb-2 flex items-center justify-end gap-2 text-xs">
        <span className="text-muted-foreground">Center pane</span>
        <div className="inline-flex rounded-md border border-input p-0.5">
          {(["graph", "tree"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onCenterChange(option)}
              className={`inline-flex items-center gap-1 rounded px-2 py-1 ${center === option ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {option === "graph" ? <Network className="h-3 w-3" /> : <FolderTree className="h-3 w-3" />}
              {option === "graph" ? "Graph" : "Path tree"}
            </button>
          ))}
        </div>
      </div>
      <div
        className="flex flex-col gap-4 xl:grid xl:gap-0"
        style={{ gridTemplateColumns: `${widths.left}px 12px minmax(0,1fr) 12px ${widths.right}px` }}
      >
        <Card className="min-w-0 p-0">{side}</Card>
        <ResizeHandle onPointerDown={(event) => startDrag("left", event)} onReset={() => reset("left")} />
        <Card className="min-w-0 p-0">{main}</Card>
        <ResizeHandle onPointerDown={(event) => startDrag("right", event)} onReset={() => reset("right")} />
        <Card className="min-w-0 p-0">{inspector}</Card>
      </div>
    </div>
  );
}

function ResizeHandle({ onPointerDown, onReset }: { onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void; onReset: () => void }) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      title="Drag to resize, double-click to reset"
      onPointerDown={onPointerDown}
      onDoubleClick={onReset}
      className="group hidden cursor-col-resize touch-none items-stretch justify-center xl:flex"
    >
      <div className="w-px bg-border transition-colors group-hover:w-0.5 group-hover:bg-primary group-active:bg-primary" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Payload loading

function PayloadBar({ payload, onLoad }: { payload: Payload; onLoad: (label: string, result: ParseResult) => void }) {
  const [pasteOpen, setPasteOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const graph = payload.result.graph;

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    onLoad(file.name, parseStateGraph(await file.text()));
  };

  const copy = async () => {
    if (!graph) return;
    await navigator.clipboard.writeText(JSON.stringify(graph, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const button = "inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-muted disabled:opacity-50";

  return (
    <Card className="mb-4 p-0">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Payload</div>
          <div className="truncate font-mono text-sm">{payload.label}</div>
        </div>
        {graph && <GraphStats index={indexStateGraph(graph)} />}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={button} onClick={() => setPasteOpen(!pasteOpen)}>
            <ClipboardPaste className="h-3.5 w-3.5" /> Paste JSON
          </button>
          <button type="button" className={button} onClick={() => fileInput.current?.click()}>
            <Upload className="h-3.5 w-3.5" /> Upload
          </button>
          <button type="button" className={button} onClick={() => onLoad(DEFAULT_SOURCE, coerceStateGraph(targetJSON))}>
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </button>
          <button type="button" className={button} onClick={copy} disabled={!graph}>
            <Copy className="h-3.5 w-3.5" /> {copied ? "Copied" : "Copy"}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => {
              void onFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </div>
      </div>
      {pasteOpen && (
        <div className="border-t border-border/70 px-4 py-3">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder='{"version": 1, "root": "/root", "nodes": [...], "dependencies": [...]}'
            spellCheck={false}
            className="styled-scrollbar h-48 w-full rounded-md border border-input bg-background p-2 font-mono text-xs"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className={button}
              disabled={draft.trim() === ""}
              onClick={() => {
                onLoad("pasted payload", parseStateGraph(draft));
                setPasteOpen(false);
              }}
            >
              <Network className="h-3.5 w-3.5" /> Visualize
            </button>
            <button type="button" className={button} onClick={() => setPasteOpen(false)}>Cancel</button>
          </div>
        </div>
      )}
    </Card>
  );
}

function GraphStats({ index }: { index: GraphIndex }) {
  const count = (kind: StateGraphKind) => index.graph.nodes.filter((node) => node.kind === kind).length;
  const stats: [string, number][] = [
    ["values", count("value")],
    ["references", count("reference")],
    ["directories", count("directory")],
    ["dependencies", index.graph.dependencies?.length ?? 0],
  ];
  return (
    <div className="flex gap-4 text-xs">
      {stats.map(([label, value]) => (
        <div key={label}>
          <div className="font-mono text-sm tabular-nums">{value}</div>
          <div className="text-muted-foreground">{label}</div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Path tree

function PathTree({ index, selected, onSelect }: { index: GraphIndex; selected?: string; onSelect: (p: string) => void }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const root = index.graph.root;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return undefined;
    const keep = new Set<string>();
    for (const node of index.graph.nodes) {
      const haystack = `${node.path} ${node.type ?? ""} ${metadataOf(node).label ?? ""}`.toLowerCase();
      if (!haystack.includes(q)) continue;
      for (let p = node.path; ; p = parentPath(p)) {
        keep.add(p);
        if (p === root || p === "/") break;
      }
    }
    return keep;
  }, [index, query, root]);

  const toggle = (p: string) => {
    const next = new Set(collapsed);
    if (next.has(p)) next.delete(p);
    else next.add(p);
    setCollapsed(next);
  };

  const rows: React.ReactNode[] = [];
  const walk = (p: string, depth: number) => {
    if (visible && !visible.has(p)) return;
    const node = index.byPath.get(p);
    const children = index.children.get(p) ?? [];
    const open = visible !== undefined || !collapsed.has(p);
    rows.push(
      <TreeRow
        key={p}
        path={p}
        depth={depth}
        kind={node?.kind}
        type={node?.type}
        target={node?.target}
        hasChildren={children.length > 0}
        open={open}
        selected={p === selected}
        onToggle={() => toggle(p)}
        onSelect={() => onSelect(p)}
      />,
    );
    if (open) for (const child of children) walk(child, depth + 1);
  };
  walk(root, 0);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border/70 px-3 py-2">
        <div className="mb-2 text-sm font-semibold">Path tree</div>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter paths, types, labels"
          className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
        />
      </div>
      <div className="styled-scrollbar max-h-[36rem] overflow-auto py-1 xl:max-h-[calc(100vh-16rem)]">
        {rows.length > 0 ? rows : <div className="px-3 py-2 text-xs text-muted-foreground">No matches</div>}
      </div>
    </div>
  );
}

function TreeRow(props: {
  path: string;
  depth: number;
  kind?: StateGraphKind;
  type?: string;
  target?: string;
  hasChildren: boolean;
  open: boolean;
  selected: boolean;
  onToggle: () => void;
  onSelect: () => void;
}) {
  const { path, depth, kind, type, target, hasChildren, open, selected, onToggle, onSelect } = props;
  return (
    <div
      className={`group flex cursor-pointer items-center gap-1 py-0.5 pr-2 text-xs ${selected ? "bg-primary/15 text-foreground" : "hover:bg-muted/60"}`}
      style={{ paddingLeft: `${depth * 14 + 6}px` }}
      onClick={onSelect}
      title={path}
    >
      <button
        type="button"
        className={`flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground ${hasChildren ? "" : "invisible"}`}
        onClick={(event) => {
          event.stopPropagation();
          onToggle();
        }}
        aria-label={open ? "Collapse" : "Expand"}
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      </button>
      <KindIcon kind={kind} />
      <span className="shrink-0 font-mono">{baseName(path)}</span>
      {kind === "reference" && target ? (
        <span className="ml-auto min-w-0 truncate pl-3 font-mono text-[10px] text-muted-foreground" title={`${target}\n${type ?? ""}`}>→ {target}</span>
      ) : type ? (
        <span className="ml-auto min-w-0 truncate pl-3 font-mono text-[10px] text-muted-foreground" title={type}>{shortType(type)}</span>
      ) : null}
    </div>
  );
}

function KindIcon({ kind, className = "h-3.5 w-3.5 shrink-0" }: { kind?: StateGraphKind; className?: string }) {
  switch (kind) {
    case "directory":
      return <Folder className={`${className} text-muted-foreground`} />;
    case "value":
      return <Box className={`${className} text-primary`} />;
    case "reference":
      return <Link2 className={`${className} text-amber-400`} />;
    default:
      return <AlertTriangle className={`${className} text-destructive`} />;
  }
}

// ---------------------------------------------------------------------------
// Graph canvas

function GraphCanvas({ index, layout, selected, onSelect, fill }: {
  index: GraphIndex;
  layout: GraphLayout;
  selected?: string;
  onSelect: (p?: string) => void;
  /** In the center pane, keep text legible by scrolling instead of shrinking too far. */
  fill: boolean;
}) {
  const root = index.graph.root;
  const boxed = useMemo(() => new Set(layout.boxes.map((box) => box.path)), [layout]);
  const groups = useMemo(() => [...new Set(layout.boxes.map((box) => groupOf(box.path, root)))].sort(), [layout, root]);
  const accent = (p: string) => GROUP_ACCENTS[groups.indexOf(groupOf(p, root)) % GROUP_ACCENTS.length];
  const boxAt = useMemo(() => new Map(layout.boxes.map((box) => [box.path, box])), [layout]);

  // What to emphasize for the current selection.
  const focus = useMemo(() => {
    if (!selected || !index.byPath.has(selected)) return undefined;
    const node = index.byPath.get(selected)!;
    const boxes = new Set<string>();
    const edges = new Set<string>();
    if (boxed.has(selected)) {
      boxes.add(selected);
      for (const edge of layout.edges) {
        if (edge.from === selected || edge.to === selected) {
          boxes.add(edge.from);
          boxes.add(edge.to);
          edges.add(edgeKey(edge.from, edge.to));
        }
      }
    } else if (node.kind === "reference" && node.target) {
      const owner = boxedOwner(selected, boxed, root);
      if (owner) boxes.add(owner);
      boxes.add(node.target);
      if (owner) edges.add(edgeKey(owner, node.target));
    } else {
      for (const box of layout.boxes) if (isWithin(box.path, selected)) boxes.add(box.path);
      // Directories of aliases (e.g. State.Instances) focus on what they point at.
      for (const node of index.graph.nodes) {
        if (node.kind !== "reference" || !node.target || !isWithin(node.path, selected)) continue;
        const owner = boxedOwner(node.path, boxed, root);
        if (owner) boxes.add(owner);
        if (boxed.has(node.target)) boxes.add(node.target);
      }
      for (const edge of layout.edges) if (boxes.has(edge.from) && boxes.has(edge.to)) edges.add(edgeKey(edge.from, edge.to));
    }
    return { boxes, edges };
  }, [selected, index, boxed, layout, root]);

  // Spread edge endpoints along box edges so parallel edges don't overlap.
  const anchors = useMemo(() => {
    const outgoing = new Map<string, string[]>();
    const incoming = new Map<string, string[]>();
    const xOf = (p: string) => boxAt.get(p)?.x ?? 0;
    for (const edge of layout.edges) {
      outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge.to]);
      incoming.set(edge.to, [...(incoming.get(edge.to) ?? []), edge.from]);
    }
    const spread = (list: string[], p: string) => {
      list.sort((a, b) => xOf(a) - xOf(b));
      const step = Math.min(18, (BOX_WIDTH - 24) / Math.max(1, list.length));
      return new Map(list.map((other, i) => [other, (boxAt.get(p)?.x ?? 0) + BOX_WIDTH / 2 + (i - (list.length - 1) / 2) * step]));
    };
    const out = new Map([...outgoing].map(([p, list]) => [p, spread(list, p)]));
    const inc = new Map([...incoming].map(([p, list]) => [p, spread(list, p)]));
    return { out, inc };
  }, [layout, boxAt]);

  // Zoom/pan works on the SVG viewBox. With auto-focus on, each selection
  // frames the selected node and everything it relates to; manual zooming
  // overrides that until the selection changes.
  const [autoFocus, setAutoFocus] = useState(true);
  const fullView: View = { x: 0, y: 0, w: layout.width, h: layout.height };
  const focusView = focus && focus.boxes.size > 0 ? frameBoxes([...focus.boxes].map((p) => boxAt.get(p)!).filter(Boolean)) : undefined;
  const autoView = autoFocus && focusView ? focusView : fullView;
  const viewKey = `${selected ?? ""}|${autoFocus}|${layout.width}x${layout.height}`;
  const [manual, setManual] = useState<{ key: string; view: View }>();
  const view = manual?.key === viewKey ? manual.view : autoView;

  const svgRef = useRef<SVGSVGElement>(null);
  const latest = useRef({ view, viewKey, fullView });
  useEffect(() => {
    latest.current = { view, viewKey, fullView };
  });

  const zoomAt = (factor: number, cx?: number, cy?: number) => {
    const { view: v, viewKey: key, fullView: full } = latest.current;
    setManual({ key, view: zoomView(v, factor, cx ?? v.x + v.w / 2, cy ?? v.y + v.h / 2, full) });
  };

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const point = toGraphPoint(svg, event.clientX, event.clientY);
      const { view: v, viewKey: key, fullView: full } = latest.current;
      setManual({ key, view: zoomView(v, Math.exp(event.deltaY * 0.0015), point.x, point.y, full) });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  const dragged = useRef(false);
  const startPan = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    const svg = event.currentTarget;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    dragged.current = false;
    const startX = event.clientX;
    const startY = event.clientY;
    const { view: start, viewKey: key } = latest.current;
    const onMove = (move: PointerEvent) => {
      const dx = move.clientX - startX;
      const dy = move.clientY - startY;
      if (!dragged.current && Math.hypot(dx, dy) < 4) return;
      if (!dragged.current) svg.setPointerCapture(event.pointerId);
      dragged.current = true;
      setManual({ key, view: { ...start, x: start.x - dx / ctm.a, y: start.y - dy / ctm.d } });
    };
    const onUp = () => {
      svg.removeEventListener("pointermove", onMove);
      svg.removeEventListener("pointerup", onUp);
      svg.removeEventListener("pointercancel", onUp);
    };
    svg.addEventListener("pointermove", onMove);
    svg.addEventListener("pointerup", onUp);
    svg.addEventListener("pointercancel", onUp);
  };

  const zoomButton = "flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40";

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border/70 px-3 py-2">
        <div className="text-sm font-semibold">Canonical values</div>
        <Legend />
      </div>
      <div className={`relative ${fill ? "h-[34rem]" : "h-[24rem]"}`}>
        <div className="absolute right-2 top-2 z-10 flex items-center gap-0.5 rounded-md border border-border/70 bg-card/90 p-0.5 shadow-sm">
          <button type="button" className={zoomButton} title="Zoom in" onClick={() => zoomAt(1 / 1.25)}><ZoomIn className="h-3.5 w-3.5" /></button>
          <button type="button" className={zoomButton} title="Zoom out" onClick={() => zoomAt(1.25)}><ZoomOut className="h-3.5 w-3.5" /></button>
          <button type="button" className={zoomButton} title="Fit whole graph" onClick={() => setManual({ key: viewKey, view: fullView })}><Maximize2 className="h-3.5 w-3.5" /></button>
          <button
            type="button"
            className={`${zoomButton} ${autoFocus ? "bg-primary/15 text-primary" : ""}`}
            title={autoFocus ? "Auto-focus on selection: on" : "Auto-focus on selection: off"}
            aria-pressed={autoFocus}
            onClick={() => setAutoFocus(!autoFocus)}
          >
            <LocateFixed className="h-3.5 w-3.5" />
          </button>
        </div>
        <svg
          ref={svgRef}
          viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
          preserveAspectRatio="xMidYMid meet"
          className="block h-full w-full cursor-grab touch-none select-none active:cursor-grabbing"
          role="img"
          aria-label="State graph"
          onPointerDown={startPan}
          onClick={() => {
            if (!dragged.current) onSelect(undefined);
          }}
        >
          <defs>
            <marker id="sg-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" className="fill-muted-foreground" />
            </marker>
            <marker id="sg-arrow-active" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" className="fill-primary" />
            </marker>
          </defs>

          {layout.edges.map((edge) => {
            const from = boxAt.get(edge.from)!;
            const to = boxAt.get(edge.to)!;
            const x1 = anchors.out.get(edge.from)?.get(edge.to) ?? from.x + BOX_WIDTH / 2;
            const x2 = anchors.inc.get(edge.to)?.get(edge.from) ?? to.x + BOX_WIDTH / 2;
            const downward = to.y > from.y;
            const y1 = downward ? from.y + BOX_HEIGHT : from.y;
            const y2 = downward ? to.y : to.y + BOX_HEIGHT;
            const bend = Math.max(40, Math.abs(y2 - y1) / 2) * (downward ? 1 : -1);
            const active = focus?.edges.has(edgeKey(edge.from, edge.to)) ?? false;
            const dim = focus !== undefined && !active;
            const kinds = [edge.dependency ? "depends on" : "", edge.references.length ? `${edge.references.length} reference(s)` : ""].filter(Boolean).join(" + ");
            return (
              <path
                key={edgeKey(edge.from, edge.to)}
                d={`M ${x1} ${y1} C ${x1} ${y1 + bend}, ${x2} ${y2 - bend}, ${x2} ${y2}`}
                fill="none"
                strokeWidth={active ? 2 : edge.dependency && edge.references.length ? 1.6 : 1.2}
                strokeDasharray={edge.dependency ? undefined : "5 4"}
                markerEnd={`url(#${active ? "sg-arrow-active" : "sg-arrow"})`}
                className={`${active ? "stroke-primary" : "stroke-muted-foreground"} transition-opacity`}
                opacity={dim ? 0.15 : active ? 1 : 0.6}
              >
                <title>{`${edge.from} → ${edge.to}\n${kinds}${edge.references.length ? `\n${edge.references.join("\n")}` : ""}`}</title>
              </path>
            );
          })}

          {layout.boxes.map((box) => {
            const node = index.byPath.get(box.path);
            const meta = metadataOf(node);
            const isSelected = box.path === selected;
            const dim = focus !== undefined && !focus.boxes.has(box.path);
            const refCount = index.referencesTo.get(box.path)?.length ?? 0;
            const color = accent(box.path);
            return (
              <g
                key={box.path}
                transform={`translate(${box.x} ${box.y})`}
                className="cursor-pointer transition-opacity"
                opacity={dim ? 0.3 : 1}
                onClick={(event) => {
                  event.stopPropagation();
                  if (!dragged.current) onSelect(box.path);
                }}
              >
                <title>{`${box.path}\n${node?.type ?? node?.kind ?? ""}`}</title>
                <rect
                  width={BOX_WIDTH}
                  height={BOX_HEIGHT}
                  rx={8}
                  className={`fill-card ${isSelected ? "stroke-primary" : "stroke-border"}`}
                  strokeWidth={isSelected ? 2 : 1}
                />
                <rect x={0} y={0} width={4} height={BOX_HEIGHT} rx={2} className={color.fill} />
                <text x={14} y={22} className="fill-foreground font-mono text-[12px] font-semibold">
                  {truncate(node?.type ? shortType(node.type) : baseName(box.path), 23)}
                </text>
                <text x={14} y={40} className="fill-muted-foreground font-mono text-[10px]">
                  {truncate(box.path.replace(new RegExp(`^${escapeRegExp(root)}/`), ""), 27)}
                </text>
                {meta.label && meta.label !== shortType(node?.type) && (
                  <text x={14} y={52} className="fill-muted-foreground text-[9px]">{truncate(meta.label, 30)}</text>
                )}
                {refCount > 0 && (
                  <g transform={`translate(${BOX_WIDTH - 30} -7)`}>
                    <rect width={22} height={14} rx={7} className="fill-card stroke-amber-400/60" />
                    <text x={11} y={10.5} textAnchor="middle" className="fill-amber-400 font-mono text-[9px]">{refCount}</text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="flex flex-wrap gap-3 border-t border-border/70 px-3 py-2 text-[11px] text-muted-foreground">
        {groups.map((group) => (
          <span key={group} className="inline-flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-sm ${accent(`${root}/${group}`).bg}`} />
            <span className="font-mono">{group || "root"}</span>
          </span>
        ))}
        <span className="ml-auto">Badge = incoming references. Scroll to zoom, drag to pan, click empty space to clear.</span>
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <svg width="26" height="6"><line x1="0" y1="3" x2="26" y2="3" className="stroke-muted-foreground" strokeWidth="1.5" /></svg>
        depends on
      </span>
      <span className="inline-flex items-center gap-1.5">
        <svg width="26" height="6"><line x1="0" y1="3" x2="26" y2="3" className="stroke-muted-foreground" strokeWidth="1.5" strokeDasharray="5 4" /></svg>
        reference only
      </span>
      <span>Dependents sit above what they depend on.</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inspector

function Inspector({ index, issues, selected, onSelect }: {
  index: GraphIndex;
  issues: StateGraphIssue[];
  selected?: string;
  onSelect: (p?: string) => void;
}) {
  const node = selected ? index.byPath.get(selected) : undefined;
  if (!selected || !node) {
    return (
      <div className="p-4">
        <div className="mb-2 text-sm font-semibold">Overview</div>
        <p className="mb-4 text-xs text-muted-foreground">
          Select a node in the tree or graph. <span className="text-primary">Values</span> are canonical state,{" "}
          <span className="text-amber-400">references</span> alias a value by path, and directories only organize paths.
        </p>
        <IssueList issues={issues} onSelect={onSelect} />
      </div>
    );
  }

  const meta = metadataOf(node);
  const children = index.children.get(selected) ?? [];
  const referencedBy = index.referencesTo.get(selected) ?? [];
  const dependsOn = index.depsFrom.get(selected) ?? [];
  const requiredBy = index.depsTo.get(selected) ?? [];
  const nodeIssues = issues.filter((issue) => issue.path === selected);
  const hasExtraMetadata = node.metadata !== undefined && JSON.stringify(node.metadata) !== JSON.stringify({ label: meta.label, source: meta.source });

  return (
    <div className="styled-scrollbar max-h-[48rem] overflow-auto p-4 xl:max-h-[calc(100vh-12rem)]">
      <div className="mb-1 flex items-center gap-2">
        <KindIcon kind={node.kind} className="h-4 w-4 shrink-0" />
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{node.kind}</span>
        <button type="button" className="ml-auto text-xs text-muted-foreground hover:text-foreground" onClick={() => onSelect(undefined)}>
          Clear
        </button>
      </div>
      <div className="mb-3 break-all font-mono text-sm">{selected}</div>
      {meta.label && <div className="mb-3 text-sm">{meta.label}</div>}

      <dl className="mb-4 space-y-2 text-xs">
        {node.type && (
          <Field label={node.kind === "reference" ? "Expected type" : "Type"}>
            <span className="break-all font-mono">{node.type}</span>
          </Field>
        )}
        {node.target && (
          <Field label="Target">
            <PathButton path={node.target} index={index} onSelect={onSelect} />
          </Field>
        )}
        {meta.source && (
          <Field label="Source">
            <a href={`${SOURCE_URL_BASE}${meta.source}`} target="_blank" rel="noreferrer" className="break-all font-mono text-primary hover:underline">
              {meta.source}
            </a>
          </Field>
        )}
      </dl>

      {nodeIssues.length > 0 && <div className="mb-4"><IssueList issues={nodeIssues} onSelect={onSelect} /></div>}

      <PathSection title="Depends on" paths={dependsOn} index={index} onSelect={onSelect} />
      <PathSection title="Required by" paths={requiredBy} index={index} onSelect={onSelect} />
      <PathSection title="Referenced by" paths={referencedBy} index={index} onSelect={onSelect} />
      <PathSection title="Children" paths={children} index={index} onSelect={onSelect} />

      {hasExtraMetadata && (
        <div className="mt-4">
          <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Metadata</div>
          <pre className="styled-scrollbar overflow-auto rounded-md bg-muted/40 p-2 font-mono text-[11px]">{JSON.stringify(node.metadata, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

function PathSection({ title, paths, index, onSelect }: { title: string; paths: string[]; index: GraphIndex; onSelect: (p: string) => void }) {
  if (paths.length === 0) return null;
  return (
    <div className="mb-3">
      <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
        {title} <span className="tabular-nums">({paths.length})</span>
      </div>
      <ul className="space-y-0.5">
        {[...paths].sort().map((p) => (
          <li key={p}><PathButton path={p} index={index} onSelect={onSelect} /></li>
        ))}
      </ul>
    </div>
  );
}

function PathButton({ path, index, onSelect }: { path: string; index: GraphIndex; onSelect: (p: string) => void }) {
  const node = index.byPath.get(path);
  return (
    <button
      type="button"
      onClick={() => onSelect(path)}
      className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-xs hover:bg-muted/60"
      title={node?.type ?? path}
    >
      <KindIcon kind={node?.kind} />
      <span className="truncate font-mono">{path}</span>
      {node?.type && <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">{shortType(node.type)}</span>}
      <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
    </button>
  );
}

function IssueList({ issues, onSelect }: { issues: StateGraphIssue[]; onSelect: (p: string) => void }) {
  if (issues.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">
        <CheckCircle2 className="h-4 w-4" /> Payload passes stategraph validation
      </div>
    );
  }
  return (
    <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs">
      <div className="mb-1 flex items-center gap-2 font-medium text-destructive">
        <AlertTriangle className="h-4 w-4" /> {issues.length} validation issue{issues.length === 1 ? "" : "s"}
      </div>
      <ul className="space-y-1">
        {issues.map((issue, i) => (
          <li key={i}>
            {issue.path && (
              <button type="button" className="mr-1 font-mono text-foreground hover:underline" onClick={() => onSelect(issue.path!)}>
                {issue.path}
              </button>
            )}
            <span className="text-muted-foreground">{issue.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------

function groupOf(p: string, root: string): string {
  if (!isWithin(p, root) || p === root) return "";
  return p.slice(root === "/" ? 1 : root.length + 1).split("/")[0];
}

function edgeKey(from: string, to: string) {
  return `${from}\u0000${to}`;
}

function truncate(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface View {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Frame a set of boxes with padding, never zooming in past ~2.5 boxes wide. */
function frameBoxes(boxes: { x: number; y: number }[]): View {
  const pad = 36;
  const minX = Math.min(...boxes.map((box) => box.x)) - pad;
  const minY = Math.min(...boxes.map((box) => box.y)) - pad;
  const maxX = Math.max(...boxes.map((box) => box.x + BOX_WIDTH)) + pad;
  const maxY = Math.max(...boxes.map((box) => box.y + BOX_HEIGHT)) + pad;
  const w = Math.max(maxX - minX, BOX_WIDTH * 2.5);
  const h = Math.max(maxY - minY, BOX_HEIGHT * 3);
  return { x: (minX + maxX - w) / 2, y: (minY + maxY - h) / 2, w, h };
}

function zoomView(view: View, factor: number, cx: number, cy: number, full: View): View {
  const maxW = Math.max(full.w, full.h) * 3;
  const w = Math.max(BOX_WIDTH, Math.min(maxW, view.w * factor));
  const applied = w / view.w;
  const h = view.h * applied;
  return { x: cx - (cx - view.x) * applied, y: cy - (cy - view.y) * applied, w, h };
}

function toGraphPoint(svg: SVGSVGElement, clientX: number, clientY: number) {
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const point = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
  return { x: point.x, y: point.y };
}
