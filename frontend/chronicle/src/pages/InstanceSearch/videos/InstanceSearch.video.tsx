/**
 * Announcement: instance search.
 *
 * One search, start to finish. In the form: pick Molten Core from the zone
 * list, a 90+ kill-time parse on each of Ragnaros and Majordomo, and at least
 * two Holy Paladins. Search collapses the builder and lists the runs; the
 * chevron on a run shows why it matched, condition by condition with the
 * run's real numbers. Then the same search as blocks, adding a date range
 * through the searchable field picker, and as code, adding a druid who went
 * Bear on trash and Cat on bosses.
 * 970 frames @ 30fps, 1280x720.
 */
import type { ReactNode } from "react";
import { Blocks, Check, ChevronRight, ChevronsUpDown, Code2, ListFilter, Search, X } from "lucide-react";
import { interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { clamp, entranceEasing, INTRO_FRAMES } from "@/pages/Instance/PanelExplainer/videos/animation";
import { Cursor, LessonIntro, StepCaption, VideoStage } from "@/pages/Instance/PanelExplainer/videos/shared";

// Content-local frames (the content mounts at INTRO_FRAMES - 10).
const ZONE_CLICK = 40;
const ZONE_TYPE = 54;
const ZONE_PICK = 84;
const PARSE_CLICK = 108;
const BOSS_1 = 126;
const BOSS_2 = 142;
const EACH_CLICK = 160;
const ROSTER_CLICK = 182;
const SEARCH_CLICK = 222;
const CHEVRON_CLICK = 300;
const EDIT_CLICK = 452;
const BLOCKS_CLICK = 480;
const ADD_CLICK = 524;
const PICKER_TYPE = 536;
const PICKER_PICK = 566;
const DATES = 584;
const CODE_CLICK = 660;
const CODE_TYPE = 712;
const FINALE = 850;
const FADE = 12;

const ease = { ...clamp, easing: entranceEasing };

// Browser window, in stage pixels; everything below is window-local.
const WINDOW = { left: 112, top: 34, width: 1056, height: 520 };
const BAR = 30;
const TABS_Y = BAR + 74;
const CARD_Y = BAR + 108;

// Form layout.
const LABEL_X = 44;
const INPUT_X = LABEL_X + 124;
const ROWS = { zone: CARD_Y + 30, guild: CARD_Y + 62, date: CARD_Y + 94, parse: CARD_Y + 150, roster: CARD_Y + 206 };
const SECTIONS = { run: CARD_Y + 12, bosses: CARD_Y + 132, roster: CARD_Y + 188 };
const FORM_H = 290;
const ZONE_INPUT = { x: INPUT_X, y: ROWS.zone, w: 230 };
const SEARCH_BTN = { x: 44, y: CARD_Y + 246, w: 96 };

// Results layout.
const TABLE_Y = CARD_Y + 56;
const ROW_H = 40;
const EVIDENCE_H = 188;

// Blocks layout.
const BLOCK_X = 40;
const BLOCK_W = 976;

const RAIDS = [
  { name: "Molten Core", bosses: 10, swatch: "linear-gradient(135deg,#7c2d12,#f97316)" },
  { name: "Onyxia's Lair", bosses: 1, swatch: "linear-gradient(135deg,#134e4a,#2dd4bf)" },
  { name: "Blackwing Lair", bosses: 8, swatch: "linear-gradient(135deg,#3b0764,#a855f7)" },
  { name: "Naxxramas", bosses: 15, swatch: "linear-gradient(135deg,#0c4a6e,#7dd3fc)" },
];

const RUNS = [
  { guild: "Ember Pact", realm: "Nordanaar", clear: "58 min", date: "2 days ago" },
  { guild: "Sigma", realm: "Tel'Abim", clear: "1h 04m", date: "3 days ago" },
  { guild: "Ravenholdt", realm: "Nordanaar", clear: "1h 11m", date: "5 days ago" },
  { guild: "Nightfall", realm: "Ambershire", clear: "1h 13m", date: "1 week ago" },
  { guild: "Fury and Frost", realm: "Nordanaar", clear: "1h 19m", date: "1 week ago" },
];

export default function InstanceSearchVideo() {
  return (
    <VideoStage>
      <div className="absolute inset-0 bg-[#0d0b16]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_16%,rgba(56,189,248,0.16),transparent_42%),radial-gradient(circle_at_10%_90%,rgba(52,211,153,0.12),transparent_38%)]" />
      <Sequence from={INTRO_FRAMES - 10}>
        <Content />
      </Sequence>
      <LessonIntro
        title="Instance search"
        bullets={[
          "Find raids by zone, bosses, speed, parses and roster",
          <>See <strong>why</strong> each run matched, with its real numbers</>,
          "Build anything with blocks, or write it as code",
          "Date and number ranges, and pickers for zones, bosses and fields",
        ]}
      />
    </VideoStage>
  );
}

function pulse(frame: number, at: number) {
  return interpolate(frame, [at - 2, at + 2, at + 12], [0, 1, 0], clamp);
}

/** 0 → 1 over a short ramp starting at `at`. */
function on(frame: number, at: number, length = 10) {
  return interpolate(frame, [at, at + length], [0, 1], ease);
}

/** Visible between two frames, fading at both ends. */
function between(frame: number, from: number, to: number) {
  return interpolate(frame, [from, from + FADE, to - FADE, to], [0, 1, 1, 0], clamp);
}

/** The first characters of text typed from `at`, `perFrame` frames per character. */
function typed(text: string, frame: number, at: number, perFrame = 3) {
  return text.slice(0, Math.max(0, Math.floor((frame - at) / perFrame)));
}

function Content() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 28 });
  const finale = interpolate(frame, [FINALE, FINALE + 22], [0, 1], ease);

  const formVis = Math.max(between(frame, -FADE, SEARCH_CLICK + 8), between(frame, EDIT_CLICK, BLOCKS_CLICK + 6));
  const resultsVis = between(frame, SEARCH_CLICK + 4, EDIT_CLICK + 6);
  const blocksVis = between(frame, BLOCKS_CLICK, CODE_CLICK + 6);
  const codeVis = between(frame, CODE_CLICK, FINALE + 30);
  const mode = frame < BLOCKS_CLICK ? "form" : frame < CODE_CLICK ? "blocks" : "code";

  const zone = { x: ZONE_INPUT.x + 60, y: ZONE_INPUT.y + 13 };
  const raid0 = { x: ZONE_INPUT.x + 70, y: ZONE_INPUT.y + 50 };
  const parse = { x: INPUT_X + 28, y: ROWS.parse + 13 };
  const bosses = { x: INPUT_X + 200, y: ROWS.parse + 13 };
  const each = { x: INPUT_X + 418, y: ROWS.parse + 13 };
  const roster = { x: INPUT_X + 110, y: ROWS.roster + 13 };
  const searchBtn = { x: SEARCH_BTN.x + 48, y: SEARCH_BTN.y + 14 };
  const chevron = { x: 52, y: TABLE_Y + 26 + ROW_H / 2 };
  const evidence = { x: 420, y: TABLE_Y + 26 + ROW_H + 120 };
  const edit = { x: 958, y: CARD_Y + 22 };
  const blocksTab = { x: 128, y: TABS_Y + 12 };
  const add = { x: BLOCK_X + 46, y: blockAddY(true) + 12 };
  const picker = { x: BLOCK_X + 140, y: dateBlockY() + 18 };
  const pickOption = { x: BLOCK_X + 150, y: dateBlockY() + 84 };
  const codeTab = { x: 200, y: TABS_Y + 12 };
  const path: [number, { x: number; y: number }][] = [
    [16, { x: 600, y: 300 }],
    [ZONE_CLICK - 8, zone],
    [ZONE_PICK - 10, raid0],
    [ZONE_PICK + 4, raid0],
    [PARSE_CLICK - 6, parse],
    [BOSS_1 - 4, bosses],
    [EACH_CLICK - 6, each],
    [EACH_CLICK + 6, each],
    [ROSTER_CLICK - 6, roster],
    [ROSTER_CLICK + 14, roster],
    [SEARCH_CLICK - 8, searchBtn],
    [SEARCH_CLICK + 12, searchBtn],
    [CHEVRON_CLICK - 10, chevron],
    [CHEVRON_CLICK + 10, chevron],
    [CHEVRON_CLICK + 60, evidence],
    [EDIT_CLICK - 10, edit],
    [EDIT_CLICK + 6, edit],
    [BLOCKS_CLICK - 8, blocksTab],
    [BLOCKS_CLICK + 10, blocksTab],
    [ADD_CLICK - 8, add],
    [ADD_CLICK + 6, add],
    [PICKER_TYPE - 4, picker],
    [PICKER_PICK - 8, pickOption],
    [PICKER_PICK + 8, pickOption],
    [CODE_CLICK - 10, codeTab],
    [CODE_CLICK + 10, codeTab],
    [CODE_TYPE + 20, { x: 700, y: CARD_Y + 220 }],
  ];
  const frames = path.map(([at]) => at);
  const cursorX = interpolate(frame, frames, path.map(([, p]) => p.x), ease);
  const cursorY = interpolate(frame, frames, path.map(([, p]) => p.y), ease);
  const clicking = Math.max(
    ...[ZONE_CLICK, ZONE_PICK, PARSE_CLICK, EACH_CLICK, ROSTER_CLICK, SEARCH_CLICK, CHEVRON_CLICK, EDIT_CLICK, BLOCKS_CLICK, ADD_CLICK, PICKER_PICK, CODE_CLICK].map((at) => pulse(frame, at)),
  );
  const cursorOpacity = interpolate(frame, [10, 22, CODE_TYPE + 30, CODE_TYPE + 44], [0, 1, 1, 0], clamp);

  return (
    <>
      <div
        className="absolute overflow-hidden rounded-xl border border-white/10 bg-background shadow-[0_30px_80px_rgba(0,0,0,0.6)]"
        style={{ ...WINDOW, opacity: entrance * (1 - finale), translate: `0 ${interpolate(entrance, [0, 1], [24, 0]) - finale * 20}px` }}
      >
        <PageHeader frame={frame} />
        <ModeTabs mode={mode} opacity={Math.max(formVis, blocksVis, codeVis)} />
        {formVis > 0 && <FormScene frame={frame} opacity={formVis} />}
        {resultsVis > 0 && <ResultsScene frame={frame} opacity={resultsVis} />}
        {blocksVis > 0 && <BlocksScene frame={frame} opacity={blocksVis} />}
        {codeVis > 0 && <CodeScene frame={frame} opacity={codeVis} />}
        <BrowserBar url="chronicleclassic.com/search" />
        <div style={{ opacity: cursorOpacity }}>
          <Cursor x={cursorX} y={cursorY} clicking={clicking} />
        </div>
      </div>
      <Captions frame={frame} />
      {frame >= FINALE && <Finale progress={finale} />}
    </>
  );
}

