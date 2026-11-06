import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  EyeOff,
  Globe,
  Layers,
  Search,
  ShieldCheck,
} from "lucide-react";
import { useLeaderboardConfiguration } from "@/api/leaderboardConfiguration";
import type {
  LeaderboardConfiguration,
  LeaderboardConfigurationRow,
  LeaderboardConfigurationTenant,
} from "@/api/typesGenerated";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card/Card";
import { Button } from "@/components/ui/button";

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

function Flavors({
  label,
  values,
}: {
  label: string;
  values: readonly string[];
}) {
  return (
    <div>
      <dt className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="flex flex-wrap gap-1.5">
        {values.length ? (
          values.map((value) => (
            <span
              key={value}
              className="rounded border bg-muted/40 px-2 py-1 font-mono text-xs"
            >
              {value}
            </span>
          ))
        ) : (
          <span className="text-sm text-muted-foreground">None</span>
        )}
      </dd>
    </div>
  );
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
  const selected = params.get("instance") ?? instances[0];
  const tenant = params.get("tenant");
  const filtered = instances.filter((name) =>
    name.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-8">
      <Link
        to="/leaderboards/statistics"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={16} /> Leaderboards
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-6">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-primary">
            Shared policy / tenant view
          </p>
          <h1 className="text-3xl font-bold tracking-tight">
            Leaderboard configuration
          </h1>
          <p className="mt-2 text-muted-foreground">{data.tenant_name}</p>
          {data.tenant_id && (
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              {data.tenant_id}
            </p>
          )}
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs">
          <ShieldCheck size={14} /> Read only
        </span>
      </header>
      {data.tenants.length > 0 && (
        <TenantPicker tenants={data.tenants} selected={tenant} />
      )}
      <Card>
        <CardHeader>
          <CardTitle>Flavor selection</CardTitle>
          <p className="text-sm text-muted-foreground">
            Dataset: {data.dataset_name}{" "}
            <span className="font-mono text-xs">({data.dataset_id})</span>
          </p>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-6 sm:grid-cols-2">
            <Flavors label="Dataset flavors" values={data.dataset_flavor} />
            <Flavors label="Tenant additions" values={data.additional_flavor} />
            <Flavors label="Effective union" values={data.effective_flavor} />
            <Flavors
              label="Leaderboard projection"
              values={data.leaderboard_flavor}
            />
          </dl>
        </CardContent>
      </Card>
      <details className="rounded-xl border bg-card p-5">
        <summary className="cursor-pointer font-semibold">
          <Layers className="mr-2 inline" size={16} />
          {data.layers.length} applicable layers
        </summary>
        <p className="my-3 text-sm text-muted-foreground">
          Required flavors are subsets of the leaderboard projection. This
          overview is not per-field provenance. More specific layers override
          less specific assignments.
        </p>
        {data.layers.length ? (
          <ul className="space-y-2">
            {data.layers.map((layer) => (
              <li
                key={layer.key}
                className="flex flex-wrap justify-between gap-2 border-t pt-2 text-sm"
              >
                <code>{layer.key}</code>
                <span className="text-muted-foreground">
                  {layer.required_flavors.join(" + ") ||
                    "All flavors (empty requirement)"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p>No matching layers.</p>
        )}
      </details>
      {data.conflict ? (
        <section
          role="alert"
          className="rounded-xl border border-destructive p-6"
        >
          <h2 className="text-lg font-semibold">Configuration conflict</h2>
          <p className="mt-2 break-words">{data.conflict}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            No resolved configuration is displayed. Incompatible assignments
            must be corrected before this configuration can be used.
          </p>
        </section>
      ) : instances.length === 0 ? (
        <section className="rounded-xl border border-dashed p-10 text-center">
          <h2 className="text-lg font-semibold">No configured instances</h2>
          <p className="mt-2 text-muted-foreground">
            No instances are enabled for this flavor selection.
          </p>
        </section>
      ) : (
        <div className="grid items-start gap-6 md:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="rounded-xl border bg-card p-3">
            <label className="flex items-center gap-2 rounded-md border px-3 py-2">
              <Search size={16} className="shrink-0 text-muted-foreground" />
              <input
                aria-label="Search instances"
                placeholder="Search instances"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="min-w-0 w-full bg-transparent text-sm outline-none"
              />
            </label>
            <nav
              aria-label="Configured instances"
              className="styled-scrollbar mt-3 max-h-96 space-y-1 overflow-y-auto"
            >
              {filtered.map((name) => (
                <button
                  key={name}
                  aria-current={selected === name ? "page" : undefined}
                  onClick={() =>
                    setParams(
                      tenant ? { tenant, instance: name } : { instance: name },
                    )
                  }
                  className={`w-full rounded-md px-3 py-2.5 text-left text-sm transition-colors ${selected === name ? "bg-primary/10 font-semibold text-primary" : "hover:bg-muted"}`}
                >
                  {name}
                </button>
              ))}
              {!filtered.length && (
                <p className="p-3 text-sm text-muted-foreground">
                  No matching instances.
                </p>
              )}
            </nav>
            <p className="px-3 pt-3 text-xs text-muted-foreground">
              {instances.length} configured instances
            </p>
          </aside>
          {instances.includes(selected) ? (
            <InstanceConfiguration
              name={selected}
              rows={data.rows.filter((row) => row.instance_name === selected)}
            />
          ) : (
            <p role="status">
              This instance is not enabled in the current configuration. Choose
              an instance from the list.
            </p>
          )}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Configuration preview only. These definitions do not change existing
        parser or leaderboard behavior. Variant awards shown below are resolved
        values, including default fallback, not override provenance.
      </p>
    </main>
  );
}

function award(row: LeaderboardConfigurationRow | undefined) {
  return row?.has_points
    ? `${row.points.toLocaleString()} points`
    : "No award configured";
}

export function InstanceConfiguration({
  name,
  rows,
}: {
  name: string;
  rows: readonly LeaderboardConfigurationRow[];
}) {
  const variants = rows.filter((row) => row.kind === "variant");
  const bosses = rows.filter((row) => row.kind === "boss");
  const sets = rows.filter((row) => row.kind === "set");
  return (
    <section className="min-w-0 space-y-5">
      <div>
        <h2 className="text-2xl font-semibold">{name}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {bosses.length} bosses · {variants.length} variants · {sets.length}{" "}
          encounter sets
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Instance variants</CardTitle>
        </CardHeader>
        <CardContent>
          {variants.length ? (
            <ul className="flex flex-wrap gap-2">
              {variants.map((row) => (
                <li
                  key={`${row.difficulty_name}/${row.max_players}`}
                  className="rounded-md border px-3 py-2 text-sm"
                >
                  {row.difficulty_name} · {row.max_players} players
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No variants configured. Boss definitions and default awards can
              still be present.
            </p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Bosses &amp; Renown</CardTitle>
          <p className="text-sm text-muted-foreground">
            Explicit zero is an award of 0 points. An unconfigured award is not
            zero.
          </p>
        </CardHeader>
        <CardContent>
          {!bosses.length ? (
            <p className="text-muted-foreground">No bosses configured.</p>
          ) : (
            <div className="styled-scrollbar overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="py-3 pr-4">Boss</th>
                    <th className="px-3 py-3">Default award</th>
                    {variants.map((v) => (
                      <th
                        key={`${v.difficulty_name}/${v.max_players}`}
                        className="px-3 py-3"
                      >
                        {v.difficulty_name}
                        <span className="block text-xs font-normal text-muted-foreground">
                          {v.max_players} players
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bosses.map((boss) => (
                    <tr
                      key={boss.encounter_name}
                      className="border-b last:border-0"
                    >
                      <th className="py-3 pr-4 font-medium">
                        {boss.encounter_name}
                      </th>
                      <td className="whitespace-nowrap px-3 py-3 tabular-nums">
                        {award(boss)}
                      </td>
                      {variants.map((v) => (
                        <td
                          key={`${v.difficulty_name}/${v.max_players}`}
                          className="whitespace-nowrap px-3 py-3 tabular-nums"
                        >
                          {award(
                            rows.find(
                              (row) =>
                                row.kind === "boss_variant" &&
                                row.encounter_name === boss.encounter_name &&
                                row.difficulty_name === v.difficulty_name &&
                                row.max_players === v.max_players,
                            ),
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Ordered encounter sets</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {!sets.length && (
            <p className="text-sm text-muted-foreground">
              No encounter sets configured.
            </p>
          )}
          {sets.map((set) => {
            const members = rows
              .filter(
                (row) => row.kind === "member" && row.set_key === set.set_key,
              )
              .sort(
                (a, b) =>
                  a.position - b.position ||
                  a.encounter_name.localeCompare(b.encounter_name),
              );
            return (
              <section key={set.set_key}>
                <h3 className="font-semibold">{set.set_name || set.set_key}</h3>
                <p className="mb-3 font-mono text-xs text-muted-foreground">
                  {set.set_key}
                </p>
                {members.length ? (
                  <ol className="space-y-2">
                    {members.map((member) => (
                      <li
                        key={member.encounter_name}
                        className="flex items-center gap-3 rounded-md bg-muted/40 px-3 py-2 text-sm"
                      >
                        <span className="font-mono text-xs text-muted-foreground">
                          {member.position}
                        </span>
                        {member.encounter_name}
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
        </CardContent>
      </Card>
    </section>
  );
}
