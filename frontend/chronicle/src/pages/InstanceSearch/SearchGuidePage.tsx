import { useMemo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Blocks, Check, Code2, ListFilter, Loader2, Lock, Search } from "lucide-react";
import type { InstanceSearchField, InstanceSearchFieldScope } from "@/api/typesGenerated";
import { TIER_COLOR } from "@/pages/Settings/billingPricing";
import { ToolsBackLink } from "@/pages/Tools/ToolsBackLink";
import { CelCode } from "./CelCode";
import { CEL_CHEATSHEET } from "./celCheatsheet";
import { EXAMPLES } from "./examples";
import { OP_LABELS, fieldLabel } from "./fieldLabels";
import { honoredFields, treeNeedsHonored } from "./fieldTiers";
import { encodeQuery, formatCEL } from "./queryModel";
import { useSearchFields } from "./searchApi";

/** Tools & FAQ guide for instance search (/search/guide). */
export function SearchGuidePage() {
  const fields = useSearchFields();
  const honored = useMemo(() => honoredFields(fields.data?.fields), [fields.data]);
  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <ToolsBackLink className="mb-5" />

      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="mb-2 text-3xl font-bold">How Instance Search Works</h1>
          <p className="text-muted-foreground">Find raids by zone, bosses, speed, parses and roster, and see why each one matched.</p>
        </div>
        <Link to="/search" className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <Search className="h-4 w-4" /> Open instance search
        </Link>
      </div>

      <Section title="What it searches">
        <p>
          Every finished, listed run on this site, newest first. Duplicate uploads of the same night show once. Clicking a
          run opens it in a new tab, and the search is saved in the page address, so you can share or bookmark it.
        </p>
      </Section>

      <Section title="Three ways to build a search">
        <div className="grid gap-3 sm:grid-cols-3">
          <ModeCard icon={<ListFilter className="h-4 w-4" />} title="Form">
            Reads as a sentence: &quot;Find Molten Core runs by any guild&hellip; where Ragnaros died&quot;. Click any part
            to change it, and use <em>Add a condition</em> for bosses, parses, speed, roster and log capabilities.
          </ModeCard>
          <ModeCard icon={<Blocks className="h-4 w-4" />} title="Blocks">
            Combine any conditions with and, or and not, and put conditions on a single player or pull.
          </ModeCard>
          <ModeCard icon={<Code2 className="h-4 w-4" />} title="Code" honored>
            The same search as text, coloured as you type. Blocks and code convert into each other.
          </ModeCard>
        </div>
      </Section>

      <Section title="Why it matched">
        <p>
          Click the arrow at the start of a result to see each condition with a check or a cross, and the run&apos;s
          real values: the parse on each boss, the clear time, and for player and pull conditions, who or which pull
          counted. A question mark means the run has no value for that condition (for example clear time on a run
          that isn&apos;t a full clear).
        </p>
      </Section>

      <Section title="How matching works">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong>Text ignores case.</strong> <em>is</em> matches the whole name; <em>contains</em> matches part of it
            (<code>molten</code> finds Molten Core) and <em>starts with</em> the beginning.
          </li>
          <li>
            <strong>Player blocks are one player.</strong> Every condition inside &quot;A player where&quot; must hold for
            the same player, so <em>Sub-spec is Bear</em> and <em>Sub-spec is Cat</em> together find a druid who played
            both. The same goes for &quot;A pull where&quot; and a single attempt.
          </li>
          <li>
            <strong>Count blocks</strong> compare how many players or pulls match, like at least 2 Holy Paladins or at
            most 1 wipe.
          </li>
          <li>
            <strong>Per-fight data</strong> (spec, role, DPS, HPS, deaths, item level) comes from boss kills unless you
            choose <em>trash</em> or <em>any</em>.
          </li>
          <li>
            <strong>Boss lists</strong> match on <em>any</em> of the bosses by default, or on <em>each</em> of them.
            Parses compare against the <em>server</em>, <em>realm</em> or <em>guild</em>.
          </li>
          <li>
            <strong>Ranges</strong> (<em>between</em>) include both ends. Date ranges cover whole days. Durations are
            entered in minutes.
          </li>
          <li>
            <strong>Missing values never match</strong>, even under <em>not</em>: &quot;not a clear time over an
            hour&quot; skips runs that aren&apos;t full clears.
          </li>
        </ul>
      </Section>

      <Section title="Code syntax">
        <ul className="divide-y divide-border/50 rounded-lg border bg-zinc-950/60 px-3">
          {CEL_CHEATSHEET.map(([code, note]) => (
            <li key={code} className="py-2">
              <code className="block whitespace-pre-wrap break-words font-mono text-xs">
                <CelCode code={code} />
              </code>
              <span className="text-xs">{note}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-sm">Press Ctrl/⌘ + Enter to run a search from the code box.</p>
      </Section>

      <Section title="Examples">
        <div className="space-y-3">
          {EXAMPLES.map((ex) => (
            <div key={ex.id} className="rounded-lg border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="flex flex-wrap items-center gap-2 font-semibold text-foreground">
                    {ex.title}
                    {treeNeedsHonored(ex.where, honored) && <HonoredBadge />}
                  </h3>
                  <p className="text-sm">{ex.description}</p>
                </div>
                <Link
                  to={`/search?q=${encodeQuery(ex.where)}&mode=code`}
                  className="inline-flex shrink-0 items-center gap-1 text-xs text-primary hover:underline"
                >
                  Open in search <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-md bg-zinc-950/60 p-2.5 font-mono text-[11px] leading-relaxed styled-scrollbar">
                <CelCode code={formatCEL(ex.where)} />
              </pre>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Field reference">
        <FieldReference />
      </Section>

      <Section title="Who gets what">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong>Logged out:</strong> zone, guild, realm, date, difficulty and raid or dungeon, up to 6 conditions
            combined with and, showing the first 25 results.{" "}
            <Link to="/login" className="text-primary hover:underline">Log in</Link> for the rest.
          </li>
          <li>
            <strong>Logged in:</strong> the form, Blocks, Examples and &quot;why it matched&quot;, with every condition
            except the Honored ones below.
          </li>
          <li>
            <strong style={{ color: TIER_COLOR.honored }}>Honored supporters</strong> and above: the Code editor, and the
            costly conditions: player parse, DPS, HPS and item level, and boss, trash and idle time. They&apos;re marked{" "}
            <HonoredBadge /> in the examples and field reference.{" "}
            <Link to="/supporter" className="text-primary hover:underline">Become a supporter</Link>. Without Honored you
            can still open a shared search or example that uses them to read it, but you can&apos;t run it: Chronicle
            refuses searches that use an Honored condition anywhere, including through AI keys and the API. The Code lock
            is only on the editor: it doesn&apos;t limit which kinds of searches you can run.
          </li>
          <li>
            <strong>Search budget:</strong> searches spend from a budget that refills over time; the search page shows
            what each search will cost before you run it. Complex searches, like parses across many players, cost more,
            and higher supporter tiers get a bigger budget.
          </li>
        </ul>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-xl font-semibold">{title}</h2>
      <div className="text-muted-foreground">{children}</div>
    </section>
  );
}

function ModeCard({ icon, title, honored, children }: { icon: ReactNode; title: string; honored?: boolean; children: ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="mb-1.5 flex items-center gap-2 font-semibold text-foreground">
        {icon}
        {title}
        {honored ? (
          <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: TIER_COLOR.honored }}>
            <Lock className="h-3 w-3" /> Honored
          </span>
        ) : (
          <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
            <Check className="h-3 w-3" /> Free
          </span>
        )}
      </h3>
      <p className="text-sm">{children}</p>
    </div>
  );
}

function HonoredBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: TIER_COLOR.honored }}>
      <Lock className="h-3 w-3" /> Honored
    </span>
  );
}