function BrowserBar({ url }: { url: string }) {
  return (
    <div className="absolute inset-x-0 top-0 flex items-center gap-2 border-b border-white/10 bg-[#16131f] px-3" style={{ height: BAR }}>
      <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
      <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
      <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
      <span className="ml-3 rounded bg-white/5 px-3 py-0.5 font-mono text-[11px] text-slate-400">{url}</span>
    </div>
  );
}

function PageHeader({ frame }: { frame: number }) {
  // The budget dips when the search runs, then a little for the explain.
  const remaining = frame < SEARCH_CLICK + 10 ? 300 : frame < CHEVRON_CLICK + 8 ? 286 : 283;
  return (
    <>
      <div className="absolute" style={{ left: 24, top: BAR + 14 }}>
        <p className="flex items-center gap-2 text-[22px] font-bold">
          <Search className="h-5 w-5 text-sky-400" />
          Instance search
        </p>
        <p className="text-[12px] text-muted-foreground">Find raids by zone, bosses, speed, parses, roster and more.</p>
      </div>
      <div className="absolute flex items-center gap-2 text-[11px] text-muted-foreground" style={{ right: 24, top: BAR + 34 }}>
        <span>Search budget</span>
        <span className="relative h-1.5 w-24 overflow-hidden rounded-full bg-white/10">
          <span className="absolute inset-y-0 left-0 rounded-full bg-sky-400/70" style={{ width: `${(remaining / 300) * 100}%` }} />
        </span>
        <span className="font-mono">{remaining}/300</span>
      </div>
    </>
  );
}

