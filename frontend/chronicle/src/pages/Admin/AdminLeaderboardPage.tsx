import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { LeaderboardVersionRequirements } from "@/api/typesGenerated";
import { useAdminInstanceNames } from "@/api/queries";
import { Loader2 } from "lucide-react";
import { enqueueRatingJob, type RatingJobAction, type RatingJobResult } from "./ratingJobs";
import { Card } from "@/components/ui/Card/Card";
import { Button } from "@/components/ui/button";

export function AdminLeaderboardPage() {
  const { data: requirements, isLoading, refetch } = useQuery({
    queryKey: ["admin", "leaderboard", "version-requirements"],
    queryFn: async () => {
      const res = await fetch("/api/v1/admin/leaderboard/version-requirements");
      if (!res.ok) throw new Error("Failed to fetch version requirements");
      return res.json() as Promise<LeaderboardVersionRequirements[]>;
    },
    retry: false,
  });

  const { data: instanceNames } = useAdminInstanceNames();

  const [instanceName, setInstanceName] = useState("");
  const [minParser, setMinParser] = useState("");
  const [minAddon, setMinAddon] = useState("");
  const [saving, setSaving] = useState(false);
  const [settingAll, setSettingAll] = useState(false);
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

  const upsertOne = async (name: string) => {
    const res = await fetch("/api/v1/admin/leaderboard/version-requirements", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instance_name: name,
        min_parser_version: minParser,
        min_addon_version: minAddon,
      }),
    });
    if (!res.ok) throw new Error(`Failed to save for ${name}`);
  };

  const handleSave = async () => {
    if (!instanceName) return;
    setSaving(true);
    try {
      await upsertOne(instanceName);
      setInstanceName("");
      setMinParser("");
      setMinAddon("");
      refetch();
    } finally {
      setSaving(false);
    }
  };

  const handleSetAll = async () => {
    if (!instanceNames?.length || (!minParser && !minAddon)) return;
    setSettingAll(true);
    try {
      const existing = new Map<string, LeaderboardVersionRequirements>();
      if (requirements) {
        for (const req of requirements) {
          existing.set(req.instance_name, req);
        }
      }
      await Promise.all(instanceNames.map((name) => {
        const prev = existing.get(name);
        const res = fetch("/api/v1/admin/leaderboard/version-requirements", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            instance_name: name,
            min_parser_version: minParser || prev?.min_parser_version || "",
            min_addon_version: minAddon || prev?.min_addon_version || "",
          }),
        });
        return res;
      }));
      setMinParser("");
      setMinAddon("");
      refetch();
    } finally {
      setSettingAll(false);
    }
  };

  const handleEdit = (req: LeaderboardVersionRequirements) => {
    setInstanceName(req.instance_name);
    setMinParser(req.min_parser_version);
    setMinAddon(req.min_addon_version);
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h3 className="font-semibold mb-3">Leaderboard Version Requirements</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Set minimum parser and addon versions for leaderboard entries. Runs below these versions are filtered out.
        </p>
        <div className="flex items-end gap-3 mb-4">
          <div className="flex-1">
            <label className="text-xs text-muted-foreground">Instance Name</label>
            <input
              className="w-full mt-1 px-2 py-1.5 text-sm rounded border border-zinc-700 bg-zinc-900"
              placeholder="Molten Core"
              value={instanceName}
              onChange={(e) => setInstanceName(e.target.value)}
            />
          </div>
          <div className="flex-1">
            <label className="text-xs text-muted-foreground">Min Parser Version</label>
            <input
              className="w-full mt-1 px-2 py-1.5 text-sm rounded border border-zinc-700 bg-zinc-900"
              placeholder="v0.0.425"
              value={minParser}
              onChange={(e) => setMinParser(e.target.value)}
            />
          </div>
          <div className="flex-1">
            <label className="text-xs text-muted-foreground">Min Addon Version</label>
            <input
              className="w-full mt-1 px-2 py-1.5 text-sm rounded border border-zinc-700 bg-zinc-900"
              placeholder="0.25"
              value={minAddon}
              onChange={(e) => setMinAddon(e.target.value)}
            />
          </div>
          <Button size="sm" onClick={handleSave} disabled={saving || !instanceName}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </Button>
          <Button size="sm" variant="outline" onClick={handleSetAll} disabled={settingAll || (!minParser && !minAddon)}>
            {settingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : "Set All"}
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : requirements && requirements.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-muted-foreground text-left">
                <th className="py-2 pr-4">Instance</th>
                <th className="py-2 pr-4">Min Parser</th>
                <th className="py-2 pr-4">Min Addon</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {requirements.map((req) => (
                <tr key={req.instance_name} className="border-b border-zinc-800/50">
                  <td className="py-2 pr-4">{req.instance_name}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{req.min_parser_version || "—"}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{req.min_addon_version || "—"}</td>
                  <td className="py-2">
                    <Button variant="ghost" size="sm" onClick={() => handleEdit(req)}>
                      Edit
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">
            No version requirements configured. All qualified runs will appear on leaderboards.
          </p>
        )}
      </Card>
      <Card className="space-y-4 p-4">
        <div>
          <h3 className="font-semibold">Rating maintenance</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Both dispatchers also run daily. Repair missing Renown kill facts across all tenants first, wait for its child jobs to finish,
            then rebuild ratings (including Renown scores) across all tenants with realms. Scoring is fixed; Renown awards follow each realm's game flavor.
            Enqueueing is not the same as publishing scores.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" disabled={pendingRatingJob !== null} onClick={() => void enqueueRatingMaintenance("renown-repair")}>
            {pendingRatingJob === "renown-repair" && <Loader2 className="mr-2 size-4 animate-spin" />}
            Repair Renown facts (all tenants)
          </Button>
          <Button disabled={pendingRatingJob !== null} onClick={() => void enqueueRatingMaintenance("rebuild-all")}>
            {pendingRatingJob === "rebuild-all" && <Loader2 className="mr-2 size-4 animate-spin" />}
            Rebuild ratings + Renown (all tenants with realms)
          </Button>
        </div>
        {ratingJobResult && (
          <p role="status" className="text-sm text-muted-foreground">
            {ratingJobResult.action === "renown-repair" ? "Renown repair" : "Rating rebuild"} {ratingJobResult.job.unique_skipped_as_duplicate ? "was already queued" : "was queued"}
            {" "}(job #{ratingJobResult.job.job_id}, {ratingJobResult.job.job_state}). Check the River jobs dashboard for completion.
          </p>
        )}
        {ratingJobError && <p role="alert" className="text-sm text-destructive">{ratingJobError}</p>}
      </Card>
    </div>
  );
}
