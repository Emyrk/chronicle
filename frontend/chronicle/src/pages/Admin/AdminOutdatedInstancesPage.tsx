import { Link } from "react-router-dom";
import { useAdminOutdatedInstances, useBulkReparseOutdatedInstances, useReparseLogGroup } from "@/api/queries";
import { Card } from "@/components/ui/Card/Card";
import { Button } from "@/components/ui/button";
import { RefreshCw, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function AdminOutdatedInstancesPage() {
  const [nameFilter, setNameFilter] = useState("");
  const [debouncedFilter, setDebouncedFilter] = useState("");
  const [parserVersion, setParserVersion] = useState("");
  const [debouncedParserVersion, setDebouncedParserVersion] = useState("");
  const { data, isLoading, error, refetch } = useAdminOutdatedInstances(debouncedFilter || undefined, debouncedParserVersion || undefined);
  const reparseLogGroup = useReparseLogGroup();
  const bulkReparse = useBulkReparseOutdatedInstances();
  const [reparsingIds, setReparsingIds] = useState<Set<string>>(new Set());
  const [debounceTimer, setDebounceTimer] = useState<ReturnType<typeof setTimeout>>();
  const [versionDebounceTimer, setVersionDebounceTimer] = useState<ReturnType<typeof setTimeout>>();

  const handleNameFilterChange = (value: string) => {
    setNameFilter(value);
    if (debounceTimer) clearTimeout(debounceTimer);
    setDebounceTimer(setTimeout(() => setDebouncedFilter(value), 300));
  };

  const handleParserVersionChange = (value: string) => {
    setParserVersion(value);
    if (versionDebounceTimer) clearTimeout(versionDebounceTimer);
    setVersionDebounceTimer(setTimeout(() => setDebouncedParserVersion(value), 300));
  };

  const handleReparse = (logGroupId: string, name: string) => {
    setReparsingIds((prev) => new Set(prev).add(logGroupId));
    reparseLogGroup.mutate(
      { logId: logGroupId },
      {
        onSuccess: () => {
          toast.success("Reparse started", {
            description: `Reparsing ${name}`,
          });
          refetch();
        },
        onError: (err) => {
          toast.error("Failed to reparse", {
            description: err.message,
          });
        },
        onSettled: () => {
          setReparsingIds((prev) => {
            const next = new Set(prev);
            next.delete(logGroupId);
            return next;
          });
        },
      }
    );
  };

  const handleBulkReparse = () => {
  bulkReparse.mutate(
    {
    instanceName: debouncedFilter || undefined,
    parserVersion: debouncedParserVersion || undefined,
    },
    {
    onSuccess: (result) => {
      if (result.failed.length > 0) {
      toast.warning("Bulk reparse partially queued", {
        description: `${result.enqueued} of ${result.matched} logs were enqueued. ${result.failed.length} failed.`,
      });
      } else {
      toast.success("Bulk reparse started", {
        description: `${result.enqueued} logs were enqueued for reparse.`,
      });
      }
      refetch();
    },
    onError: (err) => {
      toast.error("Failed to bulk reparse", {
      description: err.message,
      });
    },
    }
  );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">Outdated Parser Instances</h1>
        {data && (
          <span className="text-sm text-muted-foreground">
            Below: <code className="bg-muted px-1 rounded">{data.min_version}</code>
          </span>
        )}
      </div>

      <Card className="p-4">
        <div className="mb-4 flex gap-4">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Filter by instance name..."
              value={nameFilter}
              onChange={(e) => handleNameFilterChange(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border rounded-md bg-background"
            />
          </div>
          <div className="relative max-w-xs">
            <input
              type="text"
              placeholder="Min parser version (e.g. v0.0.437)"
              value={parserVersion}
              onChange={(e) => handleParserVersionChange(e.target.value)}
              className="w-full px-3 py-2 text-sm border rounded-md bg-background font-mono"
            />
          </div>
      <Button
      variant="default"
      disabled={bulkReparse.isPending || isLoading || !data || data.instances.length === 0}
      onClick={handleBulkReparse}
      >
      {bulkReparse.isPending ? (
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
      ) : (
        <RefreshCw className="h-4 w-4 mr-2" />
      )}
      Reparse All Filtered
      </Button>
        </div>
      </Card>

      <Card className="p-4">
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}
        {error && (
          <div className="text-red-500 py-4">
            Failed to load instances: {error.message}
          </div>
        )}
        {data && data.instances.length === 0 && (
          <div className="text-muted-foreground py-8 text-center">
            All instances are on the latest parser version.
          </div>
        )}
        {data && data.instances.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 px-3">Instance</th>
                  <th className="py-2 px-3">Elapsed</th>
                  <th className="py-2 px-3">Realm</th>
                  <th className="py-2 px-3">Uploader</th>
                  <th className="py-2 px-3">Uploaded</th>
                  <th className="py-2 px-3">Parser Version</th>
                  <th className="py-2 px-3"></th>
                </tr>
              </thead>
              <tbody>
                {data.instances.map((instance) => (
                  <tr key={instance.id} className="border-b hover:bg-muted/50">
                    <td className="py-2 px-3">
                      {instance.slug ? (
                        <Link
                          to={`/instances/${instance.slug}`}
                          className="text-blue-500 hover:underline"
                        >
                          {instance.name}
                        </Link>
                      ) : (
                        instance.name
                      )}
                    </td>
                    <td className="py-2 px-3 text-muted-foreground">
                      {instance.elapsed_seconds != null
                        ? formatElapsed(instance.elapsed_seconds)
                        : "—"}
                    </td>
                    <td className="py-2 px-3">{instance.realm_name}</td>
                    <td className="py-2 px-3">{instance.uploader_name}</td>
                    <td className="py-2 px-3">
                      {new Date(instance.uploaded_at).toLocaleDateString()}
                    </td>
                    <td className="py-2 px-3">
                      <code className="bg-muted px-1 rounded text-xs">
                        {instance.parser_version}
                      </code>
                    </td>
                    <td className="py-2 px-3">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={reparsingIds.has(instance.log_group_id)}
                        onClick={() =>
                          handleReparse(instance.log_group_id, instance.name)
                        }
                      >
                        {reparsingIds.has(instance.log_group_id) ? (
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        ) : (
                          <RefreshCw className="h-3 w-3 mr-1" />
                        )}
                        Reparse
                      </Button>
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