function ModeTabs({ mode, opacity }: { mode: "form" | "blocks" | "code"; opacity: number }) {
  const tabs = [
    { id: "form", label: "Form", icon: <ListFilter className="h-3.5 w-3.5" /> },
    { id: "blocks", label: "Blocks", icon: <Blocks className="h-3.5 w-3.5" /> },
    { id: "code", label: "Code", icon: <Code2 className="h-3.5 w-3.5" /> },
  ] as const;
  return (
    <div className="absolute flex items-center gap-0.5 rounded-md bg-white/5 p-0.5" style={{ left: 24, top: TABS_Y, opacity }}>
      {tabs.map((t) => (
        <span
          key={t.id}
          className={`flex items-center gap-1.5 rounded px-3 py-1 text-[12px] ${t.id === mode ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
        >
          {t.icon}
          {t.label}
        </span>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Form                                                                */
/* ------------------------------------------------------------------ */

function FormScene({ frame, opacity }: { frame: number; opacity: number }) {
  const zoneText = frame < ZONE_TYPE ? "" : frame < ZONE_PICK ? typed("molt", frame, ZONE_TYPE, 4) : "Molten Core";
  const dropdown = between(frame, ZONE_CLICK + 2, ZONE_PICK + 6);
  const filtered = frame >= ZONE_TYPE + 8;
  const parseValue = frame >= PARSE_CLICK + 6 ? "90" : "";
  const parseBosses = [frame >= BOSS_1 ? "Ragnaros" : null, frame >= BOSS_2 ? "Majordomo Executus" : null].filter(Boolean) as string[];
  const isEach = frame >= EACH_CLICK;
  const roster = on(frame, ROSTER_CLICK, 8);
  return (
    <div className="absolute inset-0" style={{ opacity }}>
      <div className="absolute rounded-lg border border-white/10 bg-white/[0.02]" style={{ left: 24, top: CARD_Y, width: 1008, height: FORM_H }} />
      <Section label="Run" y={SECTIONS.run} />
      <FormRow y={ROWS.zone} label="Zone">
        <InputBox w={ZONE_INPUT.w} focused={dropdown > 0.5} placeholder="e.g. Molten Core" value={zoneText} />
        <Pills options={["contains", "exact"]} selected="contains" />
      </FormRow>
      <FormRow y={ROWS.guild} label="Guild">
        <InputBox w={230} placeholder="Guild the run is attributed to" value="" />
      </FormRow>
      <FormRow y={ROWS.date} label="Date">
        <InputBox w={140} placeholder="mm/dd/yyyy" value="" />
        <span className="text-[11px] text-muted-foreground">to</span>
        <InputBox w={140} placeholder="mm/dd/yyyy" value="" />
      </FormRow>
      <Section label="Bosses & speed" y={SECTIONS.bosses} />
      <FormRow y={ROWS.parse} label="Kill parse ≥">
        <InputBox w={56} placeholder="0-100" value={parseValue} focused={frame >= PARSE_CLICK && frame < BOSS_1} />
        <span className="text-[11px] text-muted-foreground">on</span>
        <ChipBox w={300} chips={parseBosses} placeholder="any boss" />
        <Pills options={["any", "each"]} selected={isEach ? "each" : "any"} />
      </FormRow>
      <Section label="Roster" y={SECTIONS.roster} />
      <FormRow y={ROWS.roster} label="At least">
        <InputBox w={44} placeholder="" value={roster > 0.5 ? "2" : ""} />
        <span
          className="flex h-[26px] items-center gap-1.5 rounded-md border border-white/15 bg-background px-2 text-[12px]"
          style={{ opacity: interpolate(roster, [0, 1], [0.5, 1]) }}
        >
          <span className="h-3.5 w-3.5 rounded-sm" style={{ background: "#f58cba" }} />
          {roster > 0.5 ? <span style={{ color: "#f58cba" }}>Holy Paladin</span> : <span className="text-muted-foreground">Any class</span>}
          <ChevronsUpDown className="h-3 w-3 text-muted-foreground" />
        </span>
      </FormRow>
      <div
        className="absolute flex items-center gap-1.5 rounded-md bg-sky-600 px-3 text-[13px] font-medium text-white"
        style={{ left: SEARCH_BTN.x, top: SEARCH_BTN.y, height: 28, width: SEARCH_BTN.w, scale: String(1 - pulse(frame, SEARCH_CLICK) * 0.04) }}
      >
        <Search className="h-3.5 w-3.5" /> Search
      </div>
      {dropdown > 0 && <ZoneDropdown opacity={dropdown} filtered={filtered} highlight={filtered ? 0 : -1} />}
    </div>
  );
}

function Section({ label, y }: { label: string; y: number }) {
  return (
    <p className="absolute text-[10px] font-semibold uppercase tracking-wider text-muted-foreground" style={{ left: LABEL_X, top: y }}>
      {label}
    </p>
  );
}

function FormRow({ y, label, children }: { y: number; label: string; children: ReactNode }) {
  return (
    <div className="absolute flex items-center gap-2" style={{ left: LABEL_X, top: y }}>
      <span className="w-[116px] text-[12px] text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function InputBox({ w, value, placeholder, focused }: { w: number; value: string; placeholder: string; focused?: boolean }) {
  return (
    <span
      className={`flex h-[26px] items-center rounded-md border bg-background px-2.5 text-[12px] ${focused ? "border-sky-500/70 ring-2 ring-sky-500/20" : "border-white/15"}`}
      style={{ width: w }}
    >
      {value ? <span>{value}</span> : <span className="text-muted-foreground">{placeholder}</span>}
      {focused && <span className="ml-px h-3.5 w-px bg-foreground" />}
    </span>
  );
}

function ChipBox({ w, chips, placeholder }: { w: number; chips: string[]; placeholder: string }) {
  return (
    <span className="flex h-[26px] items-center gap-1 rounded-md border border-white/15 bg-background px-1.5 text-[12px]" style={{ width: w }}>
      {chips.length === 0 && <span className="px-1 text-muted-foreground">{placeholder}</span>}
      {chips.map((c) => (
        <span key={c} className="flex items-center gap-1 rounded bg-zinc-700/60 px-1.5 py-px text-[10px] text-zinc-200">
          {c}
          <X className="h-2.5 w-2.5 text-zinc-400" />
        </span>
      ))}
    </span>
  );
}

function Pills({ options, selected }: { options: string[]; selected: string }) {
  return (
    <span className="flex gap-0.5">
      {options.map((o) => (
        <span key={o} className={`rounded px-2 py-0.5 text-[10px] ${o === selected ? "bg-white/10 text-foreground" : "text-muted-foreground"}`}>
          {o}
        </span>
      ))}
    </span>
  );
}

/** The zone combobox list: supported instances with art and boss counts. */
function ZoneDropdown({ opacity, filtered, highlight }: { opacity: number; filtered: boolean; highlight: number }) {
  const raids = filtered ? RAIDS.filter((r) => r.name.startsWith("Molt")) : RAIDS;
  return (
    <div
      className="absolute z-40 rounded-md border bg-[#17151f] p-1 shadow-xl"
      style={{ left: INPUT_X, top: ROWS.zone + 30, width: 250, opacity, translate: `0 ${interpolate(opacity, [0, 1], [-4, 0])}px` }}
    >
      <p className="px-2 pb-0.5 pt-1 text-[9px] font-medium uppercase tracking-wider text-muted-foreground">Raids</p>
      {raids.map((r, i) => (
        <div key={r.name} className={`flex items-center gap-2 rounded px-2 py-1 text-[12px] ${i === highlight ? "bg-sky-500/20 text-foreground" : ""}`}>
          <span className="h-4 w-6 rounded-sm ring-1 ring-white/10" style={{ background: r.swatch }} />
          {r.name}
          <span className="ml-auto text-[10px] text-muted-foreground">{r.bosses} {r.bosses === 1 ? "boss" : "bosses"}</span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Results and evidence                                                */
/* ------------------------------------------------------------------ */

function ResultsScene({ frame, opacity }: { frame: number; opacity: number }) {
  const table = on(frame, SEARCH_CLICK + 10, 16);
  const open = on(frame, CHEVRON_CLICK, 18);
  const chips = ['Zone contains "Molten Core"', "Kill-time parse ≥ 90 on each of Ragnaros, Majordomo Executus", '≥ 2 players with Class is Paladin & Spec is "Holy"'];
  return (
    <div className="absolute inset-0" style={{ opacity }}>
      <div className="absolute flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3" style={{ left: 24, top: CARD_Y, width: 1008, height: 44 }}>
        <Search className="h-4 w-4 text-muted-foreground" />
        {chips.map((c) => (
          <span key={c} className="max-w-[300px] truncate rounded border border-white/10 bg-background/60 px-2 py-0.5 text-[11px]">{c}</span>
        ))}
        <span className="text-[11px] text-muted-foreground">25+ runs</span>
        <span className="ml-auto rounded border border-white/10 px-2.5 py-0.5 text-[11px]" style={{ scale: String(1 - pulse(frame, EDIT_CLICK) * 0.05) }}>Edit</span>
        <span className="rounded px-2 py-0.5 text-[11px] text-muted-foreground">New</span>
      </div>
      <div
        className="absolute overflow-hidden rounded-lg border border-white/10 bg-background/40"
        style={{ left: 24, top: TABLE_Y, width: 1008, opacity: table, translate: `0 ${interpolate(table, [0, 1], [10, 0])}px` }}
      >
        <div className="flex h-[26px] items-center bg-[#13202c] text-[9px] uppercase tracking-wider text-muted-foreground">
          <span className="w-10" />
          <span className="flex-1">Run</span>
          <span className="w-40">Guild</span>
          <span className="w-24">Bosses</span>
          <span className="w-20 text-right">Clear</span>
          <span className="w-28 pr-4 text-right">Date</span>
        </div>
        {RUNS.map((run, i) => (
          <div key={run.guild}>
            <div className={`flex items-center border-t border-white/10 text-[12px] ${i === 0 && open > 0 ? "bg-sky-500/[0.06]" : ""}`} style={{ height: ROW_H }}>
              <span className="flex w-10 justify-center">
                <ChevronRight className="h-4 w-4 text-muted-foreground" style={{ rotate: `${i === 0 ? open * 90 : 0}deg` }} />
              </span>
              <span className="flex flex-1 items-center gap-2.5">
                <span className="h-7 w-11 rounded ring-1 ring-white/10" style={{ background: RAIDS[0].swatch }} />
                <span>
                  <span className="block font-medium">Molten Core</span>
                  <span className="block text-[10px] text-muted-foreground">{run.realm} · 40-player</span>
                </span>
              </span>
              <span className="w-40">{run.guild}</span>
              <span className="w-24">
                <span className="text-emerald-300">10</span>
                <span className="text-muted-foreground">/10</span>
                <span className="mt-0.5 block h-1 w-14 rounded-full bg-emerald-400/80" />
              </span>
              <span className="w-20 text-right font-mono text-[11px]">{run.clear}</span>
              <span className="w-28 pr-4 text-right text-[11px] text-muted-foreground">{run.date}</span>
            </div>
            {i === 0 && <Evidence frame={frame} height={open * EVIDENCE_H} />}
          </div>
        ))}
      </div>
    </div>
  );
}

/** "Why it matched", lines revealed one by one after the chevron click. */
function Evidence({ frame, height }: { frame: number; height: number }) {
  const line = (n: number) => on(frame, CHEVRON_CLICK + 14 + n * 10, 10);
  return (
    <div className="overflow-hidden bg-sky-500/[0.04]" style={{ height }}>
      <div className="px-10 pt-2 text-[12px]">
        <p className="mb-1.5 text-[9px] uppercase tracking-wider text-muted-foreground">Why it matched</p>
        <EvidenceLine show={line(0)}>
          Zone contains &quot;Molten Core&quot; <Value>Molten Core</Value>
        </EvidenceLine>
        <EvidenceLine show={line(1)}>
          Kill-time parse ≥ 90 on each of Ragnaros, Majordomo Executus
          <Chip label="Ragnaros" value="94" />
          <Chip label="Majordomo Executus" value="91" />
        </EvidenceLine>
        <EvidenceLine show={line(2)}>
          ≥ 2 players with Class is Paladin &amp; Spec is &quot;Holy&quot; <span className="text-muted-foreground">→ 3 players</span>
        </EvidenceLine>
        <div className="ml-5 border-l border-white/10 pl-3" style={{ opacity: line(3) }}>
          <p className="flex items-center gap-1.5 py-0.5 font-medium" style={{ color: "#f58cba" }}>
            <ChevronRight className="h-3 w-3 rotate-90 text-muted-foreground" /> Lumenra
          </p>
          <EvidenceLine show={line(4)}>
            Class is Paladin <Value>Paladin</Value>
          </EvidenceLine>
          <EvidenceLine show={line(5)}>
            Spec is &quot;Holy&quot;
            <Chip label="Majordomo Executus" value="Holy" />
            <Chip label="Ragnaros" value="Holy" />
          </EvidenceLine>
          <p className="flex items-center gap-1.5 py-0.5 font-medium" style={{ color: "#f58cba", opacity: line(6) }}>
            <ChevronRight className="h-3 w-3 text-muted-foreground" /> Brightmane
            <span className="ml-3 font-normal text-muted-foreground">and 1 more player</span>
          </p>
        </div>
      </div>
    </div>
  );
}

function EvidenceLine({ show, children }: { show: number; children: ReactNode }) {
  return (
    <p className="flex items-center gap-2 py-0.5" style={{ opacity: show, translate: `${interpolate(show, [0, 1], [-6, 0])}px 0` }}>
      <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
      {children}
    </p>
  );
}

function Value({ children }: { children: ReactNode }) {
  return (
    <span className="text-muted-foreground">
      → <span className="text-foreground">{children}</span>
    </span>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded bg-emerald-500/10 px-1.5 py-px text-[10px] text-emerald-200 ring-1 ring-emerald-500/30">
      <span className="text-muted-foreground">{label}</span> {value}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Blocks                                                              */
/* ------------------------------------------------------------------ */

const B0 = CARD_Y + 12;
const B1 = B0 + 36 + 16;
const B2 = B1 + 58 + 16;
const B2_H = 34 + 2 * 34 + 10;
function dateBlockY() {
  return B2 + B2_H + 16;
}
/** Where the "+ Condition" row sits, before or after the new date block. */
function blockAddY(beforeDate: boolean) {
  return beforeDate ? B2 + B2_H + 10 : dateBlockY() + 36 + 10;
}

function BlocksScene({ frame, opacity }: { frame: number; opacity: number }) {
  const added = on(frame, ADD_CLICK, 10);
  const pickerOpen = between(frame, ADD_CLICK + 4, PICKER_PICK + 6);
  const query = typed("date", frame, PICKER_TYPE, 4);
  const picked = frame >= PICKER_PICK;
  const dates = on(frame, DATES, 12);
  const addY = interpolate(added, [0, 1], [blockAddY(true), blockAddY(false)]);
  return (
    <div className="absolute inset-0" style={{ opacity }}>
      <div className="absolute rounded-lg border border-white/10 bg-white/[0.02]" style={{ left: 24, top: CARD_Y, width: 1008, height: 340 }} />
      <Block y={B0}>
        <FieldBox label="Zone" />
        <SelectBox label="contains" w={84} />
        <span className="flex h-[26px] flex-1 items-center rounded-md border border-white/15 bg-background px-2.5 text-[12px]">Molten Core</span>
      </Block>
      <And y={B0 + 36} />
      <Block y={B1} h={58}>
        <div className="flex w-full flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <FieldBox label="Kill-time parse" />
            <SelectBox label="≥" w={60} />
            <span className="flex h-[26px] w-16 items-center rounded-md border border-white/15 bg-background px-2.5 text-[12px]">90</span>
          </div>
          <div className="flex items-center gap-2 pl-1 text-[10px]">
            <span className="uppercase tracking-wider text-muted-foreground">bosses:</span>
            <ChipBox w={300} chips={["Ragnaros", "Majordomo Executus"]} placeholder="" />
            <Pills options={["any", "each"]} selected="each" />
            <span className="ml-2 uppercase tracking-wider text-muted-foreground">vs:</span>
            <Pills options={["Server", "Realm", "Guild"]} selected="Server" />
          </div>
        </div>
      </Block>
      <And y={B1 + 58} />
      <div className="absolute rounded-md border border-violet-500/40 bg-violet-500/[0.04] px-3 py-2" style={{ left: BLOCK_X, top: B2, width: BLOCK_W, height: B2_H }}>
        <div className="flex items-center gap-2 text-[12px]">
          <IsBadge />
          <SelectBox label="At least" w={84} />
          <span className="flex h-[26px] w-12 items-center rounded-md border border-white/15 bg-background px-2.5">2</span>
          <span className="text-muted-foreground">players where</span>
          <span className="text-[10px] text-muted-foreground">Every condition inside refers to the same player.</span>
        </div>
        <div className="ml-6 mt-1.5 flex flex-col gap-1.5">
          <div className="flex items-center gap-2 text-[12px]">
            <FieldBox label="Class" />
            <SelectBox label="is" w={60} />
            <span className="flex h-[26px] items-center gap-1.5 rounded-md border border-white/15 bg-background px-2" style={{ color: "#f58cba" }}>
              <span className="h-3.5 w-3.5 rounded-sm" style={{ background: "#f58cba" }} /> Paladin
            </span>
          </div>
          <div className="flex items-center gap-2 text-[12px]">
            <FieldBox label="Spec" />
            <SelectBox label="is" w={60} />
            <span className="flex h-[26px] items-center gap-1.5 rounded-md border border-white/15 bg-background px-2" style={{ color: "#f58cba" }}>
              <span className="h-3.5 w-3.5 rounded-sm" style={{ background: "#f58cba" }} /> Holy Paladin
            </span>
          </div>
        </div>
      </div>
      {added > 0 && (
        <>
          <And y={B2 + B2_H} opacity={added} />
          <Block y={dateBlockY()} opacity={added}>
            <FieldBox label={picked ? "Date" : query} placeholder="Search fields…" focused={pickerOpen > 0.5} />
            <SelectBox label={picked ? "between" : "is"} w={84} />
            {picked ? (
              <span className="flex items-center gap-1.5 text-[12px]" style={{ opacity: dates }}>
                <span className="flex h-[26px] w-32 items-center rounded-md border border-white/15 bg-background px-2.5">10/01/2026</span>
                <span className="text-[10px] text-muted-foreground">to</span>
                <span className="flex h-[26px] w-32 items-center rounded-md border border-white/15 bg-background px-2.5">10/31/2026</span>
              </span>
            ) : (
              <span className="flex h-[26px] flex-1 items-center rounded-md border border-white/15 bg-background" />
            )}
          </Block>
        </>
      )}
      <div className="absolute flex gap-1.5 text-[10px]" style={{ left: BLOCK_X, top: addY }}>
        {["+ Condition", "+ Group", "+ A player…", "+ Count players…", "+ A pull…"].map((b, i) => (
          <span key={b} className="rounded border border-white/10 px-2 py-1" style={{ scale: String(i === 0 ? 1 - pulse(frame, ADD_CLICK) * 0.06 : 1) }}>
            {b}
          </span>
        ))}
      </div>
      {pickerOpen > 0 && <FieldPicker opacity={pickerOpen} query={query} />}
    </div>
  );
}

function Block({ y, h = 36, opacity = 1, children }: { y: number; h?: number; opacity?: number; children: ReactNode }) {
  return (
    <div
      className="absolute flex items-center gap-2 rounded-md border border-white/10 bg-background/40 px-3"
      style={{ left: BLOCK_X, top: y, width: BLOCK_W, height: h, opacity, translate: `0 ${interpolate(opacity, [0, 1], [-6, 0])}px` }}
    >
      <IsBadge />
      {children}
    </div>
  );
}

function IsBadge() {
  return <span className="rounded bg-white/5 px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground">IS</span>;
}

function And({ y, opacity = 1 }: { y: number; opacity?: number }) {
  return (
    <span className="absolute rounded-full bg-white/5 px-2 py-px text-[9px] font-semibold text-muted-foreground" style={{ left: BLOCK_X + BLOCK_W / 2 - 16, top: y + 2, opacity }}>
      AND
    </span>
  );
}

function FieldBox({ label, placeholder, focused }: { label: string; placeholder?: string; focused?: boolean }) {
  return (
    <span
      className={`relative flex h-[26px] w-40 items-center rounded-md border bg-background pl-2 text-[12px] ${focused ? "border-sky-500/70 ring-2 ring-sky-500/20" : "border-white/15"}`}
    >
      {label || <span className="text-muted-foreground">{placeholder}</span>}
      {focused && <span className="ml-px h-3.5 w-px bg-foreground" />}
      <ChevronsUpDown className="absolute right-1.5 h-3 w-3 text-muted-foreground" />
    </span>
  );
}

function SelectBox({ label, w }: { label: string; w: number }) {
  return (
    <span className="flex h-[26px] items-center justify-between rounded-md border border-white/15 bg-background px-2 text-[12px]" style={{ width: w }}>
      {label}
      <ChevronsUpDown className="h-3 w-3 text-muted-foreground" />
    </span>
  );
}

/** The block field picker: groups while empty, then the fields matching the query. */
function FieldPicker({ opacity, query }: { opacity: number; query: string }) {
  const groups: [string, string[]][] = query
    ? [["Run", ["Date"]]]
    : [
        ["Run", ["Zone", "Realm", "Guild", "Date", "Difficulty"]],
        ["Bosses & speed", ["Bosses killed", "Wipes", "Clear time"]],
      ];
  return (
    <div
      className="absolute z-40 w-56 rounded-md border bg-[#17151f] p-1 text-[12px] shadow-xl"
      style={{ left: BLOCK_X + 40, top: dateBlockY() + 32, opacity }}
    >
      {groups.map(([group, fields], gi) => (
        <div key={group}>
          <p className={`px-2 pb-0.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground ${gi > 0 ? "mt-1 border-t border-white/10 pt-1.5" : "pt-1"}`}>{group}</p>
          {fields.map((f, i) => (
            <p key={f} className={`rounded px-2 py-0.5 ${query && i === 0 ? "bg-sky-500/20 text-foreground" : ""}`}>{f}</p>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Code                                                                */
/* ------------------------------------------------------------------ */

const CODE_LINES: ReactNode[] = [
  <><K>instance</K>.name.<F>contains</F>(<S>&quot;Molten Core&quot;</S>)</>,
  <><O>&amp;&amp;</O> <K>instance</K>.kill_time_parse({"{"}<S>&quot;bosses&quot;</S>: [<S>&quot;Ragnaros&quot;</S>, <S>&quot;Majordomo Executus&quot;</S>], <S>&quot;match&quot;</S>: <S>&quot;each&quot;</S>{"}"}) <O>&gt;=</O> <N>90</N></>,
  <><O>&amp;&amp;</O> <K>players</K>.<F>filter</F>(p, p.class <O>==</O> <S>&quot;PALADIN&quot;</S> <O>&amp;&amp;</O> p.spec <O>==</O> <S>&quot;Holy&quot;</S>).<F>size</F>() <O>&gt;=</O> <N>2</N></>,
  <><O>&amp;&amp;</O> <K>instance</K>.started_at.<F>between</F>(<F>timestamp</F>(<S>&quot;2026-10-01T00:00:00Z&quot;</S>), <F>timestamp</F>(<S>&quot;2026-10-31T23:59:59Z&quot;</S>))</>,
];
const TYPED_LINE = '&& players.exists(p, p.sub_spec({"on": "trash"}) == "Bear" && p.sub_spec == "Cat")';

function CodeScene({ frame, opacity }: { frame: number; opacity: number }) {
  const extra = typed(TYPED_LINE, frame, CODE_TYPE, 1);
  const typing = frame >= CODE_TYPE && extra.length < TYPED_LINE.length;
  return (
    <div className="absolute inset-0" style={{ opacity }}>
      <div className="absolute overflow-hidden rounded-lg border border-white/10 bg-[#0b0a12] font-mono text-[12px] leading-[22px]" style={{ left: 24, top: CARD_Y, width: 1008, height: 200 }}>
        <div className="flex h-full">
          <div className="w-10 border-r border-white/10 pt-3 text-right text-[11px] text-muted-foreground/60">
            {[1, 2, 3, 4, 5].map((n) => (
              <p key={n} className="pr-2">{n}</p>
            ))}
          </div>
          <div className="flex-1 whitespace-nowrap pl-3 pt-3">
            {CODE_LINES.map((line, i) => (
              <p key={i} style={{ opacity: on(frame, CODE_CLICK + 6 + i * 6, 8) }}>{line}</p>
            ))}
            <p>
              <span className="text-amber-200/90">{extra}</span>
              {typing && <span className="ml-px inline-block h-3.5 w-px translate-y-0.5 bg-foreground" />}
            </p>
          </div>
        </div>
      </div>
      <p className="absolute text-[11px] text-muted-foreground" style={{ left: 28, top: CARD_Y + 208, opacity: on(frame, CODE_CLICK + 30, 10) }}>
        <span className="text-emerald-400">✓</span> Valid search · ⌘/Ctrl + Enter to run
      </p>
    </div>
  );
}

function K({ children }: { children: ReactNode }) {
  return <span className="text-sky-300">{children}</span>;
}
function F({ children }: { children: ReactNode }) {
  return <span className="text-violet-300">{children}</span>;
}
function S({ children }: { children: ReactNode }) {
  return <span className="text-emerald-300">{children}</span>;
}
function N({ children }: { children: ReactNode }) {
  return <span className="text-amber-300">{children}</span>;
}
function O({ children }: { children: ReactNode }) {
  return <span className="text-slate-400">{children}</span>;
}

/* ------------------------------------------------------------------ */
/* Captions and finale                                                 */
/* ------------------------------------------------------------------ */

const CAPTIONS: { step: number; text: ReactNode; from: number; to: number }[] = [
  { step: 1, text: "Pick zones and bosses from the list, or type part of a name", from: 16, to: PARSE_CLICK - 2 },
  { step: 2, text: "Bosses, speed, parses and roster, in one form", from: PARSE_CLICK + 2, to: SEARCH_CLICK + 8 },
  { step: 3, text: <>Click <span className="text-sky-300">›</span> on a run to see why it matched</>, from: SEARCH_CLICK + 14, to: CHEVRON_CLICK + 24 },
  { step: 4, text: "Every condition, with the run's real numbers", from: CHEVRON_CLICK + 28, to: EDIT_CLICK + 4 },
  { step: 5, text: <>Or build it with <span className="text-sky-300">blocks</span>: search for any field, with date ranges</>, from: EDIT_CLICK + 10, to: CODE_CLICK - 2 },
  { step: 6, text: <>Or write it as <span className="text-sky-300">code</span>: add a druid who went Bear on trash, Cat on bosses</>, from: CODE_CLICK + 4, to: FINALE - 4 },
];

function Captions({ frame }: { frame: number }) {
  return (
    <>
      {CAPTIONS.map((c) => {
        const opacity = interpolate(frame, [c.from, c.from + 12, c.to - 10, c.to], [0, 1, 1, 0], clamp);
        return opacity > 0 ? <StepCaption key={c.step} step={c.step} text={c.text} opacity={opacity} /> : null;
      })}
    </>
  );
}

function Finale({ progress }: { progress: number }) {
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center text-center"
      style={{ opacity: progress, translate: `0 ${interpolate(progress, [0, 1], [18, 0])}px` }}
    >
      <Search className="h-14 w-14 text-sky-300" />
      <h2 className="font-wow mt-4 text-[64px] font-bold tracking-tight">Instance search</h2>
      <p className="mt-2 text-2xl text-muted-foreground">Find any raid, and see exactly why it matched.</p>
      <div className="mt-8 flex gap-3 font-mono text-lg">
        {["Form", "Blocks", "Code", "Why it matched"].map((label) => (
          <span key={label} className="rounded-full border border-white/15 bg-white/5 px-5 py-2">{label}</span>
        ))}
      </div>
    </div>
  );
}
