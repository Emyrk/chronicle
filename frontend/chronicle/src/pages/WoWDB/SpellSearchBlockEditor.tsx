import { useMemo } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput, NATIVE_SELECT, ToggleChips } from "@/pages/InstanceSearch/controls";
import { cn } from "@/lib/utils";
import type { SpellSearchDraft, SpellSearchNode, SpellSearchOp, SpellSearchScope } from "./spellSearchModel";

export type { SpellSearchDraft, SpellSearchNode, SpellSearchOp, SpellSearchScope } from "./spellSearchModel";

type FieldType = "text" | "number" | "enum" | "set";
interface FieldDefinition {
  name: string;
  label: string;
  scope: SpellSearchScope;
  type: FieldType;
  ops: SpellSearchOp[];
  values?: string[];
  placeholder?: string;
  unit?: string;
}

const FIELDS: FieldDefinition[] = [
  { name: "spell.name", label: "Name", scope: "spell", type: "text", ops: ["contains", "=", "!="], placeholder: "Frostbolt" },
  { name: "spell.id", label: "Spell ID", scope: "spell", type: "number", ops: ["=", "!=", "<", "<=", ">", ">="] },
  { name: "spell.school", label: "School", scope: "spell", type: "set", ops: ["has", "in"], values: ["Physical", "Holy", "Fire", "Nature", "Frost", "Shadow", "Arcane"] },
  { name: "spell.attributes", label: "Attribute", scope: "spell", type: "set", ops: ["has"], values: ["Passive", "Channeled", "Cannot crit", "Hidden", "Unaffected by invulnerability"] },
  { name: "spell.base_level", label: "Base level", scope: "spell", type: "number", ops: ["=", "!=", "<", "<=", ">", ">="] },
  { name: "spell.mechanic", label: "Mechanic", scope: "spell", type: "enum", ops: ["=", "!=", "in"], values: ["None", "Charm", "Fear", "Root", "Silence", "Stun", "Snare"] },
  { name: "spell.dispel_type", label: "Dispel type", scope: "spell", type: "enum", ops: ["=", "!=", "in"], values: ["None", "Magic", "Curse", "Disease", "Poison"] },
  { name: "spell.proc_chance", label: "Proc chance", scope: "spell", type: "number", ops: ["=", "!=", "<", "<=", ">", ">="], unit: "%" },
  { name: "effect.type", label: "Effect type", scope: "effect", type: "enum", ops: ["=", "!=", "in"], values: ["Apply aura", "School damage", "Heal", "Trigger spell", "Create item"] },
  { name: "effect.aura", label: "Aura type", scope: "effect", type: "enum", ops: ["=", "!=", "in"], values: ["Mod stat", "Periodic damage", "Periodic heal", "Mod damage done", "Mod resistance"] },
  { name: "effect.value", label: "Computed value", scope: "effect", type: "number", ops: ["=", "!=", "<", "<=", ">", ">="] },
  { name: "effect.base_points", label: "Base points", scope: "effect", type: "number", ops: ["=", "!=", "<", "<=", ">", ">="] },
  { name: "effect.trigger_spell", label: "Triggered spell ID", scope: "effect", type: "number", ops: ["=", "!="] },
  { name: "power.type", label: "Power type", scope: "power", type: "enum", ops: ["=", "!=", "in"], values: ["Mana", "Rage", "Focus", "Energy", "Runic power"] },
  { name: "power.cost", label: "Power cost", scope: "power", type: "number", ops: ["=", "!=", "<", "<=", ">", ">="] },
];

const OP_LABELS: Record<SpellSearchOp, string> = {
  "=": "is",
  "!=": "is not",
  "<": "is less than",
  "<=": "is at most",
  ">": "is greater than",
  ">=": "is at least",
  contains: "contains",
  in: "is one of",
  has: "includes",
};

export function SpellSearchBlockEditor({ draft, onChange, disabled = false }: { draft: SpellSearchDraft; onChange: (draft: SpellSearchDraft) => void; disabled?: boolean }) {
  const root = draft.where.and || draft.where.or ? draft.where : { and: [draft.where] };
  return (
    <fieldset disabled={disabled} className={cn("space-y-4", disabled && "opacity-65")}>
      <div className="rounded-lg border border-border/60 bg-background/40 p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Evaluate at level</label>
            <NumberInput value={draft.context.level} onChange={(level) => onChange({ ...draft, context: { ...draft.context, level } })} min={1} max={255} placeholder="Raw" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Difficulty ID</label>
            <NumberInput value={draft.context.difficulty} onChange={(difficulty) => onChange({ ...draft, context: { ...draft.context, difficulty: Math.max(0, Math.round(difficulty ?? 0)) } })} min={0} />
          </div>
          <p className="max-w-lg pb-1 text-xs text-muted-foreground">
            Level calculates scaled effect values. Difficulty selects the matching effects and variant fields, with difficulty 0 as the base spell.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-border/60 bg-background/25 p-3 sm:p-4">
        <GroupEditor group={root} scope="spell" depth={0} onChange={(where) => onChange({ ...draft, where })} />
      </div>
    </fieldset>
  );
}

