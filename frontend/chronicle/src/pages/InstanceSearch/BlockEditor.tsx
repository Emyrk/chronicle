import type { ReactNode } from "react";
import type {
  InstanceSearchCount,
  InstanceSearchField,
  InstanceSearchFieldScope,
  InstanceSearchFieldsResponse,
  InstanceSearchOp,
} from "@/api/typesGenerated";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ChipInput, NATIVE_SELECT, NumberInput, Segmented, SuggestInput, ToggleChips } from "./controls";
import { MATCH_OPTIONS, METRIC_OPTIONS, ON_OPTIONS, OP_LABELS, PARSE_SCOPE_OPTIONS, enumLabel, fieldGroup, fieldLabel } from "./fieldLabels";
import { prune, type Node } from "./queryModel";
import { COMPLEXITY_STYLE, complexity, nodeCost } from "./searchCost";
import type { ComboOption, Suggestion } from "./comboOptions";
import { SelectCombo } from "./ComboInput";
import { ClassSpecPicker } from "./ClassSpecPicker";
import { ANY_CLASS_SPEC, type ClassSpec, classLabel, useSubSpecs } from "./classSpec";
import { ClassIcon } from "@/pages/RaidPlanner/ClassIcon";

/**
 * Block editor for the search tree, in the style of the panel filter editor
 * (EventsPanels/FilterBlock): each block has reorder arrows, an IS/NOT
 * toggle and a remove button. Groups nest, and player / encounter blocks
 * open a scope whose conditions all refer to the same player or pull.
 */

export interface BlockContext {
  fields: readonly InstanceSearchField[];
  /** The field list with cost weights; when set, each block shows what it adds to the cost. */
  costs?: InstanceSearchFieldsResponse;
  zones: readonly Suggestion[];
  bosses: readonly Suggestion[];
  realms?: readonly Suggestion[];
  disabled?: boolean;
}

export function BlockEditor({
  tree,
  onChange,
  ctx,
}: {
  tree: Node | undefined;
  onChange: (tree: Node) => void;
  ctx: BlockContext;
}) {
  // The root is always a group so there's somewhere to add blocks.
  const root: Node = tree && (tree.and !== undefined || tree.or !== undefined) ? tree : { and: tree ? [tree] : [] };
  return <GroupBody group={root} scope="instance" depth={0} onChange={onChange} ctx={ctx} />;
}

/* ------------------------------------------------------------------ */
/* Groups                                                              */
/* ------------------------------------------------------------------ */

function GroupBody({
  group,
  scope,
  depth,
  onChange,
  ctx,
}: {
  group: Node;
  scope: InstanceSearchFieldScope;
  depth: number;
  onChange: (group: Node) => void;
  ctx: BlockContext;
}) {
  const isOr = group.or !== undefined;
  const kids = group.and ?? group.or ?? [];
  const setKids = (next: Node[]) => onChange(isOr ? { or: next } : { and: next });
  const toggleKind = () => onChange(isOr ? { and: [...kids] } : { or: [...kids] });
  const move = (from: number, to: number) => {
    const next = [...kids];
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    setKids(next);
  };

  return (
    <div className="space-y-0">
      {kids.length === 0 && (
        <p className="text-xs text-muted-foreground px-1 py-2">
          {depth === 0 ? "No conditions yet. Every run matches." : "Empty. Add a condition below."}
        </p>
      )}
      {kids.map((kid, i) => (
        <div key={i}>
          {i > 0 && <Connector isOr={isOr} onClick={toggleKind} disabled={ctx.disabled} />}
          <NodeBlock
            node={kid}
            scope={scope}
            depth={depth}
            ctx={ctx}
            onChange={(n) => setKids(kids.map((k, j) => (j === i ? n : k)))}
            onRemove={() => setKids(kids.filter((_, j) => j !== i))}
            onMoveUp={i > 0 ? () => move(i, i - 1) : undefined}
            onMoveDown={i < kids.length - 1 ? () => move(i, i + 1) : undefined}
          />
        </div>
      ))}
      <AddRow scope={scope} depth={depth} ctx={ctx} onAdd={(n) => setKids([...kids, n])} />
    </div>
  );
}