const SCOPES: { scope: InstanceSearchFieldScope; title: string; note: string }[] = [
  { scope: "instance", title: "Run", note: "Used directly, outside player and pull blocks." },
  { scope: "player", title: "Player", note: "Used inside A player where / Count players." },
  { scope: "encounter", title: "Pull", note: "Used inside A pull where / Count pulls." },
];

/** Every searchable field, from the live field list. */
function FieldReference() {
  const fields = useSearchFields();
  if (fields.isLoading) return <Loader2 className="h-5 w-5 animate-spin" />;
  if (!fields.data) return <p className="text-sm">Couldn&apos;t load the field list.</p>;
  return (
    <div className="space-y-6">
      {SCOPES.map(({ scope, title, note }) => (
        <div key={scope}>
          <h3 className="font-semibold text-foreground">{title}</h3>
          <p className="mb-2 text-xs">{note}</p>
          <div className="overflow-x-auto rounded-lg border styled-scrollbar">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border/70">
                {fields.data.fields
                  .filter((f) => f.scope === scope)
                  .map((f) => (
                    <tr key={f.name} className="align-top">
                      <td className="w-48 px-3 py-2">
                        <div className="flex flex-wrap items-center gap-1.5 font-medium text-foreground">
                          {fieldLabel(f.name)}
                          {f.minimum_tier === "honored" && <HonoredBadge />}
                        </div>
                        <code className="text-[11px] text-muted-foreground">{f.name}</code>
                      </td>
                      <td className="px-3 py-2">
                        <p>{f.doc}</p>
                        <p className="mt-1 text-[11px]">{fieldDetails(f)}</p>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

function fieldDetails(f: InstanceSearchField): string {
  const parts = [f.unit === "ms" ? "duration" : f.unit === "0-100" ? "0-100" : f.type === "enum" ? `one of ${f.enum?.length ?? 0} values` : f.type];
  parts.push(f.ops.map((o) => OP_LABELS[o]).join(", "));
  const opts = [f.bosses && "bosses (any / each)", f.parse_scope && "vs server / realm / guild", f.metric && "DPS or HPS", f.on && "bosses / trash / any fight"].filter(Boolean);
  if (opts.length) parts.push(`options: ${opts.join(", ")}`);
  if (f.anonymous) parts.push("available logged out");
  return parts.join(" · ");
}
