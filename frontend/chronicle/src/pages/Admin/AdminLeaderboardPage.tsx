import { useState } from "react";
import { Loader2 } from "lucide-react";
import { AdminRatingCatchup } from "./AdminRatingCatchup";
import { enqueueRatingJob, type RatingJobAction, type RatingJobResult } from "./ratingJobs";
import { Card } from "@/components/ui/Card/Card";
import { Button } from "@/components/ui/button";

export function AdminLeaderboardPage() {
  const [pendingRatingJob, setPendingRatingJob] = useState<RatingJobAction | null>(null);
  const [ratingJobResult, setRatingJobResult] = useState<{ action: RatingJobAction; job: RatingJobResult } | null>(null);
  const [ratingJobError, setRatingJobError] = useState("");

  const enqueueRatingMaintenance = async (action: RatingJobAction) => {
    setPendingRatingJob(action);
    setRatingJobResult(null);
    setRatingJobError("");
    try {
      const job = await enqueueRatingJob(action);
      setRatingJobResult({ action, job });
    } catch (error) {
      setRatingJobError(error instanceof Error ? error.message : "Could not enqueue rating maintenance");
    } finally {
      setPendingRatingJob(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="space-y-4 p-4">
        <div>
          <h3 className="font-semibold">Rating maintenance</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Rating changes repair automatically through the tenant drain. Renown fact repair also runs daily; use the button to run that historical fact repair now. Policy scans are started separately per tenant after a policy change.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" disabled={pendingRatingJob !== null} onClick={() => void enqueueRatingMaintenance("renown-repair")}>
            {pendingRatingJob === "renown-repair" && <Loader2 className="mr-2 size-4 animate-spin" />}
            Repair Renown facts (all tenants)
          </Button>
        </div>
        {ratingJobResult && (
          <p role="status" className="text-sm text-muted-foreground">
            Renown repair was queued
            {" "}(job #{ratingJobResult.job.job_id}, {ratingJobResult.job.job_state}). Check the River jobs dashboard for completion.
          </p>
        )}
        {ratingJobError && <p role="alert" className="text-sm text-destructive">{ratingJobError}</p>}
      </Card>
      <AdminRatingCatchup />
    </div>
  );
}
