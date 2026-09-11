import { useMemo } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { ArrowLeft, BarChart3, Eye, Users } from "lucide-react";
import { useGuildPage, useGuildResourceAnalytics } from "@/api/queries";
import { GuildActionsMenu, GuildPageHeader } from "./components";

const numberFormatter = new Intl.NumberFormat();

export function GuildAnalytics() {
  const { guildId } = useParams<{ guildId: string }>();
  const { data: pageConfig, isLoading: pageLoading } = useGuildPage(guildId);
  const { data: analytics, isLoading, error } = useGuildResourceAnalytics(guildId);

  const summary = useMemo(() => {
    const rows = analytics?.days ?? [];
    const today = new Date().toISOString().slice(0, 10);
    const instances = new Map<string, { name: string; views: number; uniqueVisitors: number }>();
    const daily = new Map<string, number>();
    let guildPageViews = 0;
    let instanceViews = 0;
    let uniqueViewsToday = 0;

    for (const row of rows) {
      daily.set(row.viewed_on, (daily.get(row.viewed_on) ?? 0) + row.views);
      if (row.viewed_on === today) uniqueViewsToday += row.unique_visitors;
      if (row.resource_kind === "guild_page") {
        guildPageViews += row.views;
      } else if (row.resource_kind === "instance") {
        instanceViews += row.views;
        const current = instances.get(row.resource_key) ?? {
          name: row.resource_name,
          views: 0,
          uniqueVisitors: 0,
        };
        current.views += row.views;
        current.uniqueVisitors += row.unique_visitors;
        instances.set(row.resource_key, current);
      }
    }

    const dailyRows = [...daily.entries()].sort(([a], [b]) => a.localeCompare(b));
    const maxDailyViews = Math.max(1, ...dailyRows.map(([, views]) => views));

    return {
      guildPageViews,
      instanceViews,
      uniqueViewsToday,
      dailyRows,
      maxDailyViews,
      instances: [...instances.entries()]
        .map(([key, value]) => ({ key, ...value }))
        .sort((a, b) => b.views - a.views),
    };
  }, [analytics]);

  if (pageLoading) {
    return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" /></div>;
  }
  if (!pageConfig?.guild.can_edit) return <Navigate to={`/g/${guildId}`} replace />;

  return (
    <div className="relative w-full px-4 md:px-12">
      <GuildActionsMenu
        guildId={guildId!}
        canEdit={pageConfig.guild.can_edit}
        canViewRoster={pageConfig.guild.can_view_roster}
      />
      <GuildPageHeader guild={pageConfig.guild} theme={pageConfig.theme} />

      <div className="mx-auto max-w-6xl pb-12">
        <div className="mb-6 flex items-center gap-3">
          <Link to={`/g/${guildId}`} className="text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-lg font-semibold">Guild Analytics</h1>
            <p className="text-sm text-muted-foreground">A lightweight view of the last {analytics?.lookback_days ?? 30} days.</p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex h-48 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" /></div>
        ) : error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">Failed to load guild analytics.</div>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <MetricCard icon={Eye} label="Guild page views" value={summary.guildPageViews} />
              <MetricCard icon={BarChart3} label="Instance views" value={summary.instanceViews} />
              <MetricCard icon={Users} label="Unique views today" value={summary.uniqueViewsToday} />
            </div>

            <section className="rounded-xl border border-border bg-card p-5">
              <div className="mb-5">
                <h2 className="font-semibold">Views by day</h2>
                <p className="text-sm text-muted-foreground">Guild page and guild instance views combined.</p>
              </div>
              {summary.dailyRows.length === 0 ? (
                <EmptyAnalytics />
              ) : (
                <div className="styled-scrollbar overflow-x-auto pb-2">
                  <div className="flex h-44 min-w-[640px] items-end gap-1.5" aria-label="Daily guild resource views">
                    {summary.dailyRows.map(([date, views]) => (
                      <div key={date} className="group flex min-w-3 flex-1 flex-col items-center justify-end gap-2">
                        <div className="invisible rounded bg-popover px-1.5 py-0.5 text-xs shadow group-hover:visible">
                          {numberFormatter.format(views)}
                        </div>
                        <div
                          className="w-full rounded-t bg-primary/70 transition-colors group-hover:bg-primary"
                          style={{ height: `${Math.max(4, (views / summary.maxDailyViews) * 112)}px` }}
                          title={`${date}: ${numberFormatter.format(views)} views`}
                        />
                        <span className="text-[10px] text-muted-foreground">{date.slice(5)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>

            <section className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="border-b border-border p-5">
                <h2 className="font-semibold">Instance views</h2>
                <p className="text-sm text-muted-foreground">Instances without a stable slug are intentionally not tracked.</p>
              </div>
              {summary.instances.length === 0 ? (
                <div className="p-5"><EmptyAnalytics /></div>
              ) : (
                <div className="styled-scrollbar overflow-x-auto">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr><th className="px-5 py-3 font-medium">Instance</th><th className="px-5 py-3 text-right font-medium">Views</th><th className="px-5 py-3 text-right font-medium">Daily unique views</th></tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {summary.instances.map((instance) => (
                        <tr key={instance.key} className="hover:bg-muted/20">
                          <td className="px-5 py-3"><Link className="font-medium hover:text-primary" to={`/instances/${instance.key}`}>{instance.name}</Link></td>
                          <td className="px-5 py-3 text-right tabular-nums">{numberFormatter.format(instance.views)}</td>
                          <td className="px-5 py-3 text-right tabular-nums">{numberFormatter.format(instance.uniqueVisitors)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <p className="text-xs text-muted-foreground">
              Unique views use a first-party browser cookie and are deduplicated per resource per UTC day. Counts may differ when visitors clear cookies or use another browser.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value }: { icon: typeof Eye; label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground"><Icon className="h-4 w-4" />{label}</div>
      <div className="text-3xl font-semibold tabular-nums">{numberFormatter.format(value)}</div>
    </div>
  );
}

function EmptyAnalytics() {
  return <div className="py-8 text-center text-sm text-muted-foreground">No views recorded yet.</div>;
}
