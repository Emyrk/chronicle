import { useMemo, useState } from "react";
import { useAdminActiveCustomPanels } from "@/api/queries";
import { Card } from "@/components/ui/Card/Card";
import { Button } from "@/components/ui/button";
import {
  ExternalLink,
  Github,
  Layers3,
  Loader2,
  PanelsTopLeft,
  RefreshCw,
  Search,
  Users,
} from "lucide-react";

function formatDate(value: string) {
  return new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function AdminCustomPanelsPage() {
  const [filter, setFilter] = useState("");
  const { data, isLoading, error, refetch, isFetching } = useAdminActiveCustomPanels();
  const installations = useMemo(() => data?.installations ?? [], [data]);

  const filteredInstallations = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return installations;

    return installations.filter((installation) =>
      [
        installation.username,
        installation.repository,
        installation.plugin_name,
        installation.plugin_version,
        installation.installed_ref,
        ...installation.panel_names,
      ].some((value) => value.toLowerCase().includes(needle)),
    );
  }, [filter, installations]);

  const userCount = useMemo(
    () => new Set(installations.map((installation) => installation.user_id)).size,
    [installations],
  );
  const panelCount = useMemo(
    () => installations.reduce((total, installation) => total + installation.panel_names.length, 0),
    [installations],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <PanelsTopLeft className="h-4 w-4" />
            Trusted plugin activity
          </div>
          <h1 className="text-2xl font-bold">Active Custom Panels</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Installations shown here are enabled both for the account and for the individual plugin.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Installations</span>
            <Github className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="mt-2 text-2xl font-semibold tabular-nums">{installations.length}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Users</span>
            <Users className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="mt-2 text-2xl font-semibold tabular-nums">{userCount}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Panel definitions</span>
            <Layers3 className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="mt-2 text-2xl font-semibold tabular-nums">{panelCount}</div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold">Enabled installations</h2>
            <p className="text-xs text-muted-foreground">
              One row per user and repository.
            </p>
          </div>
          <div className="relative w-full sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Filter users, plugins, or panels..."
              className="w-full rounded-md border bg-background py-2 pl-9 pr-3 text-sm outline-none transition-colors focus:border-ring"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="p-8 text-center">
            <p className="font-medium text-destructive">Failed to load active custom panels.</p>
            <p className="mt-1 text-sm text-muted-foreground">{error.message}</p>
          </div>
        ) : filteredInstallations.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-12 text-center text-muted-foreground">
            <PanelsTopLeft className="h-8 w-8" />
            <p>{installations.length === 0 ? "No active custom panels." : "No installations match this filter."}</p>
          </div>
        ) : (
          <div className="styled-scrollbar overflow-x-auto">
            <table className="w-full min-w-[1050px] text-sm">
              <thead>
                <tr className="border-b bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">Plugin</th>
                  <th className="px-4 py-3 font-medium">Panels</th>
                  <th className="px-4 py-3 font-medium">Installed ref</th>
                  <th className="px-4 py-3 font-medium">Commit</th>
                  <th className="px-4 py-3 font-medium">Last updated</th>
                </tr>
              </thead>
              <tbody>
                {filteredInstallations.map((installation) => (
                  <tr
                    key={`${installation.user_id}:${installation.repository}`}
                    className="border-b last:border-0 hover:bg-muted/30"
                  >
                    <td className="px-4 py-3 align-top">
                      <div className="font-medium">{installation.username}</div>
                      <div className="mt-0.5 max-w-40 truncate font-mono text-[11px] text-muted-foreground" title={installation.user_id}>
                        {installation.user_id}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <a
                        href={`https://github.com/${installation.repository}/tree/${installation.commit_sha}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 font-medium text-blue-500 hover:underline"
                      >
                        {installation.plugin_name || installation.repository}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {installation.repository}
                        {installation.plugin_version ? ` · v${installation.plugin_version}` : ""}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex max-w-md flex-wrap gap-1.5">
                        {installation.panel_names.length > 0 ? (
                          installation.panel_names.map((panelName) => (
                            <span
                              key={panelName}
                              className="rounded border bg-muted/50 px-2 py-0.5 text-xs"
                            >
                              {panelName}
                            </span>
                          ))
                        ) : (
                          <span className="text-muted-foreground">None declared</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top font-mono text-xs">
                      {installation.installed_ref}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <code className="rounded bg-muted px-1.5 py-1 text-xs" title={installation.commit_sha}>
                        {installation.commit_sha.slice(0, 8)}
                      </code>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 align-top text-muted-foreground">
                      <div>{formatDate(installation.updated_at)}</div>
                      <div className="mt-0.5 text-xs" title={formatDate(installation.installed_at)}>
                        Installed {new Date(installation.installed_at).toLocaleDateString()}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
