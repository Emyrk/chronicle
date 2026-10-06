import { useState } from "react";
import { AlertTriangle, Blocks, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/Switch/Switch";
import { resolveCustomPanelInstallation } from "@/pages/Instance/EventsPanels/custom/pluginApi";
import { useCustomPanelRegistry } from "@/pages/Instance/EventsPanels/custom/pluginRegistry";
import { setCustomPanelInstallationEnabled, setCustomPanelsEnabled, uninstallCustomPanel, upsertCustomPanelInstallation } from "@/pages/Instance/EventsPanels/custom/pluginStorage";
import type { ResolveCustomPanelResponse } from "@/pages/Instance/EventsPanels/custom/pluginTypes";

function artifactSummary(result: ResolveCustomPanelResponse): string {
  return Object.entries(result.artifacts).filter((entry) => entry[1]).map(([name, artifact]) => `${name}: ${artifact!.sha256} (${artifact!.size} bytes)`).join("\n");
}

export function CustomPanelSettings() {
  const registry = useCustomPanelRegistry();
  const [repository, setRepository] = useState("");
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const install = async (repositoryInput = repository, refInput = ref, update = false) => {
    setBusy(repositoryInput || "install");
    try {
      const result = await resolveCustomPanelInstallation(repositoryInput, refInput);
      const approved = window.confirm([
        "Trusted custom code warning",
        "",
        "Custom panels execute arbitrary JavaScript with access to the Chronicle page, your authenticated session, and combat-log data. Only install panels from authors you trust.",
        "",
        `Repository: ${result.repository}`,
        `Commit: ${result.commit_sha}`,
        `Manifest: schema ${result.manifest.schema_version}, host API ${result.manifest.host.api_version}`,
        artifactSummary(result),
        `Panels: ${result.manifest.panels.map((panel) => `${panel.name} [${panel.streams.join(", ")}]`).join("; ")}`,
      ].join("\n"));
      if (!approved) return;
      const existing = registry.installations.find((item) => item.repository === result.repository);
      const now = new Date().toISOString();
      upsertCustomPanelInstallation({
        repository: result.repository,
        commitSha: result.commit_sha,
        installedRef: refInput.trim(),
        manifest: result.manifest,
        manifestSha256: result.manifest_sha256,
        artifacts: result.artifacts,
        enabled: existing?.enabled ?? true,
        installedAt: existing?.installedAt ?? now,
        updatedAt: now,
      });
      setRepository(""); setRef("");
      toast.success(update ? "Custom panel updated" : "Custom panel installed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Custom panel request failed");
    } finally { setBusy(null); }
  };

  return <div className="max-w-4xl space-y-6">
    <div><h2 className="flex items-center gap-2 text-xl font-semibold"><Blocks className="h-5 w-5" />Custom panels</h2><p className="text-muted-foreground">Manage browser-local trusted JavaScript panel plugins. <a className="underline hover:text-foreground" href="https://github.com/Emyrk/chronicle-panel" target="_blank" rel="noreferrer">Read the example and authoring guide.</a></p></div>
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm"><div className="flex gap-3"><AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" /><p><strong>Trusted code only.</strong> Custom panels execute arbitrary JavaScript with access to the Chronicle page, your authenticated session, and combat-log data. Only install panels from authors you trust.</p></div></div>
    <div className="flex items-center justify-between rounded-lg border p-4"><div><p className="font-medium">Enable trusted custom JavaScript panels</p><p className="text-sm text-muted-foreground">Disabled by default. Existing layout references remain preserved.</p></div><Switch checked={registry.enabled} onCheckedChange={setCustomPanelsEnabled} /></div>
    <div className="space-y-3 rounded-lg border p-4"><h3 className="font-medium">Install from public GitHub repository</h3><div className="grid gap-2 sm:grid-cols-[1fr_220px_auto]"><Input value={repository} onChange={(event) => setRepository(event.target.value)} placeholder="owner/repository or GitHub URL" /><Input value={ref} onChange={(event) => setRef(event.target.value)} placeholder="ref (optional)" /><Button disabled={!repository.trim() || busy !== null} onClick={() => void install()}>Resolve and install</Button></div></div>
    {registry.corruptRecords > 0 && <p className="text-sm text-destructive">Ignored {registry.corruptRecords} corrupt installation record(s).</p>}
    <div className="space-y-3">{registry.installations.map((installation) => <div key={installation.repository} className="rounded-lg border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-medium">{installation.manifest.plugin.name}</h3><p className="font-mono text-xs text-muted-foreground">{installation.repository}@{installation.commitSha}</p><p className="mt-1 text-sm text-muted-foreground">{installation.manifest.panels.map((panel) => panel.name).join(", ")}</p></div><div className="flex items-center gap-2"><Switch checked={installation.enabled} onCheckedChange={(enabled) => setCustomPanelInstallationEnabled(installation.repository, enabled)} /><Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void install(installation.repository, installation.installedRef, true)}><RefreshCw className="mr-1 h-3.5 w-3.5" />Update</Button><Button size="sm" variant="outline" onClick={() => { if (window.confirm(`Uninstall ${installation.repository}? Layout references will be preserved.`)) uninstallCustomPanel(installation.repository); }}><Trash2 className="mr-1 h-3.5 w-3.5" />Uninstall</Button></div></div></div>)}</div>
  </div>;
}