/** AND / OR pill between siblings. Clicking it flips the whole group. */
function Connector({ isOr, onClick, disabled }: { isOr: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <div className={cn("flex-1 border-t", isOr ? "border-blue-500/30" : "border-zinc-700/60")} />
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        title="Switch between ALL (and) and ANY (or)"
        className={cn(
          "px-2.5 py-px rounded-full text-[10px] font-bold uppercase tracking-wider transition-colors",
          isOr ? "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30" : "bg-zinc-700/50 text-zinc-400 hover:bg-zinc-700/70",
        )}
      >
        {isOr ? "OR" : "AND"}
      </button>
      <div className={cn("flex-1 border-t", isOr ? "border-blue-500/30" : "border-zinc-700/60")} />
    </div>
  );
}

function firstField(fields: readonly InstanceSearchField[], scope: InstanceSearchFieldScope): InstanceSearchField | undefined {
  return fields.find((f) => f.scope === scope);
}

function newPredicate(field: InstanceSearchField | undefined): Node {
  if (!field) return {};
  return { field: field.name, op: field.ops[0], value: defaultValue(field, field.ops[0]) };
}

function defaultValue(field: InstanceSearchField, op: InstanceSearchOp): unknown {
  if (op === "in" || op === "not_in") return [];
  if (op === "between") return [null, null];
  if (field.type === "bool") return true;
  if (field.type === "enum") return field.enum?.[0] ?? "";
  if (field.type === "int" || field.type === "float") return null;
  return "";
}

