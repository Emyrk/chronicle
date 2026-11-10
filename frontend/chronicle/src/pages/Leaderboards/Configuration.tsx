import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowDown,
  ArrowLeft,
  EyeOff,
  Globe,
  Layers,
  Search,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { useLeaderboardConfiguration } from "@/api/leaderboardConfiguration";
import type {
  LeaderboardConfiguration,
  LeaderboardConfigurationRow,
  LeaderboardConfigurationTenant,
} from "@/api/typesGenerated";
import { Button } from "@/components/ui/button";
import { awardFor, variantKey } from "./renownConfig";

export function ConfigurationPage() {
  const [params] = useSearchParams();
  const query = useLeaderboardConfiguration(params.get("tenant") ?? undefined);
  if (query.isPending)
    return (
      <div role="status" className="p-8 text-muted-foreground">
        Loading tenant configuration…
      </div>
    );
  if (query.isError)
    return (
      <div role="alert" className="space-y-4 p-8">
        <h1 className="text-xl font-semibold">Configuration unavailable</h1>
        <p>{query.error.message}</p>
        <Button onClick={() => void query.refetch()}>Retry</Button>
      </div>
    );
  return <ConfigurationView data={query.data} />;
}

function tenantKey(tenant: LeaderboardConfigurationTenant) {
  return tenant.slug ?? tenant.id;
}

/** Compact root-only tenant switcher. Picking a tenant resets the instance. */
export function TenantPicker({
  tenants,
  selected,
}: {
  tenants: readonly LeaderboardConfigurationTenant[];
  selected: string | null;
}) {
  const [, setParams] = useSearchParams();
  const chip = (active: boolean) =>
    `inline-flex h-8 items-center gap-2 rounded-full border pl-1 pr-3 text-xs transition-colors ${active ? "border-primary bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`;
  return (
    <nav aria-label="Tenants" className="flex flex-wrap gap-1.5">
      <button
        aria-pressed={!selected}
        onClick={() => setParams({})}
        className={chip(!selected)}
      >
        <span className="grid h-6 w-6 place-items-center rounded-full bg-muted">
          <Globe size={13} />
        </span>
        Root site
      </button>
      {tenants.map((tenant) => {
        const key = tenantKey(tenant);
        const active = selected === key || selected === tenant.id;
        return (
          <button
            key={tenant.id}
            aria-pressed={active}
            title={
              tenant.discoverable
                ? tenant.name
                : `${tenant.name} (not discoverable)`
            }
            onClick={() => setParams({ tenant: key })}
            className={chip(active)}
          >
            {tenant.square_logo ? (
              <img
                src={tenant.square_logo}
                alt=""
                className="h-6 w-6 rounded-full object-cover"
              />
            ) : (
              <span className="grid h-6 w-6 place-items-center rounded-full bg-muted font-semibold uppercase">
                {tenant.name.slice(0, 1)}
              </span>
            )}
            {tenant.name}
            {!tenant.discoverable && (
              <EyeOff size={12} aria-label="Not discoverable" />
            )}
          </button>
        );
      })}
    </nav>
  );
}

function FlavorChips({
  label,
  values,
}: {
  label: string;
  values: readonly string[];
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className="text-muted-foreground">{label}</span>
      {values.length ? (
        values.map((value) => (
          <code
            key={value}
            className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-foreground"
          >
            {value}
          </code>
        ))
      ) : (
        <span className="italic text-muted-foreground">none</span>
      )}
    </span>
  );
}

type Row = LeaderboardConfigurationRow;

/** The set that defines an instance's headline Renown total. */
const DEFAULT_SET = "default";

/**
 * Sum of configured awards over the default encounter set (all bosses when an
 * instance has no default set). Missing awards are counted, never treated as 0.
 */
function renownTotal(rows: readonly Row[], variant: string) {
  let bosses = rows
    .filter((r) => r.kind === "member" && r.set_key === DEFAULT_SET)
    .map((r) => r.encounter_name);
  if (!rows.some((r) => r.kind === "set" && r.set_key === DEFAULT_SET))
    bosses = rows.filter((r) => r.kind === "boss").map((r) => r.encounter_name);
  let total = 0;
  let missing = 0;
  for (const boss of bosses) {
    const award = awardFor(rows, boss, variant);
    if (award?.has_points) total += award.points;
    else missing++;
  }
  return { total, missing };
}

