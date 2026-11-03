import { useState, type ReactNode } from "react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { Check, Clock, Film, Gauge, Hourglass, Lock, Plus, ShieldCheck, Skull, Swords, Trophy, User, Users, X, type LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu/DropdownMenu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { getInstanceBackground } from "@/pages/Logs/utils/instanceImages";
import { parseColor } from "@/pages/Instance/parseColors";
import { ChipInput, NumberInput, Segmented, SuggestInput, ToggleChips } from "./controls";
import { MATCH_OPTIONS, PARSE_SCOPE_OPTIONS, enumLabel } from "./fieldLabels";
import { ClassSpecPicker } from "./ClassSpecPicker";
import { toOptions, type Suggestion } from "./comboOptions";
import type { SearchForm as Form, TextMatch } from "./queryModel";
import type { SearchFormProps } from "./SearchForm";

/*
 * The search form as a sentence: "Find [Molten Core] runs by [any guild] on
 * [any realm] [any time], where [Ragnaros] died and …". Every bracketed token
 * opens a small editor. Conditions only appear once added, so an empty search
 * is one short line instead of a wall of inputs. It edits the same Form as
 * before, so formToTree / treeToForm are unchanged.
 */

const TEXT_MATCH_OPTIONS: { value: TextMatch; label: string }[] = [
  { value: "contains", label: "contains" },
  { value: "exact", label: "exact" },
];

/** Conditions that are one line each. classCount / guildCount add a line per entry. */
type Kind = "killed" | "noWipes" | "clearParse" | "killParse" | "clearTime" | "idleTime" | "classCount" | "players" | "guildCount" | "capabilities" | "difficulty";

interface KindDef {
  kind: Kind;
  icon: LucideIcon;
  /** What the menu shows, phrased like the sentence. */
  label: string;
  group: string;
  /** Anonymous users can add it. */
  basic?: boolean;
}

const KINDS: KindDef[] = [
  { kind: "killed", icon: Skull, label: "…a boss died", group: "Bosses" },
  { kind: "noWipes", icon: ShieldCheck, label: "…a boss was never wiped on", group: "Bosses" },
  { kind: "killParse", icon: Trophy, label: "…kill time parsed well", group: "Parses" },
  { kind: "clearParse", icon: Gauge, label: "…the clear parsed well", group: "Parses" },
  { kind: "clearTime", icon: Clock, label: "…the clear was fast", group: "Speed" },
  { kind: "idleTime", icon: Hourglass, label: "…little time was spent idle", group: "Speed" },
  { kind: "classCount", icon: Users, label: "…the raid had a class or spec", group: "Roster" },
  { kind: "players", icon: User, label: "…a player was in the raid", group: "Roster" },
  { kind: "guildCount", icon: Users, label: "…members of a guild attended", group: "Roster" },
  { kind: "capabilities", icon: Film, label: "…the log recorded something", group: "Log" },
  { kind: "difficulty", icon: Swords, label: "…the difficulty was", group: "Run", basic: true },
];

/** Whether a single-line condition has a value. */
function hasValue(f: Form, k: Kind): boolean {
  switch (k) {
    case "killed":
      return f.killed.length > 0;
    case "noWipes":
      return f.noWipes.length > 0;
    case "clearParse":
      return f.clearParseMin != null;
    case "killParse":
      return f.killParseMin != null || f.killParseBosses.length > 0;
    case "clearTime":
      return f.clearTimeMaxMinutes != null;
    case "idleTime":
      return f.idleTimeMaxMinutes != null;
    case "players":
      return f.players.length > 0;
    case "capabilities":
      return f.capabilities.length > 0;
    case "difficulty":
      return f.difficulty.trim() !== "";
    default:
      return false;
  }
}

/** Resets a single-line condition. */
function cleared(k: Kind): Partial<Form> {
  switch (k) {
    case "killed":
      return { killed: [] };
    case "noWipes":
      return { noWipes: [] };
    case "clearParse":
      return { clearParseMin: null };
    case "killParse":
      return { killParseMin: null, killParseBosses: [], killParseMatch: "any" };
    case "clearTime":
      return { clearTimeMaxMinutes: null };
    case "idleTime":
      return { idleTimeMaxMinutes: null };
    case "players":
      return { players: [] };
    case "capabilities":
      return { capabilities: [] };
    case "difficulty":
      return { difficulty: "" };
    default:
      return {};
  }
}

