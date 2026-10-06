import { useCallback, useMemo, useState } from "react";
import { AlertTriangle, Blocks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PanelCard } from "../PanelCard";
import { PanelSelector } from "../PanelSelector";
import type { EventsPanelProps } from "../EventsPanel";
import { CustomPanelErrorBoundary } from "./CustomPanelErrorBoundary";
import { CustomPanelHost } from "./CustomPanelHost";
import { resolveCustomPanel, useCustomPanelRegistry } from "./pluginRegistry";
import { isCustomPanelRef } from "./pluginTypes";
import { setCustomPanelInstallationEnabled } from "./pluginStorage";

function Placeholder({ title, detail, repository, onRetry, onDisable, onEmpty }: { title: string; detail: string; repository?: string; onRetry?: () => void; onDisable?: () => void; onEmpty: () => void }) {
  return <div className="flex h-full items-center justify-center p-6"><div className="max-w-md space-y-3 text-center">
    <AlertTriangle className="mx-auto h-8 w-8 text-amber-500" />
    <h4 className="font-semibold">{title}</h4><p className="text-sm text-muted-foreground">{detail}</p>
    {repository && <p className="font-mono text-xs">{repository}</p>}
    <div className="flex flex-wrap justify-center gap-2">{onRetry && <Button size="sm" onClick={onRetry}>Retry</Button>}{onDisable && <Button size="sm" variant="outline" onClick={onDisable}>Disable plugin</Button>}<Button size="sm" variant="outline" onClick={() => window.open("/account/custom-panels", "_blank")}>Open Settings</Button><Button size="sm" variant="outline" onClick={onEmpty}>Switch to Empty</Button></div>
  </div></div>;
}

export default function CustomEventsPanel(props: EventsPanelProps) {
  const registry = useCustomPanelRegistry();
  const [retryKey, setRetryKey] = useState(0);
  const [error, setError] = useState<Error | null>(null);
  const safeMode = useMemo(() => new URLSearchParams(window.location.search).get("safe") === "1", []);
  const resolved = isCustomPanelRef(props.panelType) ? resolveCustomPanel(props.panelType, registry) : null;
  const handleError = useCallback((next: Error) => setError(next), []);
  const switchToEmpty = () => props.onPanelTypeChange("empty");
  const retry = () => { setError(null); setRetryKey((value) => value + 1); };
  const title = resolved?.panel?.name ?? resolved?.panelId ?? "Custom panel";

  let content;
  if (!resolved || resolved.state === "invalid") content = <Placeholder title="Invalid custom panel" detail="This panel reference is malformed, but it remains preserved in the layout." onEmpty={switchToEmpty} />;
  else if (safeMode) content = <Placeholder title="Custom panels disabled by safe mode" detail="Remove ?safe=1 after fixing or disabling the plugin." repository={resolved.repository} onEmpty={switchToEmpty} />;
  else if (resolved.state !== "available" || !resolved.installation || !resolved.panel) content = <Placeholder title={`Custom panel ${resolved.state}`} detail="Install or enable this trusted plugin in Settings to recover this panel." repository={resolved.repository} onEmpty={switchToEmpty} />;
  else if (error) content = <Placeholder title="Custom panel failed" detail={error.message} repository={`${resolved.repository}@${resolved.installation.commitSha}`} onRetry={retry} onDisable={() => setCustomPanelInstallationEnabled(resolved.repository!, false)} onEmpty={switchToEmpty} />;
  else content = <CustomPanelErrorBoundary fallback={(caught) => <Placeholder title="Custom panel failed" detail={caught.message} repository={resolved.repository} onRetry={retry} onEmpty={switchToEmpty} />}><CustomPanelHost key={retryKey} installation={resolved.installation} panel={resolved.panel} context={props.context} panelId={props.panelId ?? `panel-${props.panelIndex}`} panelOption={props.panelOption} onPanelOptionChange={props.onPanelOptionChange} onError={handleError} /></CustomPanelErrorBoundary>;

  return <PanelCard flipped={false} front={<><div className="mb-1 flex items-center gap-2"><Blocks className="h-4 w-4 text-muted-foreground" /><PanelSelector value={props.panelType} onChange={props.onPanelTypeChange} /><span className="truncate text-xs text-muted-foreground">{title}</span></div><div className="min-h-0 flex-1">{content}</div></>} back={null} />;
}