/** Bosses grouped by encounter set, plus bosses outside every set. */
function groupBosses(rows: readonly Row[]) {
  const sets = rows.filter((r) => r.kind === "set");
  const inSet = new Set<string>();
  const groups = sets.map((set) => {
    const members = rows
      .filter((r) => r.kind === "member" && r.set_key === set.set_key)
      .sort(
        (a, b) =>
          a.position - b.position ||
          a.encounter_name.localeCompare(b.encounter_name),
      );
    members.forEach((m) => inSet.add(m.encounter_name));
    return {
      key: set.set_key,
      name: set.set_name || set.set_key,
      members,
    };
  });
  const loose = rows.filter(
    (r) => r.kind === "boss" && !inSet.has(r.encounter_name),
  );
  if (loose.length)
    groups.push({ key: "", name: "Not in an encounter set", members: loose });
  // Big sets span the row in two columns; small sets pack side by side, and a
  // small set left alone in its row spans it so the grid has no hole.
  let column = 0;
  return groups.map((group, i) => {
    const wide = group.members.length > 4;
    const next = groups[i + 1];
    const span = wide || (column === 0 && (!next || next.members.length > 4));
    column = span ? 0 : 1 - column;
    return { ...group, wide, span };
  });
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

function formatRenown(points: number) {
  return points.toLocaleString();
}

export function ConfigurationView({
  data,
}: {
  data: LeaderboardConfiguration;
}) {
  const [search, setSearch] = useState("");
  const [params, setParams] = useSearchParams();
  const instances = data.rows
    .filter((row) => row.kind === "instance")
    .map((row) => row.instance_name);
  const tenant = params.get("tenant");
  const [sort, setSort] = useState<"renown" | "name">("renown");
  const rowsFor = (name: string) =>
    data.rows.filter((row) => row.instance_name === name);
  const totals = new Map(
    instances.map((name) => [name, renownTotal(rowsFor(name), "")]),
  );
  const sorted = [...instances].sort(
    (a, b) =>
      (sort === "renown"
        ? (totals.get(b)?.total ?? 0) - (totals.get(a)?.total ?? 0)
        : 0) || a.localeCompare(b),
  );
  const filtered = sorted.filter((name) =>
    name.toLowerCase().includes(search.toLowerCase()),
  );
  const selected = params.get("instance") ?? sorted[0];
  return (
    <main className="mx-auto max-w-6xl space-y-4 px-4 py-6 sm:px-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link
            to="/leaderboards-v1/statistics"
            className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={12} /> Leaderboards
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">
            Leaderboard configuration
          </h1>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              {data.tenant_name}
            </span>{" "}
            · {data.dataset_name} dataset
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs text-muted-foreground">
          <ShieldCheck size={12} /> Read only
        </span>
      </header>
      {data.tenants?.length > 0 && (
        <TenantPicker tenants={data.tenants} selected={tenant} />
      )}
      <details className="group rounded-lg border bg-card text-xs">
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2">
          <FlavorChips label="Dataset" values={data.dataset_flavor} />
          <FlavorChips label="+ Tenant" values={data.additional_flavor} />
          <FlavorChips
            label="→ Leaderboard projection"
            values={data.leaderboard_flavor}
          />
          <span className="ml-auto inline-flex items-center gap-1 text-muted-foreground group-open:text-foreground">
            <Layers size={12} /> {data.layers.length} layers
          </span>
        </summary>
        <div className="space-y-2 border-t px-3 py-2">
          <FlavorChips label="Effective union" values={data.effective_flavor} />
          {data.layers.length ? (
            <ul className="flex flex-wrap gap-1.5">
              {data.layers.map((layer) => (
                <li
                  key={layer.key}
                  className="rounded border px-2 py-1"
                  title={
                    layer.required_flavors.join(" + ") ||
                    "All flavors (empty requirement)"
                  }
                >
                  <code>{layer.key}</code>
                  <span className="ml-1.5 text-muted-foreground">
                    {layer.required_flavors.join(" + ") || "all"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">No matching layers.</p>
          )}
          <p className="text-muted-foreground">
            Layers whose required flavors are all in the projection apply; more
            specific layers override less specific ones. Not per-field
            provenance.
          </p>
        </div>
      </details>
      {data.conflict ? (
        <section
          role="alert"
          className="rounded-lg border border-destructive/60 bg-destructive/5 p-4"
        >
          <h2 className="flex items-center gap-2 font-semibold text-destructive">
            <TriangleAlert size={16} /> Configuration conflict
          </h2>
          <p className="mt-1 break-words text-sm">{data.conflict}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            No resolved configuration is displayed until incompatible
            assignments are corrected.
          </p>
        </section>
      ) : instances.length === 0 ? (
        <section className="rounded-lg border border-dashed p-8 text-center">
          <h2 className="font-semibold">No configured instances</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            No instances are enabled for this flavor selection.
          </p>
        </section>
      ) : (
        <div className="grid items-start gap-4 md:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="overflow-hidden rounded-lg border bg-card md:sticky md:top-4">
            <label className="flex items-center gap-2 border-b px-3 py-2">
              <Search size={14} className="shrink-0 text-muted-foreground" />
              <input
                aria-label="Search instances"
                placeholder={`Search ${instances.length} instances`}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-full min-w-0 bg-transparent text-sm outline-none"
              />
            </label>
            <div className="flex justify-between px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {(
                [
                  ["name", "Instance"],
                  ["renown", "Renown"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  aria-pressed={sort === key}
                  title={`Sort by ${label.toLowerCase()}`}
                  onClick={() => setSort(key)}
                  className={`inline-flex items-center gap-0.5 uppercase tracking-wider hover:text-foreground ${sort === key ? "text-foreground" : ""}`}
                >
                  {label}
                  {sort === key && <ArrowDown size={10} />}
                </button>
              ))}
            </div>
            <nav
              aria-label="Configured instances"
              className="styled-scrollbar max-h-[70vh] overflow-y-auto pb-1"
            >
              {filtered.map((name) => {
                const { total, missing } = totals.get(name) ?? {
                  total: 0,
                  missing: 0,
                };
                const active = selected === name;
                return (
                  <button
                    key={name}
                    aria-current={active ? "page" : undefined}
                    onClick={() =>
                      setParams(
                        tenant
                          ? { tenant, instance: name }
                          : { instance: name },
                      )
                    }
                    className={`flex w-full items-center justify-between gap-2 border-l-2 px-3 py-1.5 text-left text-sm transition-colors ${active ? "border-primary bg-primary/10 font-medium text-primary" : "border-transparent hover:bg-muted"}`}
                  >
                    <span className="truncate">{name}</span>
                    <span
                      className={`shrink-0 tabular-nums text-xs ${active ? "" : "text-muted-foreground"}`}
                      title={
                        missing
                          ? `${missing} default-set bosses without an award`
                          : undefined
                      }
                    >
                      {formatRenown(total)}
                      {missing > 0 && <span className="text-amber-500">*</span>}
                    </span>
                  </button>
                );
              })}
              {!filtered.length && (
                <p className="px-3 py-2 text-sm text-muted-foreground">
                  No matching instances.
                </p>
              )}
            </nav>
          </aside>
          {instances.includes(selected) ? (
            <InstanceConfiguration
              key={selected}
              name={selected}
              rows={rowsFor(selected)}
            />
          ) : (
            <p role="status" className="text-sm text-muted-foreground">
              This instance is not enabled in the current configuration. Choose
              an instance from the list.
            </p>
          )}
        </div>
      )}
    </main>
  );
}

function Award({ row }: { row: Row | undefined }) {
  if (!row?.has_points)
    return (
      <span
        className="text-muted-foreground/60"
        title="No award configured (not zero)"
      >
        —
      </span>
    );
  return (
    <span className={row.points === 0 ? "text-muted-foreground" : ""}>
      {formatRenown(row.points)}
    </span>
  );
}

export function InstanceConfiguration({
  name,
  rows,
}: {
  name: string;
  rows: readonly Row[];
}) {
  const variants = rows.filter((row) => row.kind === "variant");
  const bosses = rows.filter((row) => row.kind === "boss");
  const groups = groupBosses(rows);
  const [variant, setVariant] = useState("");
  const { total, missing } = renownTotal(rows, variant);
  const showPositions = rows.some((r) => r.kind === "member" && r.position);
  return (
    <section className="min-w-0 rounded-lg border bg-card">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b px-4 py-3">
        <div>
          <h2 className="text-lg font-semibold">{name}</h2>
          <p className="text-xs text-muted-foreground">
            {plural(bosses.length, "boss", "bosses")} ·{" "}
            {plural(groups.filter((g) => g.key).length, "encounter set")}
            {!variants.length && " · no variants"}
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold tabular-nums leading-none">
            {formatRenown(total)}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Default set Renown
            {missing > 0 && (
              <span className="normal-case tracking-normal text-amber-500">
                {" "}
                · {missing} unset
              </span>
            )}
          </div>
        </div>
      </div>
      {variants.length > 0 && (
        <div
          role="radiogroup"
          aria-label="Award variant"
          className="flex flex-wrap gap-1 border-b px-4 py-2"
        >
          {[{ key: "", label: "Default" }]
            .concat(
              variants.map((v) => ({
                key: variantKey(v),
                label: v.difficulty_name.includes(String(v.max_players))
                  ? v.difficulty_name
                  : `${v.difficulty_name} · ${v.max_players}p`,
              })),
            )
            .map((option) => (
              <button
                key={option.key}
                role="radio"
                aria-checked={variant === option.key}
                onClick={() => setVariant(option.key)}
                className={`rounded-md px-2.5 py-1 text-xs transition-colors ${variant === option.key ? "bg-primary/15 font-semibold text-primary" : "text-muted-foreground hover:bg-muted"}`}
              >
                {option.label}
                <span className="ml-1.5 tabular-nums opacity-70">
                  {formatRenown(renownTotal(rows, option.key).total)}
                </span>
              </button>
            ))}
        </div>
      )}
      {!bosses.length && !groups.length ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">
          No bosses configured.
        </p>
      ) : (
        <div className="grid gap-px bg-border sm:grid-cols-2">
          {groups.map((group) => {
            const groupTotal = group.members.reduce((sum, m) => {
              const award = awardFor(rows, m.encounter_name, variant);
              return award?.has_points ? sum + award.points : sum;
            }, 0);
            return (
              <section
                key={group.key || "loose"}
                className={`bg-card px-4 py-3 ${group.span ? "sm:col-span-2" : ""}`}
              >
                <h3 className="mb-2 flex items-baseline gap-2 text-sm">
                  <span className="font-semibold">{group.name}</span>
                  {group.key && (
                    <code className="text-[11px] text-muted-foreground">
                      {group.key}
                    </code>
                  )}
                  <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                    {plural(group.members.length, "boss", "bosses")},{" "}
                    <span className="font-medium text-foreground">
                      {formatRenown(groupTotal)}
                    </span>{" "}
                    Renown
                  </span>
                </h3>
                {group.members.length ? (
                  <ol
                    className={`grid gap-x-6 ${group.wide ? "sm:grid-cols-2" : ""}`}
                  >
                    {group.members.map((member) => (
                      <li
                        key={member.encounter_name}
                        className="flex items-baseline gap-2 border-b border-dashed border-border/50 py-1 text-sm"
                      >
                        {showPositions && (
                          <span className="w-4 shrink-0 text-right font-mono text-[11px] text-muted-foreground">
                            {member.position || ""}
                          </span>
                        )}
                        <span className="min-w-0 flex-1 truncate">
                          {member.encounter_name}
                        </span>
                        <span className="shrink-0 tabular-nums">
                          <Award
                            row={awardFor(rows, member.encounter_name, variant)}
                          />
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No enabled members.
                  </p>
                )}
              </section>
            );
          })}
        </div>
      )}
      <p className="border-t px-4 py-2 text-[11px] text-muted-foreground">
        — no award configured · 0 explicit zero award
        {variant && " · variant awards include default fallback"}
      </p>
    </section>
  );
}