function AddRow({
  scope,
  depth,
  ctx,
  onAdd,
}: {
  scope: InstanceSearchFieldScope;
  depth: number;
  ctx: BlockContext;
  onAdd: (n: Node) => void;
}) {
  const btn = (label: string, node: () => Node, title: string) => (
    <Button
      key={label}
      type="button"
      size="sm"
      variant="outline"
      className="h-6 px-2 text-2xs"
      disabled={ctx.disabled || depth >= 6}
      title={title}
      onClick={() => onAdd(node())}
    >
      {label}
    </Button>
  );
  return (
    <div className="flex flex-wrap gap-1 pt-2">
      {btn("+ Condition", () => newPredicate(firstField(ctx.fields, scope)), "Add a condition")}
      {btn("+ Group", () => ({ or: [newPredicate(firstField(ctx.fields, scope))] }), "Add a nested group (any / all of)")}
      {scope === "instance" && (
        <>
          {btn("+ A player…", () => ({ any_player: { and: [newPredicate(firstField(ctx.fields, "player"))] } }), "Some player in the run matches all of these")}
          {btn("+ Count players…", () => ({ count_players: { where: { and: [newPredicate(firstField(ctx.fields, "player"))] }, op: ">=", value: 1 } }), "How many players match")}
          {btn("+ A pull…", () => ({ any_encounter: { and: [newPredicate(firstField(ctx.fields, "encounter"))] } }), "Some pull (encounter) matches all of these")}
          {btn("+ Count pulls…", () => ({ count_encounters: { where: { and: [newPredicate(firstField(ctx.fields, "encounter"))] }, op: ">=", value: 1 } }), "How many pulls match")}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* One block                                                           */
/* ------------------------------------------------------------------ */

function NodeBlock({
  node,
  scope,
  depth,
  ctx,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  node: Node;
  scope: InstanceSearchFieldScope;
  depth: number;
  ctx: BlockContext;
  onChange: (n: Node) => void;
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const negated = node.not !== undefined;
  const inner = node.not ?? node;
  const setInner = (n: Node) => onChange(negated ? { not: n } : n);
  const toggleNot = () => onChange(negated ? inner : { not: inner });

  const toolbar = (content: ReactNode) => (
    <div className="flex items-center gap-2 min-w-0">
      <div className="shrink-0 flex flex-col -my-1">
        <button type="button" disabled={!onMoveUp || ctx.disabled} onClick={onMoveUp} className="text-[10px] leading-none text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:cursor-default p-0.5" aria-label="Move up">▲</button>
        <button type="button" disabled={!onMoveDown || ctx.disabled} onClick={onMoveDown} className="text-[10px] leading-none text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:cursor-default p-0.5" aria-label="Move down">▼</button>
      </div>
      <button
        type="button"
        disabled={ctx.disabled}
        onClick={toggleNot}
        className={cn(
          "shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider transition-colors",
          negated ? "bg-red-500/20 text-red-400 hover:bg-red-500/30" : "bg-zinc-700/30 text-zinc-500 hover:bg-zinc-700/50 hover:text-zinc-300",
        )}
        title={negated ? "Click to remove NOT" : "Click to negate"}
      >
        {negated ? "NOT" : "IS"}
      </button>
      <div className="flex-1 min-w-0 flex flex-wrap items-center gap-1.5">{content}</div>
      {ctx.costs && <BlockCost node={node} costs={ctx.costs} />}
      <Button className="shrink-0 h-7 w-7 p-0" variant="ghost" size="sm" disabled={ctx.disabled} onClick={onRemove} aria-label="Remove">✕</Button>
    </div>
  );

  // Group
  if (inner.and !== undefined || inner.or !== undefined) {
    const isOr = inner.or !== undefined;
    return (
      <div className={cn("rounded-lg border p-2 space-y-1.5", isOr ? "border-blue-500/30 bg-blue-500/[0.04]" : "border-border/60 bg-background/40")}>
        {toolbar(
          <span className="text-xs text-muted-foreground">
            Match <GroupKind isOr={isOr} disabled={ctx.disabled} onChange={(or) => setInner(or ? { or: [...(inner.and ?? [])] } : { and: [...(inner.or ?? [])] })} /> of:
          </span>,
        )}
        <div className="pl-5">
          <GroupBody group={inner} scope={scope} depth={depth + 1} onChange={setInner} ctx={ctx} />
        </div>
      </div>
    );
  }

  // Quantifiers
  const quant = quantifierOf(inner);
  if (quant) {
    const childScope: InstanceSearchFieldScope = quant.list === "players" ? "player" : "encounter";
    const where = asGroup(quant.where);
    const rebuild = (count: InstanceSearchCount | null, w: Node) => setInner(makeQuantifier(quant.list, count, w));
    return (
      <div className="rounded-lg border border-violet-500/30 bg-violet-500/[0.04] p-2 space-y-1.5">
        {toolbar(
          <>
            <select
              className={NATIVE_SELECT}
              disabled={ctx.disabled}
              value={quant.count ? "count" : "any"}
              onChange={(e) => rebuild(e.target.value === "count" ? { op: ">=", value: 1 } : null, where)}
            >
              <option value="any">{quant.list === "players" ? "A player where" : "A pull where"}</option>
              <option value="count">{quant.list === "players" ? "Number of players where" : "Number of pulls where"}</option>
            </select>
            {quant.count && (
              <>
                <select
                  className={NATIVE_SELECT}
                  disabled={ctx.disabled}
                  value={quant.count.op}
                  onChange={(e) => rebuild({ ...quant.count!, op: e.target.value as InstanceSearchOp }, where)}
                >
                  {(["=", "!=", "<", "<=", ">", ">="] as InstanceSearchOp[]).map((op) => (
                    <option key={op} value={op}>{OP_LABELS[op]}</option>
                  ))}
                </select>
                <NumberInput
                  value={quant.count.value}
                  min={0}
                  disabled={ctx.disabled}
                  onChange={(v) => rebuild({ ...quant.count!, value: Math.max(0, Math.round(v ?? 0)) }, where)}
                />
              </>
            )}
            <span className="text-2xs text-muted-foreground">
              {quant.list === "players" ? "Every condition inside refers to the same player." : "Every condition inside refers to the same pull."}
            </span>
          </>,
        )}
        <div className="pl-5">
          <GroupBody group={where} scope={childScope} depth={depth + 1} onChange={(w) => rebuild(quant.count, w)} ctx={ctx} />
        </div>
      </div>
    );
  }

  // Predicate
  return (
    <div className="@container flex flex-col gap-1.5 p-2 rounded border border-border/60 bg-background/40">
      {toolbar(<PredicateEditor node={inner} scope={scope} ctx={ctx} onChange={setInner} />)}
      <PredicateOptions node={inner} ctx={ctx} onChange={setInner} />
    </div>
  );
}

/**
 * What a block adds to the search's cost, everything nested in it included,
 * coloured on the same scale as the total. Unfinished conditions (no value
 * yet) aren't sent, so they cost nothing.
 */
function BlockCost({ node, costs }: { node: Node; costs: InstanceSearchFieldsResponse }) {
  const pruned = prune(node);
  const cost = pruned ? nodeCost(pruned, costs) : 0;
  if (cost === 0) return null;
  const style = COMPLEXITY_STYLE[complexity(cost, null).level];
  return (
    <span
      className={cn("shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] tabular-nums ring-1", style.pill, style.text)}
      title={`This block adds ${cost} to the search's cost`}
    >
      +{cost}
    </span>
  );
}

function GroupKind({ isOr, onChange, disabled }: { isOr: boolean; onChange: (or: boolean) => void; disabled?: boolean }) {
  return (
    <select className={cn(NATIVE_SELECT, "mx-1")} disabled={disabled} value={isOr ? "or" : "and"} onChange={(e) => onChange(e.target.value === "or")}>
      <option value="and">ALL</option>
      <option value="or">ANY</option>
    </select>
  );
}

interface Quantifier {
  list: "players" | "encounters";
  count: InstanceSearchCount | null;
  where: Node | undefined;
}

function quantifierOf(n: Node): Quantifier | null {
  if (n.any_player) return { list: "players", count: null, where: n.any_player };
  if (n.any_encounter) return { list: "encounters", count: null, where: n.any_encounter };
  if (n.count_players) return { list: "players", count: n.count_players, where: n.count_players.where };
  if (n.count_encounters) return { list: "encounters", count: n.count_encounters, where: n.count_encounters.where };
  return null;
}

function makeQuantifier(list: Quantifier["list"], count: InstanceSearchCount | null, where: Node): Node {
  if (!count) return list === "players" ? { any_player: where } : { any_encounter: where };
  const c = { op: count.op, value: count.value, where };
  return list === "players" ? { count_players: c } : { count_encounters: c };
}

function asGroup(n: Node | undefined): Node {
  if (!n) return { and: [] };
  return n.and !== undefined || n.or !== undefined ? n : { and: [n] };
}

/* ------------------------------------------------------------------ */
/* Predicates                                                          */
/* ------------------------------------------------------------------ */

const MS_PER_MINUTE = 60_000;

function PredicateEditor({
  node,
  scope,
  ctx,
  onChange,
}: {
  node: Node;
  scope: InstanceSearchFieldScope;
  ctx: BlockContext;
  onChange: (n: Node) => void;
}) {
  // "Spec" covers both player.spec and player.sub_spec: the picker decides
  // which one a block is from what the user clicks.
  const options = ctx.fields.filter((f) => f.scope === scope && f.name !== SUB_SPEC_FIELD);
  const field = ctx.fields.find((f) => f.name === node.field) ?? options[0];
  if (!field) return null;
  const op = (node.op && field.ops.includes(node.op) ? node.op : field.ops[0]) as InstanceSearchOp;
  const specLike = field.name === SPEC_FIELD || field.name === SUB_SPEC_FIELD;
  const list = op === "in" || op === "not_in";

  const setField = (name: string) => {
    if (name === SPEC_FIELD && specLike) return;
    const next = ctx.fields.find((f) => f.name === name);
    if (next) onChange(newPredicate(next));
  };
  const setOp = (nextOp: InstanceSearchOp) => {
    const shape = (o: InstanceSearchOp) => (o === "in" || o === "not_in" ? "list" : o === "between" ? "range" : "one");
    let value = node.value;
    if (shape(nextOp) !== shape(op)) {
      // Keep the typed value where it fits: x -> [x, ...] and [x, ...] -> x.
      if (shape(nextOp) === "range" && shape(op) === "one") value = [node.value ?? null, null];
      else if (shape(op) === "range" && shape(nextOp) === "one") value = Array.isArray(node.value) ? (node.value[0] ?? null) : null;
      else value = defaultValue(field, nextOp);
    }
    onChange({ ...node, op: nextOp, value });
  };

  return (
    <>
      <SelectCombo
        className="w-40"
        value={specLike ? SPEC_FIELD : field.name}
        options={fieldOptions(options)}
        onChange={setField}
        disabled={ctx.disabled}
        placeholder="Search fields…"
        title={field.doc}
      />
      <select className={NATIVE_SELECT} disabled={ctx.disabled} value={op} onChange={(e) => setOp(e.target.value as InstanceSearchOp)}>
        {field.ops.map((o) => (
          <option key={o} value={o}>{OP_LABELS[o]}</option>
        ))}
      </select>
      {specLike && !list ? (
        <SpecOrSubSpecPicker node={{ ...node, op }} onChange={onChange} disabled={ctx.disabled} />
      ) : (
        <ValueEditor field={field} op={op} value={node.value} ctx={ctx} onChange={(value) => onChange({ ...node, field: field.name, op, value })} />
      )}
    </>
  );
}

/** The field picker's options: grouped, searchable by name and description. */
function fieldOptions(fields: readonly InstanceSearchField[]): ComboOption[] {
  return fields
    .map((f, i) => ({ f, i, ...fieldGroup(f.name) }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map(({ f, group }) => ({
      value: f.name,
      label: fieldLabel(f.name),
      group,
      // Spec also covers sub-specs (Bear / Cat, Tank / DPS, Fury Prot).
      keywords: `${f.name} ${f.doc}${f.name === SPEC_FIELD ? " sub-spec bear cat tank dps fury prot" : ""}`,
    }));
}

/** Combobox options per field. Add a field here to give its block a picker. */
function suggestionsFor(field: InstanceSearchField, ctx: BlockContext): readonly Suggestion[] {
  switch (field.name) {
    case "instance.name":
      return ctx.zones;
    case "encounter.name":
      return ctx.bosses;
    case "instance.realm":
      return ctx.realms ?? [];
    default:
      return [];
  }
}

function ValueEditor({
  field,
  op,
  value,
  ctx,
  onChange,
}: {
  field: InstanceSearchField;
  op: InstanceSearchOp;
  value: unknown;
  ctx: BlockContext;
  onChange: (v: unknown) => void;
}) {
  const list = op === "in" || op === "not_in";
  const disabled = ctx.disabled;

  // Class, spec and sub-spec get the icon pickers instead of plain inputs.
  if (field.name === "player.class") {
    if (list) {
      const opts = (field.enum ?? []).filter((c) => c !== "UNKNOWN").map((c) => ({ value: c, label: classLabel(c), icon: <ClassIcon cls={c.replace(/_/g, "")} className="h-3.5 w-3.5 rounded-sm" /> }));
      return <ToggleChips options={opts} values={Array.isArray(value) ? (value as string[]) : []} onChange={onChange} disabled={disabled} />;
    }
    return (
      <ClassSpecPicker
        depth="class"
        allowAny={false}
        allowedClasses={field.enum}
        value={{ ...ANY_CLASS_SPEC, class: typeof value === "string" ? value : "" }}
        onChange={(v) => onChange(v.class)}
        disabled={disabled}
      />
    );
  }

  if (field.type === "enum") {
    const opts = (field.enum ?? []).map((v) => ({ value: v, label: enumLabel(v) }));
    if (list) return <ToggleChips options={opts} values={Array.isArray(value) ? (value as string[]) : []} onChange={onChange} disabled={disabled} />;
    return (
      <select className={NATIVE_SELECT} disabled={disabled} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)}>
        {opts.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    );
  }
  if (field.type === "bool") {
    return (
      <select className={NATIVE_SELECT} disabled={disabled} value={value === false ? "false" : "true"} onChange={(e) => onChange(e.target.value === "true")}>
        <option value="true">yes</option>
        <option value="false">no</option>
      </select>
    );
  }
  if (op === "between" && (field.type === "int" || field.type === "float" || field.type === "time")) {
    // A range: from / to. Dates cover whole days (to = end of that day).
    const [lo, hi] = Array.isArray(value) ? value : [null, null];
    const unit = field.unit === "ms" ? "min" : null;
    return (
      <span className="inline-flex items-center gap-1 flex-wrap">
        <ScalarInput field={field} value={lo} disabled={disabled} onChange={(v) => onChange([v, hi ?? null])} />
        <span className="text-2xs text-muted-foreground">to</span>
        <ScalarInput field={field} value={hi} disabled={disabled} endOfDay onChange={(v) => onChange([lo ?? null, v])} />
        {unit && <span className="text-2xs text-muted-foreground">{unit}</span>}
      </span>
    );
  }
  if (field.type === "int" || field.type === "float" || field.type === "time") {
    return (
      <span className="inline-flex items-center gap-1">
        <ScalarInput field={field} value={value} disabled={disabled} onChange={onChange} />
        {field.unit === "ms" && <span className="text-2xs text-muted-foreground">min</span>}
      </span>
    );
  }
  // string / uuid
  if (list) {
    return (
      <ChipInput
        className="flex-1 min-w-[140px]"
        values={Array.isArray(value) ? (value as string[]) : []}
        onChange={onChange}
        suggestions={suggestionsFor(field, ctx)}
        placeholder="type and press Enter"
        disabled={disabled}
      />
    );
  }
  return (
    <SuggestInput
      className="flex-1 min-w-[120px]"
      value={typeof value === "string" ? value : ""}
      onChange={onChange}
      suggestions={suggestionsFor(field, ctx)}
      disabled={disabled}
    />
  );
}

/**
 * One number or date. Durations (ms) are edited in minutes. Dates are whole
 * days: the start of the day, or with endOfDay the last second of it (the
 * "to" end of an inclusive range).
 */
function ScalarInput({
  field,
  value,
  disabled,
  endOfDay,
  onChange,
}: {
  field: InstanceSearchField;
  value: unknown;
  disabled?: boolean;
  endOfDay?: boolean;
  onChange: (v: unknown) => void;
}) {
  if (field.type === "time") {
    const day = typeof value === "string" ? value.slice(0, 10) : "";
    return (
      <Input
        type="date"
        className="h-7 text-xs w-36"
        disabled={disabled}
        value={day}
        onChange={(e) => onChange(e.target.value ? `${e.target.value}${endOfDay ? "T23:59:59Z" : "T00:00:00Z"}` : null)}
      />
    );
  }
  const isMs = field.unit === "ms";
  const n = typeof value === "number" ? value : null;
  return (
    <NumberInput
      value={n == null ? null : isMs ? n / MS_PER_MINUTE : n}
      step={isMs ? 0.5 : field.type === "int" ? 1 : 0.1}
      disabled={disabled}
      placeholder={field.unit === "0-100" ? "0-100" : undefined}
      onChange={(v) => onChange(v == null ? null : isMs ? Math.round(v * MS_PER_MINUTE) : field.type === "int" ? Math.round(v) : v)}
    />
  );
}

const SPEC_FIELD = "player.spec";
const SUB_SPEC_FIELD = "player.sub_spec";

/**
 * One picker for spec and sub-spec. It shows Class > Spec, with sub-specs
 * where the site records them. Clicking a spec (or "Any <spec>") makes the
 * block a player.spec condition; clicking a sub-spec makes it player.sub_spec.
 * The stored value is just the name, so it matches that spec on any class;
 * add a class condition to pin the class.
 */
function SpecOrSubSpecPicker({ node, onChange, disabled }: { node: Node; onChange: (n: Node) => void; disabled?: boolean }) {
  const subSpecs = useSubSpecs();
  const value = typeof node.value === "string" ? node.value : "";
  const isSub = node.field === SUB_SPEC_FIELD;
  if (isSub && subSpecs.size === 0) {
    // This site records no sub-specs; keep a shared query editable as text.
    return <SuggestInput className="flex-1 min-w-[120px]" value={value} onChange={(v) => onChange({ ...node, value: v })} disabled={disabled} />;
  }
  let current: ClassSpec = isSub ? { ...ANY_CLASS_SPEC, subSpec: value } : { ...ANY_CLASS_SPEC, spec: value };
  if (isSub) {
    // Sub-spec names belong to one class and spec (Bear -> Feral Druid), so
    // show them in full.
    for (const [key, subs] of subSpecs) {
      if (subs.includes(value)) {
        const [cls, spec] = key.split("/");
        current = { class: cls, spec, subSpec: value };
        break;
      }
    }
  }
  return (
    <ClassSpecPicker
      depth={subSpecs.size ? "subspec" : "spec"}
      allowAny={false}
      requireSpec
      placeholder="Pick a spec"
      value={current}
      onChange={(v) => {
        if (v.subSpec) onChange({ ...node, field: SUB_SPEC_FIELD, value: v.subSpec });
        else if (v.spec) onChange({ ...node, field: SPEC_FIELD, value: v.spec });
      }}
      disabled={disabled}
    />
  );
}

function PredicateOptions({ node, ctx, onChange }: { node: Node; ctx: BlockContext; onChange: (n: Node) => void }) {
  const field = ctx.fields.find((f) => f.name === node.field);
  if (!field || !(field.bosses || field.parse_scope || field.metric || field.on)) return null;
  const on = node.on ?? "bosses";
  const showBosses = field.bosses && on === "bosses";
  const set = (patch: Partial<Node>) => {
    const next: Record<string, unknown> = { ...node, ...patch };
    for (const k of Object.keys(patch)) if (next[k] === undefined) delete next[k];
    onChange(next as Node);
  };

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-12">
      {field.on && (
        <span className="inline-flex items-center gap-1">
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground">in:</span>
          <Segmented
            options={ON_OPTIONS}
            value={on}
            disabled={ctx.disabled}
            onChange={(v) => set({ on: v === "bosses" ? undefined : v, ...(v !== "bosses" ? { bosses: undefined, match: undefined } : {}) })}
          />
        </span>
      )}
      {showBosses && (
        <span className="inline-flex items-center gap-1 flex-1 min-w-[220px]">
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground">bosses:</span>
          <ChipInput
            className="flex-1"
            values={node.bosses ?? []}
            suggestions={ctx.bosses}
            placeholder="any boss"
            disabled={ctx.disabled}
            onChange={(b) => set({ bosses: b.length ? b : undefined, ...(b.length ? {} : { match: undefined }) })}
          />
          {(node.bosses?.length ?? 0) > 1 && (
            <Segmented options={MATCH_OPTIONS} value={node.match ?? "any"} disabled={ctx.disabled} onChange={(m) => set({ match: m === "any" ? undefined : m })} title="any = at least one boss, each = every listed boss" />
          )}
        </span>
      )}
      {field.parse_scope && (
        <span className="inline-flex items-center gap-1">
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground">vs:</span>
          <Segmented options={PARSE_SCOPE_OPTIONS} value={node.parse_scope ?? "server"} disabled={ctx.disabled} onChange={(v) => set({ parse_scope: v === "server" ? undefined : v })} />
        </span>
      )}
      {field.metric && (
        <Segmented options={METRIC_OPTIONS} value={node.metric ?? "dps"} disabled={ctx.disabled} onChange={(v) => set({ metric: v === "dps" ? undefined : v })} />
      )}
    </div>
  );
}
