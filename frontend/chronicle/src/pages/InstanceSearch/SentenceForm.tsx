import { useState, type KeyboardEvent, type ReactNode } from "react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { Check, Lock, Plus, X } from "lucide-react";
import { Link } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { getInstanceBackground } from "@/pages/Logs/utils/instanceImages";
import { parseColor } from "@/pages/Instance/parseColors";
import { TIER_COLOR } from "@/pages/Settings/billingPricing";
import { ChipInput, NumberInput, Segmented, SuggestInput, ToggleChips } from "./controls";
import { MATCH_OPTIONS, PARSE_SCOPE_OPTIONS, enumLabel } from "./fieldLabels";
import { ClassSpecPicker } from "./ClassSpecPicker";
import { toOptions, type Suggestion } from "./comboOptions";
import type { SearchForm as Form, PlayerStatField, TextMatch } from "./queryModel";
import { KINDS, KIND_DEF, cleared, hasValue, type Kind, type KindDef } from "./sentenceKinds";

/*
 * The search form as a sentence: "Find [Molten Core] runs by [any guild] on
 * [any realm] [any time], where [Ragnaros] died and …". Every bracketed token
 * opens a small editor. Conditions only appear once added, so an empty search
 * is one short line instead of a wall of inputs.
 * The conditions and their tiers are in sentenceKinds.ts.
 */

export interface SearchFormProps {
  form: Form;
  onChange: (form: Form) => void;
  zones: readonly Suggestion[];
  /** Bosses for the chosen zone (or every boss when no zone is chosen). */
  bosses: readonly Suggestion[];
  realms: readonly Suggestion[];
  classes: readonly string[];
  capabilities: readonly string[];
  loggedIn: boolean;
  /** Honored supporters get the expensive conditions. */
  honored: boolean;
}

const TEXT_MATCH_OPTIONS: { value: TextMatch; label: string }[] = [
  { value: "contains", label: "contains" },
  { value: "exact", label: "exact" },
];

const HONORED = TIER_COLOR.honored;

