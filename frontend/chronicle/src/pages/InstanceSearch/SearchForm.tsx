import type { ReactNode } from "react";
import { Lock, X } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ChipInput, NumberInput, Segmented, SuggestInput, ToggleChips } from "./controls";
import { MATCH_OPTIONS, PARSE_SCOPE_OPTIONS, enumLabel } from "./fieldLabels";
import { ClassSpecPicker } from "./ClassSpecPicker";
import type { SearchForm as Form, TextMatch } from "./queryModel";

const TEXT_MATCH_OPTIONS: { value: TextMatch; label: string }[] = [
  { value: "contains", label: "contains" },
  { value: "exact", label: "exact" },
];

export interface SearchFormProps {
  form: Form;
  onChange: (form: Form) => void;
  zones: readonly string[];
  /** Bosses for the chosen zone (or every boss when no zone is chosen). */
  bosses: readonly string[];
  classes: readonly string[];
  capabilities: readonly string[];
  /** Anonymous users only get the Run section. */
  loggedIn: boolean;
}

export function SearchForm({ form, onChange, zones, bosses, classes, capabilities, loggedIn }: SearchFormProps) {
  const set = <K extends keyof Form>(key: K, value: Form[K]) => onChange({ ...form, [key]: value });
  const locked = !loggedIn;

  return (
    <div className="space-y-4">
      <Section title="Run">
        <Row label="Zone">
          <SuggestInput className="w-56" value={form.zone} onChange={(v) => set("zone", v)} suggestions={zones} placeholder="e.g. Molten Core" />
          <Segmented options={TEXT_MATCH_OPTIONS} value={form.zoneMatch} onChange={(v) => set("zoneMatch", v)} />
        </Row>
        <Row label="Guild">
          <Input className="h-7 text-xs w-56" value={form.guild} onChange={(e) => set("guild", e.target.value)} placeholder="Guild the run is attributed to" />
          <Segmented options={TEXT_MATCH_OPTIONS} value={form.guildMatch} onChange={(v) => set("guildMatch", v)} />
        </Row>
        <Row label="Realm">
          <Input className="h-7 text-xs w-56" value={form.realm} onChange={(e) => set("realm", e.target.value)} placeholder="Realm name" />
        </Row>
        <Row label="Date">
          <Input type="date" className="h-7 text-xs w-36" value={form.from} onChange={(e) => set("from", e.target.value)} aria-label="From date" />
          <span className="text-xs text-muted-foreground">to</span>
          <Input type="date" className="h-7 text-xs w-36" value={form.to} onChange={(e) => set("to", e.target.value)} aria-label="To date" />
        </Row>
        <Row label="Difficulty">
          <Input className="h-7 text-xs w-36" value={form.difficulty} onChange={(e) => set("difficulty", e.target.value)} placeholder="e.g. 40 Player" />
        </Row>
      </Section>

      <Section title="Bosses & speed" locked={locked}>
        <Row label="Killed">
          <ChipInput className="flex-1 min-w-[220px]" values={form.killed} onChange={(v) => set("killed", v)} suggestions={bosses} placeholder="bosses that died" disabled={locked} />
        </Row>
        <Row label="Never wiped on">
          <ChipInput className="flex-1 min-w-[220px]" values={form.noWipes} onChange={(v) => set("noWipes", v)} suggestions={bosses} placeholder="no wipes on these bosses" disabled={locked} />
        </Row>
        <Row label="Parses vs">
          <Segmented options={PARSE_SCOPE_OPTIONS} value={form.parseScope} onChange={(v) => set("parseScope", v)} disabled={locked} />
        </Row>
        <Row label="Clear parse ≥">
          <NumberInput value={form.clearParseMin} onChange={(v) => set("clearParseMin", v)} min={0} max={100} placeholder="0-100" disabled={locked} />
        </Row>
        <Row label="Kill parse ≥">
          <NumberInput value={form.killParseMin} onChange={(v) => set("killParseMin", v)} min={0} max={100} placeholder="0-100" disabled={locked} />
          <span className="text-xs text-muted-foreground">on</span>
          {form.killParseBosses.length > 1 && (
            <Segmented options={MATCH_OPTIONS} value={form.killParseMatch} onChange={(v) => set("killParseMatch", v)} disabled={locked} title="any = at least one boss, each = every listed boss" />
          )}
          <ChipInput className="flex-1 min-w-[200px]" values={form.killParseBosses} onChange={(v) => set("killParseBosses", v)} suggestions={bosses} placeholder="any boss" disabled={locked} />
        </Row>
        <Row label="Clear time ≤">
          <NumberInput value={form.clearTimeMaxMinutes} onChange={(v) => set("clearTimeMaxMinutes", v)} min={0} step={1} placeholder="min" disabled={locked} />
          <span className="text-xs text-muted-foreground">minutes</span>
        </Row>
        <Row label="Idle time ≤">
          <NumberInput value={form.idleTimeMaxMinutes} onChange={(v) => set("idleTimeMaxMinutes", v)} min={0} step={1} placeholder="min" disabled={locked} />
          <span className="text-xs text-muted-foreground">minutes out of combat during the clear</span>
        </Row>
      </Section>

      <Section title="Roster" locked={locked}>
        <Row label="At least">
          <div className="flex flex-col gap-1.5 flex-1">
            {form.classCounts.map((c, i) => (
              <div key={i} className="flex flex-wrap items-center gap-1.5">
                <NumberInput className="w-16" value={c.min} min={1} disabled={locked} onChange={(v) => set("classCounts", form.classCounts.map((x, j) => (j === i ? { ...x, min: Math.max(1, Math.round(v ?? 1)) } : x)))} />
                <ClassSpecPicker
                  value={c}
                  allowedClasses={classes}
                  allowAny={false}
                  placeholder="Pick a class / spec"
                  disabled={locked}
                  onChange={(v) => set("classCounts", form.classCounts.map((x, j) => (j === i ? { ...x, ...v } : x)))}
                />
                <RemoveButton disabled={locked} onClick={() => set("classCounts", form.classCounts.filter((_, j) => j !== i))} />
              </div>
            ))}
            <AddButton disabled={locked} onClick={() => set("classCounts", [...form.classCounts, { class: classes[0] ?? "WARRIOR", spec: "", subSpec: "", min: 1 }])}>
              + Class / spec
            </AddButton>
            <p className="text-2xs text-muted-foreground">Spec is read from boss kills.</p>
          </div>
        </Row>
        <Row label="Includes">
          <ChipInput className="flex-1 min-w-[220px]" values={form.players} onChange={(v) => set("players", v)} placeholder="player names" disabled={locked} />
        </Row>
        <Row label="Guild members">
          <div className="flex flex-col gap-1.5 flex-1">
            {form.guildCounts.map((g, i) => (
              <div key={i} className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted-foreground">at least</span>
                <NumberInput className="w-16" value={g.min} min={1} disabled={locked} onChange={(v) => set("guildCounts", form.guildCounts.map((x, j) => (j === i ? { ...x, min: Math.max(1, Math.round(v ?? 1)) } : x)))} />
                <span className="text-xs text-muted-foreground">from</span>
                <Input className="h-7 text-xs w-48" value={g.guild} disabled={locked} placeholder="guild name" onChange={(e) => set("guildCounts", form.guildCounts.map((x, j) => (j === i ? { ...x, guild: e.target.value } : x)))} />
                <RemoveButton disabled={locked} onClick={() => set("guildCounts", form.guildCounts.filter((_, j) => j !== i))} />
              </div>
            ))}
            <AddButton disabled={locked} onClick={() => set("guildCounts", [...form.guildCounts, { guild: "", min: 5 }])}>
              + Guild
            </AddButton>
          </div>
        </Row>
      </Section>

      <Section title="Log capabilities" locked={locked}>
        <Row label="Recorded">
          <ToggleChips
            options={capabilities.map((c) => ({ value: c, label: enumLabel(c) }))}
            values={form.capabilities}
            onChange={(v) => set("capabilities", v)}
            disabled={locked}
          />
        </Row>
      </Section>
    </div>
  );
}

function Section({ title, locked, children }: { title: string; locked?: boolean; children: ReactNode }) {
  return (
    <section className={cn("rounded-lg border border-border/60 bg-background/40 p-3", locked && "relative")}>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
        {title}
        {locked && (
          <span className="inline-flex items-center gap-1 normal-case tracking-normal font-normal text-amber-400/90">
            <Lock className="h-3 w-3" />
            <Link to="/login" className="hover:underline">Log in</Link> to search by this
          </span>
        )}
      </h3>
      <div className={cn("space-y-2", locked && "opacity-50 pointer-events-none select-none")}>{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3">
      <span className="text-xs text-muted-foreground sm:w-28 shrink-0 sm:pt-1.5">{label}</span>
      <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">{children}</div>
    </div>
  );
}

function AddButton({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-2xs self-start" disabled={disabled} onClick={onClick}>
      {children}
    </Button>
  );
}

function RemoveButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={disabled} onClick={onClick} aria-label="Remove">
      <X className="h-3.5 w-3.5" />
    </Button>
  );
}
