import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { loadPanelPackage } from "../Guides/package/panelLoader";
import { LuaPanelHost } from "../Instance/EventsPanels/LuaPanel/LuaPanelHost";

interface LuaDraftPreviewProps {
  projectId: string;
  draftHash: string;
}

/** The private draft runs in the same dedicated worker and scene host as installed panels. */
export function LuaDraftPreview({ projectId, draftHash }: LuaDraftPreviewProps) {
  const draft = useQuery({
    queryKey: ["lua-draft-preview", projectId, draftHash],
    retry: false,
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/v1/me/lua-projects/${encodeURIComponent(projectId)}/draft/package`, {
        signal,
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`Private draft unavailable (${response.status})`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      return loadPanelPackage(bytes);
    },
  });
  const assets = useMemo(() => {
    const urls = new Map<string, string>();
    for (const [path, bytes] of draft.data?.assets ?? []) {
      urls.set(path, URL.createObjectURL(new Blob([new Uint8Array(bytes)])));
    }
    return urls;
  }, [draft.data]);
  useEffect(() => () => { for (const url of assets.values()) URL.revokeObjectURL(url); }, [assets]);

  if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("safe") === "1") {
    return <p className="text-sm text-muted-foreground">Lua preview is disabled by ?safe=1.</p>;
  }
  if (draft.isPending) return <p className="text-sm text-muted-foreground">Loading private draft…</p>;
  if (draft.isError) return <p role="alert" className="text-sm text-destructive">{draft.error.message}</p>;
  return <div className="space-y-2">
    <p className="text-xs text-muted-foreground">Worker preview. Instance events are unavailable here; test data-driven behavior from an installed Unstable panel.</p>
    <LuaPanelHost key={draftHash} entrypoint={draft.data.entrypoint} sources={draft.data.sources} capabilities={draft.data.capabilities}
      streams={draft.data.streams} assets={assets} />
  </div>;
}