export function SentenceForm({ form, onChange, zones, bosses, realms, classes, capabilities, loggedIn, honored }: SearchFormProps) {
  const patch = (p: Partial<Form>) => onChange({ ...form, ...p });
  const set = <K extends keyof Form>(key: K, value: Form[K]) => patch({ [key]: value } as Partial<Form>);
  // Conditions added but not filled in yet stay on screen.
  const [added, setAdded] = useState<Kind[]>([]);
  // The condition just added opens its editor right away.
  const [fresh, setFresh] = useState<Kind | null>(null);

  const isLocked = (k: Kind) => {
    const tier = KIND_DEF.get(k)!.tier;
    return tier === "honored" ? !honored : tier === "free" ? !loggedIn : false;
  };
  const single = KINDS.filter((d) => !d.list && (hasValue(form, d.kind) || added.includes(d.kind))).map((d) => d.kind);
  const remove = (k: Kind) => {
    setAdded(added.filter((x) => x !== k));
    patch(cleared(k));
  };
  const add = (k: Kind) => {
    setFresh(k);
    switch (k) {
      case "classCount":
        return set("classCounts", [...form.classCounts, { class: classes[0] ?? "WARRIOR", spec: "", subSpec: "", min: 1 }]);
      case "guildCount":
        return set("guildCounts", [...form.guildCounts, { guild: "", min: 5 }]);
      case "bossKillTime":
        return set("bossKillTimes", [...form.bossKillTimes, { boss: "", maxMinutes: null }]);
      case "playerParse":
        return set("playerParses", [...form.playerParses, { name: "", class: "", spec: "", subSpec: "", min: null, metric: "dps", bosses: [] }]);
      case "playerStat":
        return set("playerStats", [...form.playerStats, { name: "", stat: "dps", min: null, bosses: [] }]);
      case "hasVideo":
        return set("hasVideo", true);
      default:
        setAdded([...added, k]);
    }
  };
  /** Replaces item i of a list field. */
  const updateAt = <K extends "classCounts" | "guildCounts" | "bossKillTimes" | "playerParses" | "playerStats">(key: K, i: number, v: Partial<Form[K][number]>) =>
    set(key, (form[key] as Form[K][number][]).map((x, j) => (j === i ? { ...x, ...v } : x)) as Form[K]);
  const removeAt = <K extends "classCounts" | "guildCounts" | "bossKillTimes" | "playerParses" | "playerStats">(key: K, i: number) =>
    set(key, (form[key] as Form[K][number][]).filter((_, j) => j !== i) as Form[K]);

  const scopeToken = (dis: boolean) => (
    <Token label={`the ${form.parseScope}`} filled tone="muted" disabled={dis} width="w-auto">
      <p className="text-2xs text-muted-foreground mb-2">Rank parses against every run on the</p>
      <Segmented options={PARSE_SCOPE_OPTIONS} value={form.parseScope} onChange={(v) => set("parseScope", v)} />
    </Token>
  );

  const lines: { key: string; kind: Kind; body: ReactNode; onRemove: () => void }[] = [];
  for (const k of single) {
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
      case "bossesKilled":
        body = (
          <>
            <Word>at least</Word>
            <NumberToken value={form.bossesKilledMin} onChange={(v) => set("bossesKilledMin", v)} min={1} presets={[4, 6, 8, 10]} autoOpen={auto} disabled={dis} />
            <Word>bosses died</Word>
          </>
        );
        break;
      case "wipes":
        body = (
          <>
            <Word>there were at most</Word>
            <NumberToken value={form.wipesMax} onChange={(v) => set("wipesMax", v)} min={0} presets={[0, 1, 2, 5]} autoOpen={auto} disabled={dis} />
            <Word>{form.wipesMax === 1 ? "wipe" : "wipes"}</Word>
          </>
        );
        break;
      case "deaths":
        body = (
          <>
            <Word>there were at most</Word>
            <NumberToken value={form.deathsMax} onChange={(v) => set("deathsMax", v)} min={0} presets={[0, 5, 10, 20]} autoOpen={auto} disabled={dis} />
            <Word>{form.deathsMax === 1 ? "death" : "deaths"}</Word>
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
            {scopeToken(dis)}
          </>
        );
        break;
      case "clearParse":
        body = (
          <>
            <Word>the clear parsed</Word>
            <ParseToken value={form.clearParseMin} onChange={(v) => set("clearParseMin", v)} autoOpen={auto} disabled={dis} />
            <Word>vs</Word>
            {scopeToken(dis)}
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
      case "bossTime":
        body = (
          <>
            <Word>fighting bosses took under</Word>
            <MinutesToken value={form.bossTimeMaxMinutes} onChange={(v) => set("bossTimeMaxMinutes", v)} presets={[10, 15, 20, 30, 45]} autoOpen={auto} disabled={dis} />
            <Word>in total</Word>
          </>
        );
        break;
      case "trashTime":
        body = (
          <>
            <Word>clearing trash took under</Word>
            <MinutesToken value={form.trashTimeMaxMinutes} onChange={(v) => set("trashTimeMaxMinutes", v)} presets={[20, 30, 45, 60, 90]} autoOpen={auto} disabled={dis} />
            <Word>in total</Word>
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
      case "raidSize":
        body = (
          <>
            <Word>it was a</Word>
            <NumberToken value={form.maxPlayers} onChange={(v) => set("maxPlayers", v)} min={1} presets={[10, 20, 40]} autoOpen={auto} disabled={dis} />
            <Word>player raid</Word>
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
      case "hasVideo":
        body = <Word>it has a linked video</Word>;
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
    }
    lines.push({ key: k, kind: k, body, onRemove: () => remove(k) });
  }

  /** The newest entry of a list condition that was just added. */
  const freshAt = (k: Kind, i: number, len: number) => fresh === k && i === len - 1;

  form.bossKillTimes.forEach((b, i) => {
    const dis = isLocked("bossKillTime");
    lines.push({
      key: `bossKill-${i}`,
      kind: "bossKillTime",
      body: (
        <>
          <BossToken single values={b.boss ? [b.boss] : []} onChange={(v) => updateAt("bossKillTimes", i, { boss: v.at(-1) ?? "" })} bosses={bosses} empty="a boss" autoOpen={freshAt("bossKillTime", i, form.bossKillTimes.length)} disabled={dis} />
          <Word>died in under</Word>
          <MinutesToken value={b.maxMinutes} onChange={(v) => updateAt("bossKillTimes", i, { maxMinutes: v })} presets={[1, 2, 3, 5, 10]} disabled={dis} />
        </>
      ),
      onRemove: () => removeAt("bossKillTimes", i),
    });
  });

  form.playerParses.forEach((p, i) => {
    const dis = isLocked("playerParse");
    lines.push({
      key: `playerParse-${i}`,
      kind: "playerParse",
      body: (
        <>
          <NameToken value={p.name} onChange={(name) => updateAt("playerParses", i, { name })} disabled={dis} />
          <Word>parsed</Word>
          <ParseToken value={p.min} onChange={(min) => updateAt("playerParses", i, { min })} autoOpen={freshAt("playerParse", i, form.playerParses.length)} disabled={dis} />
          <Token label={p.metric.toUpperCase()} filled tone="muted" disabled={dis} width="w-auto">
            <Segmented options={[{ value: "dps" as const, label: "DPS" }, { value: "hps" as const, label: "HPS" }]} value={p.metric} onChange={(metric) => updateAt("playerParses", i, { metric })} />
          </Token>
          <Word>as</Word>
          <ClassSpecPicker
            value={p}
            allowedClasses={classes}
            placeholder="any class"
            disabled={dis}
            className={cn(TOKEN, p.class || p.spec ? TOKEN_FILLED : TOKEN_EMPTY, "h-auto")}
            onChange={(v) => updateAt("playerParses", i, v)}
          />
          <Word>on</Word>
          <BossToken values={p.bosses} onChange={(v) => updateAt("playerParses", i, { bosses: v })} bosses={bosses} empty="any boss" disabled={dis} />
        </>
      ),
      onRemove: () => removeAt("playerParses", i),
    });
  });

  form.classCounts.forEach((c, i) => {
    const dis = isLocked("classCount");
    lines.push({
      key: `class-${i}`,
      kind: "classCount",
      body: (
        <>
          <Word>the raid had at least</Word>
          <NumberToken value={c.min} onChange={(v) => updateAt("classCounts", i, { min: v ?? 1 })} min={1} autoOpen={freshAt("classCount", i, form.classCounts.length)} disabled={dis} />
          <ClassSpecPicker
            value={c}
            allowedClasses={classes}
            allowAny={false}
            placeholder="Pick a class / spec"
            disabled={dis}
            className={cn(TOKEN, TOKEN_FILLED, "h-auto")}
            onChange={(v) => updateAt("classCounts", i, v)}
          />
        </>
      ),
      onRemove: () => removeAt("classCounts", i),
    });
  });

  form.guildCounts.forEach((g, i) => {
    const dis = isLocked("guildCount");
    lines.push({
      key: `guild-${i}`,
      kind: "guildCount",
      body: (
        <>
          <Word>at least</Word>
          <NumberToken value={g.min} onChange={(v) => updateAt("guildCounts", i, { min: v ?? 1 })} min={1} disabled={dis} />
          <Word>members of</Word>
          <Token label={g.guild} filled={g.guild.trim() !== ""} empty="a guild" autoOpen={freshAt("guildCount", i, form.guildCounts.length)} disabled={dis}>
            <Input autoFocus className="h-7 text-xs" value={g.guild} onChange={(e) => updateAt("guildCounts", i, { guild: e.target.value })} placeholder="Guild name" />
          </Token>
          <Word>attended</Word>
        </>
      ),
      onRemove: () => removeAt("guildCounts", i),
    });
  });

  form.playerStats.forEach((p, i) => {
    const dis = isLocked("playerStat");
    const stat = STATS[p.stat];
    lines.push({
      key: `playerStat-${i}`,
      kind: "playerStat",
      body: (
        <>
          <NameToken value={p.name} onChange={(name) => updateAt("playerStats", i, { name })} disabled={dis} />
          <Word>had</Word>
          <NumberToken value={p.min} onChange={(min) => updateAt("playerStats", i, { min })} min={0} presets={stat.presets} suffix="+" autoOpen={freshAt("playerStat", i, form.playerStats.length)} disabled={dis} />
          <Token label={stat.label} filled tone="muted" disabled={dis} width="w-auto">
            <Segmented
              options={(Object.keys(STATS) as PlayerStatField[]).map((value) => ({ value, label: STATS[value].label }))}
              value={p.stat}
              onChange={(s) => updateAt("playerStats", i, { stat: s, min: null })}
            />
          </Token>
          <Word>on</Word>
          <BossToken values={p.bosses} onChange={(v) => updateAt("playerStats", i, { bosses: v })} bosses={bosses} empty="any boss" disabled={dis} />
        </>
      ),
      onRemove: () => removeAt("playerStats", i),
    });
  });

  // Lines in menu order, so related conditions sit together.
  const order = new Map(KINDS.map((d, i) => [d.kind, i]));
  lines.sort((a, b) => order.get(a.kind)! - order.get(b.kind)!);
  const available = KINDS.filter((d) => d.list || !single.includes(d.kind));

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
            const def = KIND_DEF.get(l.kind)!;
            const locked = isLocked(l.kind);
            const Icon = locked ? Lock : def.icon;
            return (
              <li key={l.key} className="group flex items-start gap-2">
                <span title={locked ? (def.tier === "honored" ? "Honored supporters can search by this" : "Log in to search by this") : undefined} className="mt-1.5 shrink-0">
                  <Icon className={cn("h-4 w-4", !locked && "text-primary/70")} style={locked ? { color: def.tier === "honored" ? HONORED : undefined } : undefined} aria-hidden="true" />
                </span>
                <div className={cn("flex flex-wrap items-center gap-x-1.5 gap-y-2 text-sm sm:text-base leading-relaxed flex-1 min-w-0", locked && "opacity-60")}>
                  <Word>{i === 0 ? "where" : "and"}</Word>
                  {l.body}
                  {def.tier === "honored" && <HonoredBadge />}
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
        <AddConditionMenu kinds={available} isLocked={isLocked} loggedIn={loggedIn} honored={honored} onAdd={add} />
        {!loggedIn && (
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

const STATS: Record<PlayerStatField, { label: string; presets: number[] }> = {
  dps: { label: "DPS", presets: [800, 1000, 1500, 2000] },
  hps: { label: "HPS", presets: [500, 800, 1000, 1500] },
  avg_ilvl: { label: "item level", presets: [60, 66, 70, 75] },
};

function Word({ children, strong }: { children: ReactNode; strong?: boolean }) {
  return <span className={strong ? "font-semibold text-foreground" : "text-muted-foreground"}>{children}</span>;
}

function HonoredBadge() {
  return (
    <span className="rounded px-1.5 py-px text-2xs font-semibold uppercase tracking-wider ring-1 ring-current/40" style={{ color: HONORED }}>
      Honored
    </span>
  );
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

/** "Thrall" / "someone". */
function NameToken({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <Token label={value} filled={value.trim() !== ""} empty="someone" disabled={disabled}>
      <p className="text-2xs text-muted-foreground mb-2">A player name, or leave empty for anyone in the raid.</p>
      <Input autoFocus className="h-7 text-xs" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Player name" />
      <ClearLink show={value !== ""} onClick={() => onChange("")}>Anyone</ClearLink>
    </Token>
  );
}

/** "Molten Core" / "any raid": raid art tiles, plus free text for anything else. */
function ZoneToken({ value, match, zones, onChange }: { value: string; match: TextMatch; zones: readonly Suggestion[]; onChange: (zone: string, match: TextMatch) => void }) {
  const options = toOptions(zones);
  const isRaid = (option: (typeof options)[number]) => option.group?.toLowerCase().endsWith("raids") ?? false;
  const raids = options.filter(isRaid);
  const raidGroups = [...new Set(raids.map((option) => option.group ?? "Raids"))];
  const others = options.filter((option) => !isRaid(option));
  const picked = (name: string) => value.toLowerCase() === name.toLowerCase();
  const label = match === "contains" && !options.some((o) => o.value.toLowerCase() === value.toLowerCase()) ? `“${value}”` : value;
  return (
    <Token label={label} filled={value.trim() !== ""} empty="any raid" width="w-[26rem]">
      {raidGroups.map((group, groupIndex) => (
        <div key={group} className={groupIndex > 0 ? "mt-3" : undefined}>
          <p className="mb-1.5 text-2xs font-medium uppercase tracking-wider text-muted-foreground">{group}</p>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {raids.filter((option) => (option.group ?? "Raids") === group).map((o) => (
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
        </div>
      ))}
      <p className="text-2xs text-muted-foreground mt-3 mb-1.5">{raids.length ? "Or a dungeon / any name" : "Zone name"}</p>
      <div className="flex items-center gap-1.5">
        <SuggestInput className="flex-1" value={value} onChange={(v) => onChange(v, match)} suggestions={others} placeholder="e.g. Scholomance" />
        <Segmented options={TEXT_MATCH_OPTIONS} value={match} onChange={(m) => onChange(value, m)} />
      </div>
      <ClearLink show={value !== ""} onClick={() => onChange("", match)}>Any zone</ClearLink>
    </Token>
  );
}

/**
 * A checklist of bosses (for the chosen zone), filterable, with free text.
 * single: picking a boss replaces the current one.
 */
function BossToken({
  values,
  onChange,
  bosses,
  empty,
  single,
  autoOpen,
  disabled,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  bosses: readonly Suggestion[];
  empty: string;
  single?: boolean;
  autoOpen?: boolean;
  disabled?: boolean;
}) {
  const [q, setQ] = useState("");
  const options = toOptions(bosses);
  const hits = options.filter((o) => !q || o.value.toLowerCase().includes(q.toLowerCase()));
  const groups = [...new Set(hits.map((o) => o.group ?? ""))];
  const toggle = (name: string) => {
    if (values.includes(name)) onChange(values.filter((v) => v !== name));
    else onChange(single ? [name] : [...values, name]);
  };
  return (
    <Token label={listLabel(values)} filled={values.length > 0} empty={empty} autoOpen={autoOpen} disabled={disabled}>
      <Input
        autoFocus
        className="h-7 text-xs mb-2"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={single ? "Filter bosses, Enter picks any name" : "Filter bosses, Enter adds any name"}
        onKeyDown={(e) => {
          if (e.key !== "Enter" || !q.trim()) return;
          e.preventDefault();
          const exact = hits.length === 1 ? hits[0].value : q.trim();
          if (!values.includes(exact)) onChange(single ? [exact] : [...values, exact]);
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
                  <span className={cn("flex h-3.5 w-3.5 items-center justify-center border", single ? "rounded-full" : "rounded-sm", on ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/50")}>
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
        or at least <NumberInput className="w-20" value={value} onChange={onChange} min={0} max={100} placeholder="0-100" />
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

/** A number with − / + steppers and optional quick picks. */
function NumberToken({
  value,
  onChange,
  min,
  presets,
  suffix = "",
  autoOpen,
  disabled,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  min: number;
  presets?: number[];
  suffix?: string;
  autoOpen?: boolean;
  disabled?: boolean;
}) {
  const step = (d: number) => onChange(Math.max(min, (value ?? min) + d));
  return (
    <Token label={<span className="tabular-nums">{value?.toLocaleString()}{suffix}</span>} filled={value != null} empty="…" autoOpen={autoOpen} disabled={disabled} width="w-auto">
      {presets && (
        <div className="flex gap-1 mb-2">
          {presets.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onChange(p)}
              className={cn("rounded-md px-2 py-1 text-xs tabular-nums ring-1 transition", value === p ? "ring-primary bg-primary/15 text-foreground" : "ring-border text-muted-foreground hover:text-foreground")}
            >
              {p.toLocaleString()}{suffix}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => step(-1)} className="h-7 w-7 rounded-md ring-1 ring-border hover:bg-muted" aria-label="Fewer">−</button>
        <NumberInput className="w-20 text-center" value={value} onChange={(v) => onChange(v == null ? null : Math.max(min, Math.round(v)))} min={min} />
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

function AddConditionMenu({
  kinds,
  isLocked,
  loggedIn,
  honored,
  onAdd,
}: {
  kinds: KindDef[];
  isLocked: (k: Kind) => boolean;
  loggedIn: boolean;
  honored: boolean;
  onAdd: (k: Kind) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const q = query.trim().toLowerCase();
  const matches = q ? kinds.filter((k) => `${k.label} ${k.group}`.toLowerCase().includes(q)) : kinds;
  const groups = [...new Set(matches.map((k) => k.group))];
  // Arrow keys walk the enabled options in the grouped display order.
  const selectable = groups.flatMap((g) => matches.filter((k) => k.group === g && !isLocked(k.kind)));
  const activeKind = selectable[Math.min(active, selectable.length - 1)]?.kind;

  const onOpenChange = (o: boolean) => {
    setOpen(o);
    if (!o) {
      setQuery("");
      setActive(0);
    }
  };
  const pick = (k: Kind) => {
    onOpenChange(false);
    onAdd(k);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (selectable.length === 0) return;
      const cur = Math.min(active, selectable.length - 1);
      setActive((cur + (e.key === "ArrowDown" ? 1 : selectable.length - 1)) % selectable.length);
    } else if (e.key === "Enter" && activeKind) {
      e.preventDefault();
      pick(activeKind);
    }
  };

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-primary/50 px-3 py-1.5 text-sm text-primary hover:bg-primary/10 transition-colors"
        >
          <Plus className="h-4 w-4" /> Add a condition
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="z-50 w-80 max-w-[calc(100vw-24px)] rounded-lg border bg-popover text-popover-foreground shadow-lg outline-none animate-in fade-in-0 zoom-in-95"
          // The new condition opens its own editor; don't pull focus back here.
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <div className="border-b p-2">
            <Input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              placeholder="Only show runs where…"
              className="h-8 text-sm"
              role="combobox"
              aria-label="Search conditions"
              aria-expanded
              aria-controls="add-condition-list"
            />
          </div>
          <div id="add-condition-list" role="listbox" className="max-h-[60vh] overflow-y-auto styled-scrollbar p-1">
            {groups.length === 0 && <p className="px-2 py-3 text-center text-xs text-muted-foreground">No matching conditions.</p>}
            {groups.map((g, i) => (
              <div key={g}>
                {i > 0 && <div className="-mx-1 my-1 h-px bg-border" />}
                <p className="px-2 py-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">{g}</p>
                {matches.filter((k) => k.group === g).map((k) => {
                  const Icon = k.icon;
                  const lock = isLocked(k.kind);
                  const on = k.kind === activeKind;
                  return (
                    <button
                      key={k.kind}
                      type="button"
                      role="option"
                      aria-selected={on}
                      disabled={lock}
                      tabIndex={-1}
                      ref={on ? (el) => el?.scrollIntoView({ block: "nearest" }) : undefined}
                      onMouseMove={() => !lock && !on && setActive(selectable.findIndex((s) => s.kind === k.kind))}
                      onClick={() => pick(k.kind)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none disabled:pointer-events-none disabled:opacity-50",
                        on && "bg-accent text-accent-foreground",
                      )}
                    >
                      <Icon className="h-4 w-4 text-primary/80" />
                      <span className="flex-1">{k.label}</span>
                      {k.tier === "honored" && (
                        <span className="inline-flex items-center gap-1 text-2xs font-semibold" style={{ color: HONORED }}>
                          {lock && <Lock className="h-3 w-3" />}
                          Honored
                        </span>
                      )}
                      {k.tier === "free" && lock && <Lock className="h-3 w-3 text-amber-400/90" />}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          {(!honored || !loggedIn) && (
            <div className="border-t px-3 py-2 text-2xs text-muted-foreground">
              {!loggedIn && (
                <p className="mb-1">
                  <Link to="/login" className="text-sky-400 hover:underline">Log in</Link> to search by bosses, parses, speed and roster.
                </p>
              )}
              {!honored && (
                <p>
                  <Link to="/supporter" className="font-medium hover:underline" style={{ color: HONORED }}>Honored supporters</Link> can also search by player parses and stats, and boss, trash and idle time.
                </p>
              )}
            </div>
          )}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