function GroupEditor({ group, scope, depth, onChange }: { group: SpellSearchNode; scope: SpellSearchScope; depth: number; onChange: (node: SpellSearchNode) => void }) {
  const isOr = group.or !== undefined;
  const children = group.and ?? group.or ?? [];
  const setChildren = (next: SpellSearchNode[]) => onChange(isOr ? { or: next } : { and: next });
  const add = (node: SpellSearchNode) => setChildren([...children, node]);

  return (
    <div>
      {children.length > 1 && (
        <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
          <span>Match</span>
          <select className={NATIVE_SELECT} value={isOr ? "or" : "and"} onChange={(event) => onChange(event.target.value === "or" ? { or: children } : { and: children })}>
            <option value="and">ALL</option>
            <option value="or">ANY</option>
          </select>
          <span>conditions in this group</span>
        </div>
      )}
      {children.length === 0 && (
        <div className="rounded-md border border-dashed border-border/70 bg-muted/10 px-4 py-5">
          <p className="text-sm font-medium">Start with a spell property or related row.</p>
          <p className="mt-1 text-xs text-muted-foreground">Effect and power blocks keep every nested condition on the same database row.</p>
        </div>
      )}
      {children.map((child, index) => (
        <div key={index}>
          {index > 0 && (
            <div className="flex items-center gap-2 py-1.5">
              <div className={cn("flex-1 border-t", isOr ? "border-blue-500/30" : "border-zinc-700/60")} />
              <span className={cn("rounded-full px-2.5 py-px text-[10px] font-bold uppercase tracking-wider", isOr ? "bg-blue-500/20 text-blue-400" : "bg-zinc-700/50 text-zinc-400")}>{isOr ? "OR" : "AND"}</span>
              <div className={cn("flex-1 border-t", isOr ? "border-blue-500/30" : "border-zinc-700/60")} />
            </div>
          )}
          <NodeEditor node={child} scope={scope} depth={depth} onChange={(node) => setChildren(children.map((item, i) => i === index ? node : item))} onRemove={() => setChildren(children.filter((_, i) => i !== index))} />
        </div>
      ))}
      <div className="flex flex-wrap gap-1.5 pt-2">
        <AddButton label="Condition" onClick={() => add(newPredicate(scope))} />
        {depth < 4 && <AddButton label="Group" onClick={() => add({ or: [newPredicate(scope), newPredicate(scope)] })} />}
        {scope === "spell" && depth < 4 && (
          <>
            <AddButton label="Effect" onClick={() => add({ any_effect: { and: [newPredicate("effect")] } })} />
            <AddButton label="Power cost" onClick={() => add({ any_power: { and: [newPredicate("power")] } })} />
          </>
        )}
      </div>
    </div>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return <Button type="button" variant="outline" size="sm" className="h-7 gap-1 px-2 text-2xs" onClick={onClick}><Plus className="h-3 w-3" />{label}</Button>;
}

function NodeEditor({ node, scope, depth, onChange, onRemove }: { node: SpellSearchNode; scope: SpellSearchScope; depth: number; onChange: (node: SpellSearchNode) => void; onRemove: () => void }) {
  const negated = node.not !== undefined;
  const inner = node.not ?? node;
  const setInner = (next: SpellSearchNode) => onChange(negated ? { not: next } : next);

  if (inner.and || inner.or) {
    const isOr = inner.or !== undefined;
    return (
      <div className={cn("rounded-lg border p-2", isOr ? "border-blue-500/30 bg-blue-500/[0.04]" : "border-border/60 bg-background/40")}>
        <BlockToolbar negated={negated} onNegate={() => onChange(negated ? inner : { not: inner })} onRemove={onRemove}>
          <span className="text-xs font-medium text-muted-foreground">Nested group</span>
        </BlockToolbar>
        <div className="pl-5"><GroupEditor group={inner} scope={scope} depth={depth + 1} onChange={setInner} /></div>
      </div>
    );
  }

  const quantifier = inner.any_effect ? { label: "An effect where", scope: "effect" as const, node: inner.any_effect, key: "any_effect" as const, className: "border-violet-500/30 bg-violet-500/[0.04]", labelClassName: "text-violet-300" }
    : inner.any_power ? { label: "A power cost where", scope: "power" as const, node: inner.any_power, key: "any_power" as const, className: "border-cyan-500/30 bg-cyan-500/[0.04]", labelClassName: "text-cyan-300" }
      : null;
  if (quantifier) {
    const group = quantifier.node.and || quantifier.node.or ? quantifier.node : { and: [quantifier.node] };
    return (
      <div className={cn("rounded-lg border p-2", quantifier.className)}>
        <BlockToolbar negated={negated} onNegate={() => onChange(negated ? inner : { not: inner })} onRemove={onRemove}>
          <span className={cn("text-xs font-medium", quantifier.labelClassName)}>{quantifier.label}</span>
          <span className="text-2xs text-muted-foreground">Every condition inside refers to the same {quantifier.scope} row.</span>
        </BlockToolbar>
        <div className="pl-5"><GroupEditor group={group} scope={quantifier.scope} depth={depth + 1} onChange={(next) => setInner({ [quantifier.key]: next })} /></div>
      </div>
    );
  }

  return (
    <div className="rounded border border-border/60 bg-background/40 p-2">
      <BlockToolbar negated={negated} onNegate={() => onChange(negated ? inner : { not: inner })} onRemove={onRemove}>
        <PredicateEditor node={inner} scope={scope} onChange={setInner} />
      </BlockToolbar>
    </div>
  );
}

function BlockToolbar({ negated, onNegate, onRemove, children }: { negated: boolean; onNegate: () => void; onRemove: () => void; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <button type="button" aria-pressed={negated} title="Exclude matches for this block" onClick={onNegate} className={cn("shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 transition-colors", negated ? "bg-red-500/20 text-red-400 ring-red-500/30" : "text-zinc-500 ring-zinc-700/70 hover:text-zinc-300")}>NOT</button>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">{children}</div>
      <Button type="button" variant="ghost" size="sm" className="h-7 w-7 shrink-0 p-0" onClick={onRemove} aria-label="Remove"><X className="h-3.5 w-3.5" /></Button>
    </div>
  );
}

function PredicateEditor({ node, scope, onChange }: { node: SpellSearchNode; scope: SpellSearchScope; onChange: (node: SpellSearchNode) => void }) {
  const fields = useMemo(() => FIELDS.filter((field) => field.scope === scope), [scope]);
  const field = fields.find((candidate) => candidate.name === node.field) ?? fields[0];
  const op = field.ops.includes(node.op as SpellSearchOp) ? node.op as SpellSearchOp : field.ops[0];
  const setField = (name: string) => onChange(newPredicate(scope, name));

  return (
    <>
      <select className={cn(NATIVE_SELECT, "min-w-36")} value={field.name} onChange={(event) => setField(event.target.value)}>
        {fields.map((option) => <option key={option.name} value={option.name}>{option.label}</option>)}
      </select>
      <select className={NATIVE_SELECT} value={op} onChange={(event) => onChange({ ...node, field: field.name, op: event.target.value as SpellSearchOp, value: defaultValue(field, event.target.value as SpellSearchOp) })}>
        {field.ops.map((option) => <option key={option} value={option}>{OP_LABELS[option]}</option>)}
      </select>
      <ValueEditor field={field} op={op} value={node.value} onChange={(value) => onChange({ ...node, field: field.name, op, value })} />
    </>
  );
}

function ValueEditor({ field, op, value, onChange }: { field: FieldDefinition; op: SpellSearchOp; value: unknown; onChange: (value: unknown) => void }) {
  const list = op === "in";
  if (field.type === "number") return <span className="inline-flex items-center gap-1"><NumberInput value={typeof value === "number" ? value : null} onChange={onChange} />{field.unit && <span className="text-2xs text-muted-foreground">{field.unit}</span>}</span>;
  if (field.type === "text") return <Input className="h-7 min-w-44 flex-1 text-xs" value={typeof value === "string" ? value : ""} placeholder={field.placeholder} onChange={(event) => onChange(event.target.value)} />;
  const options = field.values ?? [];
  if (field.type === "set" || list) return <ToggleChips options={options.map((option) => ({ value: option, label: option }))} values={Array.isArray(value) ? value as string[] : typeof value === "string" && value ? [value] : []} onChange={(values) => onChange(list ? values : values.at(-1) ?? "")} />;
  return <select className={NATIVE_SELECT} value={typeof value === "string" ? value : options[0] ?? ""} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select>;
}

function newPredicate(scope: SpellSearchScope, fieldName?: string): SpellSearchNode {
  const field = FIELDS.find((candidate) => candidate.scope === scope && (!fieldName || candidate.name === fieldName)) ?? FIELDS.find((candidate) => candidate.scope === scope)!;
  const op = field.ops[0];
  return { field: field.name, op, value: defaultValue(field, op) };
}

function defaultValue(field: FieldDefinition, op: SpellSearchOp): unknown {
  if (op === "in") return [];
  if (field.type === "number") return null;
  return field.values?.[0] ?? "";
}