const SINGLE_KINDS: Kind[] = ["killed", "noWipes", "killParse", "clearParse", "clearTime", "idleTime", "players", "capabilities", "difficulty"];

export function SentenceForm({ form, onChange, zones, bosses, realms, classes, capabilities, loggedIn }: SearchFormProps) {
  const patch = (p: Partial<Form>) => onChange({ ...form, ...p });
  const set = <K extends keyof Form>(key: K, value: Form[K]) => patch({ [key]: value } as Partial<Form>);
  const locked = !loggedIn;
  // Conditions added but not filled in yet stay on screen.
  const [added, setAdded] = useState<Kind[]>([]);
  // The condition just added opens its editor right away.
  const [fresh, setFresh] = useState<Kind | null>(null);

  const shown = SINGLE_KINDS.filter((k) => hasValue(form, k) || added.includes(k));
  const remove = (k: Kind) => {
    setAdded(added.filter((x) => x !== k));
    patch(cleared(k));
  };
  const add = (k: Kind) => {
    setFresh(k);
    if (k === "classCount") return set("classCounts", [...form.classCounts, { class: classes[0] ?? "WARRIOR", spec: "", subSpec: "", min: 1 }]);
    if (k === "guildCount") return set("guildCounts", [...form.guildCounts, { guild: "", min: 5 }]);
    setAdded([...added, k]);
  };
  const isLocked = (k: Kind) => locked && !KINDS.find((d) => d.kind === k)?.basic;

  const scopeToken = (
    <Token label={`the ${form.parseScope}`} filled tone="muted" disabled={locked} width="w-auto">
      <p className="text-2xs text-muted-foreground mb-2">Rank parses against every run on the</p>
      <Segmented options={PARSE_SCOPE_OPTIONS} value={form.parseScope} onChange={(v) => set("parseScope", v)} />
    </Token>
  );

  const lines: { key: string; kind: Kind; body: ReactNode; onRemove: () => void }[] = [];
  for (const k of shown) {
    const auto = fresh === k;
    const dis = isLocked(k);
    let body: ReactNode = null;
    switch (k) {
      case "killed":
        body = (
          <>
            <BossToken values={form.killed} onChange={(v) => set("killed", v)} bosses={bosses} empty="a boss" autoOpen={auto} disabled={dis} />
            <Word>{form.killed.length > 1 ? "all died" : "died"}</Word>
          </>
        );
        break;
      case "noWipes":
        body = (
          <>
            <Word>nobody wiped on</Word>
            <BossToken values={form.noWipes} onChange={(v) => set("noWipes", v)} bosses={bosses} empty="a boss" autoOpen={auto} disabled={dis} />
          </>
        );
        break;
      case "killParse":
        body = (
          <>
            <Word>kill time parsed</Word>
            <ParseToken value={form.killParseMin} onChange={(v) => set("killParseMin", v)} autoOpen={auto} disabled={dis} />
            <Word>on</Word>
            {form.killParseBosses.length > 1 && (
              <Token label={form.killParseMatch === "each" ? "each of" : "any of"} filled tone="muted" disabled={dis} width="w-auto">
                <Segmented options={MATCH_OPTIONS} value={form.killParseMatch} onChange={(v) => set("killParseMatch", v)} />
                <p className="text-2xs text-muted-foreground mt-2">any = at least one boss, each = every listed boss</p>
              </Token>
            )}
            <BossToken values={form.killParseBosses} onChange={(v) => set("killParseBosses", v)} bosses={bosses} empty="any boss" disabled={dis} />
            <Word>vs</Word>
            {scopeToken}
          </>
        );
        break;
      case "clearParse":
        body = (
          <>
            <Word>the clear parsed</Word>
            <ParseToken value={form.clearParseMin} onChange={(v) => set("clearParseMin", v)} autoOpen={auto} disabled={dis} />
            <Word>vs</Word>
            {scopeToken}
          </>
        );
        break;
      case "clearTime":
        body = (
          <>
            <Word>the full clear took under</Word>
            <MinutesToken value={form.clearTimeMaxMinutes} onChange={(v) => set("clearTimeMaxMinutes", v)} presets={[45, 60, 90, 120, 180]} autoOpen={auto} disabled={dis} />
          </>
        );
        break;
      case "idleTime":
        body = (
          <>
            <Word>under</Word>
            <MinutesToken value={form.idleTimeMaxMinutes} onChange={(v) => set("idleTimeMaxMinutes", v)} presets={[2, 5, 10, 15, 30]} autoOpen={auto} disabled={dis} />
            <Word>was spent out of combat</Word>
          </>
        );
        break;
      case "players":
        body = (
          <>
            <Token label={listLabel(form.players)} filled={form.players.length > 0} empty="someone" autoOpen={auto} disabled={dis}>
              <p className="text-2xs text-muted-foreground mb-2">Player names; every one must be in the raid.</p>
              <ChipInput values={form.players} onChange={(v) => set("players", v)} placeholder="Type a name, Enter to add" />
            </Token>
            <Word>{form.players.length > 1 ? "were in the raid" : "was in the raid"}</Word>
          </>
        );
        break;
      case "capabilities":
        body = (
          <>
            <Word>the log recorded</Word>
            <Token label={listLabel(form.capabilities.map(enumLabel)).toLowerCase()} filled={form.capabilities.length > 0} empty="something" autoOpen={auto} disabled={dis}>
              <p className="text-2xs text-muted-foreground mb-2">Only logs that recorded all of these.</p>
              <ToggleChips options={capabilities.map((c) => ({ value: c, label: enumLabel(c) }))} values={form.capabilities} onChange={(v) => set("capabilities", v)} />
            </Token>
          </>
        );
        break;
      case "difficulty":
        body = (
          <>
            <Word>the difficulty was</Word>
            <Token label={form.difficulty} filled={form.difficulty.trim() !== ""} empty="…" autoOpen={auto} disabled={dis}>
              <Input autoFocus className="h-7 text-xs" value={form.difficulty} onChange={(e) => set("difficulty", e.target.value)} placeholder="e.g. 40 Player" />
            </Token>
          </>
        );
        break;
    }
    lines.push({ key: k, kind: k, body, onRemove: () => remove(k) });
  }

  form.classCounts.forEach((c, i) => {
    const dis = locked;
    const update = (v: Partial<typeof c>) => set("classCounts", form.classCounts.map((x, j) => (j === i ? { ...x, ...v } : x)));
    lines.push({
      key: `class-${i}`,
      kind: "classCount",
      body: (
        <>
          <Word>the raid had at least</Word>
          <CountToken value={c.min} onChange={(v) => update({ min: v })} autoOpen={fresh === "classCount" && i === form.classCounts.length - 1} disabled={dis} />
          <ClassSpecPicker
            value={c}
            allowedClasses={classes}
            allowAny={false}
            placeholder="Pick a class / spec"
            disabled={dis}
            className={cn(TOKEN, TOKEN_FILLED, "h-auto")}
            onChange={(v) => update(v)}
          />
        </>
      ),
      onRemove: () => set("classCounts", form.classCounts.filter((_, j) => j !== i)),
    });
  });

  form.guildCounts.forEach((g, i) => {
    const dis = locked;
    const update = (v: Partial<typeof g>) => set("guildCounts", form.guildCounts.map((x, j) => (j === i ? { ...x, ...v } : x)));
    lines.push({
      key: `guild-${i}`,
      kind: "guildCount",
      body: (
        <>
          <Word>at least</Word>
          <CountToken value={g.min} onChange={(v) => update({ min: v })} disabled={dis} />
          <Word>members of</Word>
          <Token label={g.guild} filled={g.guild.trim() !== ""} empty="a guild" autoOpen={fresh === "guildCount" && i === form.guildCounts.length - 1} disabled={dis}>
            <Input autoFocus className="h-7 text-xs" value={g.guild} onChange={(e) => update({ guild: e.target.value })} placeholder="Guild name" />
          </Token>
          <Word>attended</Word>
        </>
      ),
      onRemove: () => set("guildCounts", form.guildCounts.filter((_, j) => j !== i)),
    });
  });

  const available = KINDS.filter((d) => d.kind === "classCount" || d.kind === "guildCount" || !shown.includes(d.kind));

  return (
    <div className="rounded-lg border border-border/60 bg-background/40 p-4 sm:p-5">
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-2 text-sm sm:text-base leading-relaxed">
        <Word strong>Find</Word>
        <ZoneToken value={form.zone} match={form.zoneMatch} zones={zones} onChange={(zone, zoneMatch) => patch({ zone, zoneMatch })} />
        <Word>runs by</Word>
        <Token label={form.guild} filled={form.guild.trim() !== ""} empty="any guild">
          <p className="text-2xs text-muted-foreground mb-2">The guild the run is attributed to.</p>
          <div className="flex items-center gap-1.5">
            <Input autoFocus className="h-7 text-xs flex-1" value={form.guild} onChange={(e) => set("guild", e.target.value)} placeholder="Guild name" />
            <Segmented options={TEXT_MATCH_OPTIONS} value={form.guildMatch} onChange={(v) => set("guildMatch", v)} />
          </div>
          <ClearLink show={form.guild !== ""} onClick={() => set("guild", "")}>Any guild</ClearLink>
        </Token>
        <Word>on</Word>
        <Token label={form.realm} filled={form.realm.trim() !== ""} empty="any realm">
          <SuggestInput value={form.realm} onChange={(v) => set("realm", v)} suggestions={realms} placeholder="Realm name" />
          <ClearLink show={form.realm !== ""} onClick={() => set("realm", "")}>Any realm</ClearLink>
        </Token>
        <DateToken from={form.from} to={form.to} onChange={(from, to) => patch({ from, to })} />
      </p>

      {lines.length > 0 && (
        <ul className="mt-3 space-y-2 border-l-2 border-primary/25 pl-3 sm:ml-1">
          {lines.map((l, i) => {
            const def = KINDS.find((d) => d.kind === l.kind)!;
            const Icon = def.icon;
            return (
              <li key={l.key} className="group flex items-start gap-2">
                <Icon className="h-4 w-4 mt-1.5 shrink-0 text-primary/70" aria-hidden="true" />
                <div className={cn("flex flex-wrap items-center gap-x-1.5 gap-y-2 text-sm sm:text-base leading-relaxed flex-1 min-w-0", isLocked(l.kind) && "opacity-60")}>
                  <Word>{i === 0 ? "where" : "and"}</Word>
                  {l.body}
                </div>
                <button
                  type="button"
                  onClick={l.onRemove}
                  className="mt-1 rounded p-1 text-muted-foreground opacity-60 sm:opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-foreground hover:bg-muted/60"
                  aria-label="Remove condition"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <AddConditionMenu kinds={available} isLocked={isLocked} onAdd={add} />
        {locked && (
          <span className="inline-flex items-center gap-1 text-xs text-amber-400/90">
            <Lock className="h-3 w-3" />
            <Link to="/login" className="hover:underline">Log in</Link> to search by bosses, parses, speed and roster
          </span>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

function Word({ children, strong }: { children: ReactNode; strong?: boolean }) {
  return <span className={strong ? "font-semibold text-foreground" : "text-muted-foreground"}>{children}</span>;
}

const TOKEN =
  "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-sm sm:text-base leading-snug transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50";
const TOKEN_FILLED = "border-primary/40 bg-primary/10 text-foreground font-medium hover:bg-primary/20";
const TOKEN_EMPTY = "border-dashed border-muted-foreground/40 text-muted-foreground hover:border-primary/50 hover:text-foreground";
const TOKEN_MUTED = "border-border bg-muted/40 text-foreground hover:bg-muted";

/** A clickable part of the sentence that opens an editor. */
function Token({
  label,
  empty = "any",
  filled,
  tone,
  autoOpen,
  disabled,
  width = "w-72",
  className,
  children,
}: {
  label: ReactNode;
  empty?: string;
  filled: boolean;
  tone?: "muted";
  autoOpen?: boolean;
  disabled?: boolean;
  width?: string;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(!!autoOpen && !disabled);
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild disabled={disabled}>
        <button type="button" className={cn(TOKEN, tone === "muted" ? TOKEN_MUTED : filled ? TOKEN_FILLED : TOKEN_EMPTY, className)}>
          {filled ? label : empty}
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className={cn("z-50 max-w-[calc(100vw-24px)] rounded-lg border bg-popover text-popover-foreground shadow-lg p-3 outline-none animate-in fade-in-0 zoom-in-95", width)}
        >
          {children}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

function ClearLink({ show, onClick, children }: { show: boolean; onClick: () => void; children: ReactNode }) {
  if (!show) return null;
  return (
    <button type="button" onClick={onClick} className="mt-2 text-2xs text-muted-foreground hover:text-foreground hover:underline">
      {children}
    </button>
  );
}

/** "Molten Core" / "any raid": raid art tiles, plus free text for anything else. */
function ZoneToken({ value, match, zones, onChange }: { value: string; match: TextMatch; zones: readonly Suggestion[]; onChange: (zone: string, match: TextMatch) => void }) {
  const options = toOptions(zones);
  const raids = options.filter((o) => o.group === "Raids");
  const others = options.filter((o) => o.group !== "Raids");
  const picked = (name: string) => value.toLowerCase() === name.toLowerCase();
  const label = match === "contains" && !options.some((o) => o.value.toLowerCase() === value.toLowerCase()) ? `“${value}”` : value;
  return (
    <Token label={label} filled={value.trim() !== ""} empty="any raid" width="w-[26rem]">
      {raids.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
          {raids.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(picked(o.value) ? "" : o.value, "exact")}
              className={cn(
                "relative h-14 overflow-hidden rounded-md bg-cover bg-center text-left ring-1 transition",
                picked(o.value) ? "ring-2 ring-primary" : "ring-white/10 hover:ring-white/30",
              )}
              style={{ backgroundImage: `url(${getInstanceBackground(o.value)})` }}
            >
              <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />
              <span className="absolute bottom-1 left-1.5 right-1.5 text-2xs font-semibold leading-tight text-white drop-shadow">{o.value}</span>
              {picked(o.value) && <Check className="absolute top-1 right-1 h-3.5 w-3.5 text-primary drop-shadow" />}
            </button>
          ))}
        </div>
      )}
      <p className="text-2xs text-muted-foreground mt-3 mb-1.5">{raids.length ? "Or a dungeon / any name" : "Zone name"}</p>
      <div className="flex items-center gap-1.5">
        <SuggestInput className="flex-1" value={value} onChange={(v) => onChange(v, match)} suggestions={others} placeholder="e.g. Scholomance" />
        <Segmented options={TEXT_MATCH_OPTIONS} value={match} onChange={(m) => onChange(value, m)} />
      </div>
      <ClearLink show={value !== ""} onClick={() => onChange("", match)}>Any zone</ClearLink>
    </Token>
  );
}

/** A checklist of bosses (for the chosen zone), filterable, with free text. */
function BossToken({ values, onChange, bosses, empty, autoOpen, disabled }: { values: string[]; onChange: (v: string[]) => void; bosses: readonly Suggestion[]; empty: string; autoOpen?: boolean; disabled?: boolean }) {
  const [q, setQ] = useState("");
  const options = toOptions(bosses);
  const hits = options.filter((o) => !q || o.value.toLowerCase().includes(q.toLowerCase()));
  const groups = [...new Set(hits.map((o) => o.group ?? ""))];
  const toggle = (name: string) => onChange(values.includes(name) ? values.filter((v) => v !== name) : [...values, name]);
  return (
    <Token label={listLabel(values)} filled={values.length > 0} empty={empty} autoOpen={autoOpen} disabled={disabled}>
      <Input
        autoFocus
        className="h-7 text-xs mb-2"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Filter bosses, Enter adds any name"
        onKeyDown={(e) => {
          if (e.key !== "Enter" || !q.trim()) return;
          e.preventDefault();
          const exact = hits.length === 1 ? hits[0].value : q.trim();
          if (!values.includes(exact)) onChange([...values, exact]);
          setQ("");
        }}
      />
      <div className="max-h-64 overflow-y-auto styled-scrollbar -mx-1 px-1">
        {groups.map((g) => (
          <div key={g} className="mb-1.5">
            {groups.length > 1 && g && <p className="px-1 pt-1 pb-0.5 text-2xs uppercase tracking-wider text-muted-foreground">{g}</p>}
            {hits.filter((o) => (o.group ?? "") === g).map((o) => {
              const on = values.includes(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => toggle(o.value)}
                  className={cn("flex w-full items-center gap-2 rounded px-1.5 py-1 text-xs text-left", on ? "bg-primary/15 text-foreground" : "hover:bg-muted/60 text-muted-foreground hover:text-foreground")}
                >
                  <span className={cn("flex h-3.5 w-3.5 items-center justify-center rounded-sm border", on ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/50")}>
                    {on && <Check className="h-3 w-3" />}
                  </span>
                  {o.value}
                </button>
              );
            })}
          </div>
        ))}
        {hits.length === 0 && <p className="px-1 py-2 text-2xs text-muted-foreground">No match. Press Enter to add “{q}”.</p>}
      </div>
      {values.filter((v) => !options.some((o) => o.value === v)).map((v) => (
        <span key={v} className="mr-1 mt-1 inline-flex items-center gap-1 rounded bg-zinc-700/60 px-1.5 py-px text-2xs">
          {v}
          <button type="button" onClick={() => toggle(v)} aria-label={`Remove ${v}`}>
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
    </Token>
  );
}

const PARSE_PRESETS = [50, 75, 90, 95, 99, 100];

/** "90+" in the parse colour, with quick picks. */
function ParseToken({ value, onChange, autoOpen, disabled }: { value: number | null; onChange: (v: number | null) => void; autoOpen?: boolean; disabled?: boolean }) {
  return (
    <Token label={<span className={value != null ? parseColor(value) : undefined}>{value === 100 ? "100" : `${value}+`}</span>} filled={value != null} empty="…+" autoOpen={autoOpen} disabled={disabled} width="w-auto">
      <div className="flex gap-1">
        {PARSE_PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            className={cn("rounded-md px-2 py-1 text-xs font-semibold tabular-nums ring-1 transition", parseColor(p), value === p ? "ring-current bg-white/5" : "ring-border hover:ring-current/60")}
          >
            {p === 100 ? "100" : `${p}+`}
          </button>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-2xs text-muted-foreground">
        or at least <NumberInput className="w-16" value={value} onChange={onChange} min={0} max={100} placeholder="0-100" />
      </div>
    </Token>
  );
}

function formatMinutes(m: number): string {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = Math.round(m % 60);
  return rest ? `${h}h ${rest}m` : `${h}h`;
}

function MinutesToken({ value, onChange, presets, autoOpen, disabled }: { value: number | null; onChange: (v: number | null) => void; presets: number[]; autoOpen?: boolean; disabled?: boolean }) {
  return (
    <Token label={value != null ? formatMinutes(value) : ""} filled={value != null} empty="… min" autoOpen={autoOpen} disabled={disabled} width="w-auto">
      <div className="flex gap-1">
        {presets.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            className={cn("rounded-md px-2 py-1 text-xs tabular-nums ring-1 transition", value === p ? "ring-primary bg-primary/15 text-foreground" : "ring-border text-muted-foreground hover:text-foreground")}
          >
            {formatMinutes(p)}
          </button>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-2xs text-muted-foreground">
        or <NumberInput className="w-16" value={value} onChange={onChange} min={0} step={1} placeholder="min" /> minutes
      </div>
    </Token>
  );
}

/** A count with − / + steppers. */
function CountToken({ value, onChange, autoOpen, disabled }: { value: number; onChange: (v: number) => void; autoOpen?: boolean; disabled?: boolean }) {
  const step = (d: number) => onChange(Math.max(1, value + d));
  return (
    <Token label={<span className="tabular-nums">{value}</span>} filled autoOpen={autoOpen} disabled={disabled} width="w-auto">
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => step(-1)} className="h-7 w-7 rounded-md ring-1 ring-border hover:bg-muted" aria-label="Fewer">−</button>
        <NumberInput className="w-14 text-center" value={value} onChange={(v) => onChange(Math.max(1, Math.round(v ?? 1)))} min={1} />
        <button type="button" onClick={() => step(1)} className="h-7 w-7 rounded-md ring-1 ring-border hover:bg-muted" aria-label="More">+</button>
      </div>
    </Token>
  );
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const DATE_PRESETS = [7, 30, 90];

function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(d.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}) });
}

function dateLabel(from: string, to: string): string {
  if (from && !to) {
    const preset = DATE_PRESETS.find((n) => isoDaysAgo(n) === from);
    return preset ? `in the last ${preset} days` : `since ${shortDate(from)}`;
  }
  if (to && !from) return `before ${shortDate(to)}`;
  return `${shortDate(from)} – ${shortDate(to)}`;
}

function DateToken({ from, to, onChange }: { from: string; to: string; onChange: (from: string, to: string) => void }) {
  return (
    <Token label={dateLabel(from, to)} filled={from !== "" || to !== ""} empty="any time">
      <div className="flex flex-wrap gap-1">
        {DATE_PRESETS.map((n) => {
          const on = from === isoDaysAgo(n) && !to;
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(isoDaysAgo(n), "")}
              className={cn("rounded-md px-2 py-1 text-xs ring-1 transition", on ? "ring-primary bg-primary/15 text-foreground" : "ring-border text-muted-foreground hover:text-foreground")}
            >
              Last {n} days
            </button>
          );
        })}
      </div>
      <p className="text-2xs text-muted-foreground mt-3 mb-1.5">Or a range</p>
      <div className="flex items-center gap-1.5">
        <Input type="date" className="h-7 text-xs" value={from} onChange={(e) => onChange(e.target.value, to)} aria-label="From date" />
        <span className="text-xs text-muted-foreground">to</span>
        <Input type="date" className="h-7 text-xs" value={to} onChange={(e) => onChange(from, e.target.value)} aria-label="To date" />
      </div>
      <ClearLink show={from !== "" || to !== ""} onClick={() => onChange("", "")}>Any time</ClearLink>
    </Token>
  );
}

/** "Ragnaros", "Ragnaros & Golemagg", "Ragnaros, Golemagg +2". */
function listLabel(values: readonly string[]): string {
  if (values.length <= 1) return values[0] ?? "";
  if (values.length === 2) return `${values[0]} & ${values[1]}`;
  return `${values[0]}, ${values[1]} +${values.length - 2}`;
}

function AddConditionMenu({ kinds, isLocked, onAdd }: { kinds: KindDef[]; isLocked: (k: Kind) => boolean; onAdd: (k: Kind) => void }) {
  const groups = [...new Set(kinds.map((k) => k.group))];
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-primary/50 px-3 py-1.5 text-sm text-primary hover:bg-primary/10 transition-colors"
        >
          <Plus className="h-4 w-4" /> Add a condition
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-72 max-h-[70vh] overflow-y-auto styled-scrollbar"
        // The new condition opens its own editor; don't pull focus back here.
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <p className="px-2 py-1.5 text-2xs text-muted-foreground">Only show runs where…</p>
        {groups.map((g, i) => (
          <div key={g}>
            {i > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="text-2xs uppercase tracking-wider text-muted-foreground">{g}</DropdownMenuLabel>
            {kinds.filter((k) => k.group === g).map((k) => {
              const Icon = k.icon;
              const lock = isLocked(k.kind);
              return (
                <DropdownMenuItem key={k.kind} disabled={lock} onSelect={() => onAdd(k.kind)} className="gap-2">
                  <Icon className="h-4 w-4 text-primary/80" />
                  <span className="flex-1">{k.label}</span>
                  {lock && <Lock className="h-3 w-3 text-amber-400/90" />}
                </DropdownMenuItem>
              );
            })}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
