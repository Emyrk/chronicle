import { useState } from "react";
import { ArrowLeft, FlaskConical } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useArmoryPlayer } from "@/api/queries";
import type { ArmoryPlayer } from "@/api/typesGenerated";
import { Button } from "@/components/ui/button";
import { DatasetProvider } from "@/hooks/useDatasetId";
import { IdentityHeader } from "./overview/IdentityHeader";
import { PerformanceExplorer } from "./overview/PerformanceExplorer";
import { defaultMetric, type ParseMetric } from "./overview/util";

/** Hidden workspace for experimental Armory analysis tools. */
export function ArmoryAnalysisPage() {
  const { realmName, playerIdentifier } = useParams<{
    realmName: string;
    playerIdentifier: string;
  }>();
  const { data: player, isLoading, error } = useArmoryPlayer(realmName, playerIdentifier);

  if (isLoading) {
    return <div className="flex min-h-[400px] items-center justify-center text-muted-foreground">Loading character…</div>;
  }

  if (error || !player) {
    return (
      <div className="flex min-h-[400px] items-center justify-center text-muted-foreground">
        Character not found: {realmName}/{playerIdentifier}
      </div>
    );
  }

  return (
    <DatasetProvider datasetId={player.dataset_id} iconBaseUrl={player.icon_base_url}>
      <AnalysisContent player={player} />
    </DatasetProvider>
  );
}

function AnalysisContent({ player }: { player: ArmoryPlayer }) {
  const [metric, setMetric] = useState<ParseMetric>(() => defaultMetric(player));
  const armoryPath = `/armory/${encodeURIComponent(player.realm_name)}/${encodeURIComponent(player.id)}`;

  return (
    <div className="mx-auto w-full max-w-[92rem] px-4 py-8">
      <div className="mb-6 flex items-center justify-between gap-4 border-b border-border pb-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to={armoryPath}>
            <ArrowLeft className="h-4 w-4" />
            Back to Armory
          </Link>
        </Button>
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
          <FlaskConical className="h-4 w-4 text-sky-400" />
          Analysis workspace
        </div>
      </div>

      <IdentityHeader player={player} />

      <main className="mt-8">
        <PerformanceExplorer player={player} metric={metric} onMetricChange={setMetric} />
      </main>
    </div>
  );
}
