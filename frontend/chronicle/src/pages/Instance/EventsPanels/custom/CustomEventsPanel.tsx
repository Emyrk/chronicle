import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { AlertTriangle, Blocks, ClipboardPaste, Copy, EllipsisVertical, ExternalLink, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/Card/Card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu/DropdownMenu";
import { PortalContainerProvider, usePortalContainer } from "@/components/ui/PortalContainerContext";
import { useIsMobile } from "@/hooks/useIsMobile";
import { PanelCard } from "../PanelCard";
import { PanelSelector } from "../PanelSelector";
import { openPanelPopup, syncPopupAppearance, type PanelPopup } from "../panelPopup";
import { isBuiltinPanelType, type EventsPanelProps, type EventsPanelType } from "../EventsPanel";
import { useUpdateCustomPanelAccountSettings } from "./pluginAccountStorage";
import { CustomPanelErrorBoundary } from "./CustomPanelErrorBoundary";
import { CustomPanelHost } from "./CustomPanelHost";
import { resolveCustomPanel, useCustomPanelRegistry } from "./pluginRegistry";
import { isCustomPanelRef } from "./pluginTypes";

const PANEL_CLIPBOARD_KEY = "panel-clipboard";

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
  const updateSettings = useUpdateCustomPanelAccountSettings();
  const inheritedPortalContainer = usePortalContainer();
  const isMobile = useIsMobile();
  const [retryKey, setRetryKey] = useState(0);
  const [error, setError] = useState<Error | null>(null);
  const [panelPopup, setPanelPopup] = useState<PanelPopup | null>(null);
  const panelPopupRef = useRef<PanelPopup | null>(null);
  const safeMode = useMemo(() => new URLSearchParams(window.location.search).get("safe") === "1", []);
  const resolved = isCustomPanelRef(props.panelType) ? resolveCustomPanel(props.panelType, registry) : null;
  const handleError = useCallback((next: Error) => setError(next), []);
  const switchToEmpty = () => props.onPanelTypeChange("empty");
  const retry = () => { setError(null); setRetryKey((value) => value + 1); };
  const title = resolved?.panel?.name ?? resolved?.panelId ?? "Custom panel";
  const effectivePanelId = props.panelId ?? `panel-${props.panelIndex}`;
  const popupTitle = `${title} — Chronicle`;

  useEffect(() => {
    setError(null);
  }, [props.panelType, resolved?.installation?.commitSha]);

  const dockPanel = useCallback(() => {
    const popup = panelPopupRef.current;
    panelPopupRef.current = null;
    setPanelPopup(null);
    if (popup && !popup.window.closed) popup.window.close();
  }, []);

  const popOutPanel = useCallback(() => {
    const existing = panelPopupRef.current;
    if (existing && !existing.window.closed) {
      existing.window.focus();
      return;
    }
    const ownerWindow = inheritedPortalContainer?.ownerDocument.defaultView ?? window;
    const popup = openPanelPopup(ownerWindow, effectivePanelId, popupTitle);
    if (!popup) {
      toast.error("The panel popup was blocked. Allow popups for Chronicle and try again.");
      return;
    }
    panelPopupRef.current = popup;
    setPanelPopup(popup);
    popup.window.focus();
  }, [effectivePanelId, inheritedPortalContainer, popupTitle]);

  useEffect(() => {
    if (!panelPopup) return;
    const popupWindow = panelPopupRef.current?.window;
    if (!popupWindow) return;
    const handlePopupClose = () => {
      if (panelPopupRef.current?.window === popupWindow) {
        panelPopupRef.current = null;
        setPanelPopup(null);
      }
    };
    const syncAppearance = () => {
      // eslint-disable-next-line react-hooks/immutability -- popup windows require imperative DOM synchronization.
      if (!popupWindow.closed) {
        syncPopupAppearance(document, popupWindow.document);
        popupWindow.document.title = popupTitle;
      }
    };
    syncAppearance();
    popupWindow.addEventListener("beforeunload", handlePopupClose);
    const observer = new MutationObserver(syncAppearance);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme", "style"] });
    observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    return () => {
      popupWindow.removeEventListener("beforeunload", handlePopupClose);
      observer.disconnect();
    };
  }, [panelPopup, popupTitle]);

  useEffect(() => () => {
    const popup = panelPopupRef.current;
    panelPopupRef.current = null;
    if (popup && !popup.window.closed) popup.window.close();
  }, []);

  const copyPanel = useCallback(() => {
    const json = JSON.stringify({ panelType: props.panelType, panelOption: props.panelOption ?? null, filters: [] });
    navigator.clipboard.writeText(json).then(() => toast.success("Panel copied to clipboard")).catch(() => {
      sessionStorage.setItem(PANEL_CLIPBOARD_KEY, json);
    });
  }, [props.panelOption, props.panelType]);

  const pastePanel = useCallback(async () => {
    let raw: string | null = null;
    try { raw = await navigator.clipboard.readText(); }
    catch { raw = sessionStorage.getItem(PANEL_CLIPBOARD_KEY); }
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as { panelType?: EventsPanelType; panelOption?: string | null };
      if (!parsed.panelType || (!isBuiltinPanelType(parsed.panelType) && !isCustomPanelRef(parsed.panelType))) return;
      props.onPanelTypeChange(parsed.panelType);
      props.onPanelOptionChange?.(parsed.panelOption ?? null);
    } catch {
      // Ignore malformed clipboard data.
    }
  }, [props]);

  let content;
  if (!resolved || resolved.state === "invalid") content = <Placeholder title="Invalid custom panel" detail="This panel reference is malformed, but it remains preserved in the layout." onEmpty={switchToEmpty} />;
  else if (safeMode) content = <Placeholder title="Custom panels disabled by safe mode" detail="Remove ?safe=1 after fixing or disabling the plugin." repository={resolved.repository} onEmpty={switchToEmpty} />;
  else if (resolved.state !== "available" || !resolved.installation || !resolved.panel) content = <Placeholder title={`Custom panel ${resolved.state}`} detail="Install or enable this trusted plugin in Settings to recover this panel." repository={resolved.repository} onEmpty={switchToEmpty} />;
  else if (error) content = <Placeholder title="Custom panel failed" detail={error.message} repository={`${resolved.repository}@${resolved.installation.commitSha}`} onRetry={retry} onDisable={() => { void updateSettings.mutateAsync({ enabled: registry.enabled, installations: registry.installations.map((item) => item.repository === resolved.repository ? { ...item, enabled: false, updatedAt: new Date().toISOString() } : item), expectedRevision: registry.revision }).catch((nextError) => toast.error(nextError instanceof Error ? nextError.message : "Custom panel settings update failed")); }} onEmpty={switchToEmpty} />;
  else content = <CustomPanelErrorBoundary key={`${props.panelType}:${resolved.installation.commitSha}:${retryKey}`} fallback={(caught) => <Placeholder title="Custom panel failed" detail={caught.message} repository={resolved.repository} onRetry={retry} onEmpty={switchToEmpty} />}><CustomPanelHost installation={resolved.installation} panel={resolved.panel} context={props.context} panelId={effectivePanelId} panelOption={props.panelOption} onPanelOptionChange={props.onPanelOptionChange} onError={handleError} /></CustomPanelErrorBoundary>;

  const renderedPanel = <PanelCard flipped={false} front={<><div className="mb-1 flex items-center justify-between"><div className="flex min-w-0 items-center gap-2"><Blocks className="h-4 w-4 shrink-0 text-muted-foreground" /><PanelSelector value={props.panelType} onChange={props.onPanelTypeChange} /><span className="truncate text-xs text-muted-foreground">{title}</span></div><DropdownMenu modal={false}><DropdownMenuTrigger asChild><span className="cursor-pointer text-muted-foreground hover:text-foreground"><EllipsisVertical className="h-3.5 w-3.5" /></span></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={copyPanel}><Copy className="mr-2 h-3.5 w-3.5" />Copy</DropdownMenuItem><DropdownMenuItem onClick={() => void pastePanel()}><ClipboardPaste className="mr-2 h-3.5 w-3.5" />Paste</DropdownMenuItem><DropdownMenuItem onClick={panelPopup ? dockPanel : popOutPanel} disabled={isMobile}>{panelPopup ? <Undo2 className="mr-2 h-3.5 w-3.5" /> : <ExternalLink className="mr-2 h-3.5 w-3.5" />}{panelPopup ? "Dock panel" : "Pop out"}</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div><div className="min-h-0 flex-1">{content}</div></>} back={null} />;

  const portalContainer = panelPopup?.container ?? inheritedPortalContainer;
  return <PortalContainerProvider container={portalContainer}>{panelPopup ? <><Card className="mb-0 flex h-full items-center justify-center gap-3 p-4 text-center"><ExternalLink className="h-6 w-6 text-muted-foreground" /><div><p className="text-sm font-medium">{title} is popped out</p><p className="mt-1 text-xs text-muted-foreground">It remains synced with this window.</p></div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => panelPopup.window.focus()}>Focus window</Button><Button size="sm" onClick={dockPanel}><Undo2 className="mr-1.5 h-3.5 w-3.5" />Dock panel</Button></div></Card>{ReactDOM.createPortal(<div className="h-full bg-background p-2 text-foreground">{renderedPanel}</div>, panelPopup.container)}</> : renderedPanel}</PortalContainerProvider>;
}
