import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { DatasetProvider, useTenantDatasetScope } from "@/hooks/useDatasetId";
import { GuideHost } from "./host";
import { loadGuidePackage } from "./package";
import { assertGuideCompatibility } from "./guideCompatibility";
import { browserGuideRuntimeFactory } from "./runtimeFactory";
import catalog from "../../../public/guides/catalog.json";

export const BUILTIN_GUIDES: Readonly<Record<string, string>> = Object.fromEntries(
  catalog.guides.flatMap((guide) => [guide.id, ...guide.aliases].map((id) => [id, guide.package_url])),
);

async function fetchBuiltInGuide(id: string) {
  const url = BUILTIN_GUIDES[id];
  if (!Object.hasOwn(BUILTIN_GUIDES, id) || !url) throw new Error(`Unknown guide package: ${id}`);
  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) throw new Error(`Guide package request failed with ${response.status}`);
  const guide = await loadGuidePackage(await response.arrayBuffer());
  assertGuideCompatibility(guide.manifest.game, import.meta.env.VITE_SERVER_NAME || "turtle");
  return guide;
}

export function GuidePage() {
  const { guideId = "" } = useParams();
  const navigate = useNavigate();
  const datasetScope = useTenantDatasetScope();
  const guideQuery = useQuery({
    queryKey: ["built-in-guide", guideId],
    queryFn: () => fetchBuiltInGuide(guideId),
    staleTime: Infinity,
    retry: false,
  });
  const fallback = useMemo(() => (
    <div className="grid min-h-dvh place-items-center bg-slate-950 p-6 text-center text-slate-200">
      <div className="max-w-lg rounded-lg border border-white/10 bg-slate-900/80 p-6 shadow-2xl">
        <h1 className="font-serif text-xl text-amber-100">{guideQuery.isError ? "Guide unavailable" : "Loading guide…"}</h1>
        <p className="styled-scrollbar mt-3 max-h-40 overflow-auto text-sm text-slate-400">
          {guideQuery.error instanceof Error ? guideQuery.error.message : "Validating the package before starting its isolated Lua runtime."}
        </p>
        {guideQuery.isError && (
          <button type="button" onClick={() => navigate("/")} className="mt-5 rounded border border-amber-200/25 bg-amber-950/70 px-4 py-2 text-sm text-amber-100">
            Return home
          </button>
        )}
      </div>
    </div>
  ), [guideQuery.error, guideQuery.isError, navigate]);

  if (!guideQuery.data) return fallback;
  if (!datasetScope.iconBaseUrl) {
    return (
      <div className="grid min-h-dvh place-items-center bg-slate-950 p-6 text-center text-slate-200">
        <div className="max-w-lg rounded-lg border border-amber-200/15 bg-slate-900/90 p-6">
          <h1 className="font-serif text-xl text-amber-100">Map assets unavailable</h1>
          <p className="mt-3 text-sm text-slate-400">The current tenant does not expose a map asset dataset for this guide.</p>
          <button type="button" onClick={() => navigate("/")} className="mt-5 rounded border border-amber-200/25 bg-amber-950/70 px-4 py-2 text-sm text-amber-100">Return home</button>
        </div>
      </div>
    );
  }

  return (
    <DatasetProvider datasetId={datasetScope.datasetId} iconBaseUrl={datasetScope.iconBaseUrl}>
      <GuideHost
        guide={guideQuery.data}
        runtimeFactory={browserGuideRuntimeFactory}
        iconBaseUrl={datasetScope.iconBaseUrl}
        onExit={() => navigate("/")}
        className="h-dvh min-h-dvh"
      />
    </DatasetProvider>
  );
}
