import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { ChevronRight, Compass, Globe2, Search, ShieldCheck, X } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useDiscoverableServers, useSiteConfig } from "@/api/queries";
import type { DiscoveryEntry } from "@/api/typesGenerated";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type RootCommunityContextValue = {
  enabled: boolean;
  dismissed: boolean;
  dialogOpen: boolean;
  setDialogOpen: (open: boolean) => void;
  dismiss: () => void;
  servers: readonly DiscoveryEntry[];
  serversLoading: boolean;
};

const RootCommunityState = createContext<RootCommunityContextValue>({
  enabled: false,
  dismissed: false,
  dialogOpen: false,
  setDialogOpen: () => {},
  dismiss: () => {},
  servers: [],
  serversLoading: false,
});

function useRootCommunityState(): RootCommunityContextValue {
  return useContext(RootCommunityState);
}

export function RootCommunityProvider({
  children,
  initialDismissed = false,
  initialDialogOpen = false,
}: {
  children: ReactNode;
  initialDismissed?: boolean;
  initialDialogOpen?: boolean;
}) {
  const { data: siteConfig } = useSiteConfig();
  const [dismissed, setDismissed] = useState(initialDismissed);
  const [dialogOpen, setDialogOpen] = useState(initialDialogOpen);
  const enabled = !!(siteConfig?.root_domain_discovery && !siteConfig.tenant);
  const { data: servers = [], isLoading: serversLoading } = useDiscoverableServers(enabled);

  const value = useMemo(
    () => ({
      enabled,
      dismissed,
      dialogOpen,
      setDialogOpen,
      dismiss: () => setDismissed(true),
      servers,
      serversLoading,
    }),
    [dialogOpen, dismissed, enabled, servers, serversLoading],
  );

  return <RootCommunityState.Provider value={value}>{children}</RootCommunityState.Provider>;
}

function serverName(server: DiscoveryEntry): string {
  return server.branding?.display_name || new URL(server.url).hostname.split(".")[0] || "Community";
}

function serverDetail(server: DiscoveryEntry): string {
  return server.branding?.tagline || new URL(server.url).hostname;
}

function destinationURL(server: DiscoveryEntry, location: ReturnType<typeof useLocation>): string {
  return new URL(location.pathname + location.search + location.hash, server.url).toString();
}

function CommunityMark({ server, large = false }: { server: DiscoveryEntry; large?: boolean }) {
  const name = serverName(server);
  const size = large ? "size-12 rounded-xl text-lg" : "size-9 rounded-lg text-sm";
  if (server.branding?.square_logo) {
    return <img src={server.branding.square_logo} alt="" className={cn(size, "shrink-0 object-contain")} />;
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        size,
        "flex shrink-0 items-center justify-center border border-primary/25 bg-primary/10 font-wow font-semibold text-(--tertiary)",
      )}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

function CommunityStack({ servers, onChoose }: { servers: readonly DiscoveryEntry[]; onChoose: () => void }) {
  const shown = servers.slice(0, 3);
  const extra = servers.length - shown.length;
  if (shown.length === 0) return null;

  return (
    <button
      type="button"
      onClick={onChoose}
      aria-label="Browse communities"
      className="group hidden shrink-0 items-center -space-x-2 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex"
    >
      {shown.map((server, index) => (
        <span
          key={server.url}
          style={{ zIndex: shown.length - index }}
          className="relative rounded-[0.6rem] bg-background p-0.5 ring-1 ring-primary/30 transition-transform group-hover:-translate-y-0.5"
        >
          <CommunityMark server={server} />
        </span>
      ))}
      {extra > 0 && (
        <span className="relative flex size-10 items-center justify-center rounded-[0.6rem] bg-background font-mono text-[11px] text-muted-foreground ring-1 ring-primary/30 transition-colors group-hover:text-(--tertiary)">
          +{extra}
        </span>
      )}
    </button>
  );
}

export function RootCommunityBanner() {
  const { enabled, dismissed, setDialogOpen, dismiss, servers } = useRootCommunityState();

  if (!enabled || dismissed) return null;

  return (
    <section
      aria-label="Community context"
      className="relative overflow-hidden border-b border-primary/20 bg-[linear-gradient(100deg,color-mix(in_srgb,var(--primary)_16%,var(--background))_0%,color-mix(in_srgb,var(--primary)_5%,var(--background))_45%,var(--background)_80%)]"
    >
      <div className="absolute inset-y-0 left-0 w-1 bg-linear-to-b from-(--tertiary) via-primary/60 to-transparent" />
      <div className="absolute -top-16 left-[8%] size-48 rounded-full bg-primary/15 blur-3xl" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,color-mix(in_oklch,var(--foreground)_4%,transparent)_1px,transparent_1px)] mask-[linear-gradient(to_right,black,transparent_55%)] bg-size-[22px_100%]" />
      <div className="absolute inset-x-0 bottom-0 h-px bg-linear-to-r from-transparent via-primary/60 to-transparent" />

      <div className="relative mx-auto flex max-w-7xl flex-col gap-3 py-3.5 pr-12 pl-5 sm:flex-row sm:items-center sm:gap-5 sm:pr-4 sm:pl-6">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <CommunityStack servers={servers} onChoose={() => setDialogOpen(true)} />
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-(--tertiary)">
              <Globe2 className="size-3" aria-hidden="true" />
              All communities
            </p>
            <p className="mt-0.5 font-wow text-base leading-snug text-foreground sm:text-lg">
              You’re viewing Chronicle across every community
            </p>
            <p className="hidden text-sm text-muted-foreground sm:block">
              Pick where you play for its logs, rankings, and game data.
            </p>
          </div>
        </div>
        <Button size="sm" onClick={() => setDialogOpen(true)} className="group gap-2 shadow-lg shadow-primary/20 sm:h-9 sm:px-4">
          <Compass className="size-4 transition-transform group-hover:rotate-45" aria-hidden="true" />
          Choose community
          <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={dismiss}
          aria-label="Dismiss for this session"
          className="absolute top-2 right-2 size-8 text-muted-foreground hover:text-foreground sm:static"
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </section>
  );
}

export function RootCommunityNavButton({ mobile = false }: { mobile?: boolean }) {
  const { enabled, dismissed, setDialogOpen } = useRootCommunityState();
  if (!enabled || !dismissed) return null;

  if (mobile) {
    return (
      <Button variant="outline" size="icon" onClick={() => setDialogOpen(true)} aria-label="Choose community" className="border-primary/30 bg-primary/5">
        <Globe2 className="size-4 text-(--tertiary)" />
      </Button>
    );
  }

  return (
    <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)} className="gap-2 border-primary/30 bg-primary/5">
      <Globe2 className="size-4 text-(--tertiary)" />
      Choose community
    </Button>
  );
}

export function RootCommunityDialog() {
  const { enabled, dialogOpen, setDialogOpen, servers, serversLoading } = useRootCommunityState();
  const location = useLocation();
  const [query, setQuery] = useState("");

  if (!enabled) return null;

  const normalizedQuery = query.trim().toLowerCase();
  const shown = servers.filter((server) =>
    `${serverName(server)} ${serverDetail(server)}`.toLowerCase().includes(normalizedQuery),
  );

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogContent className="max-h-[88vh] gap-0 overflow-hidden border-primary/20 p-0 sm:max-w-2xl">
        <DialogHeader className="border-b bg-card/80 px-5 py-5 text-left sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-(--tertiary)">
              <Compass className="size-5" aria-hidden="true" />
            </span>
            <div>
              <DialogTitle className="font-wow text-2xl">Choose your community</DialogTitle>
              <DialogDescription className="mt-1">
                Open Chronicle with the logs, rankings, and game data for where you play.
              </DialogDescription>
            </div>
          </div>
          <label className="mt-4 flex items-center gap-2 rounded-lg border bg-background/70 px-3 py-2.5 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/15">
            <Search className="size-4 text-muted-foreground" aria-hidden="true" />
            <span className="sr-only">Find a community</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a community"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </label>
        </DialogHeader>

        <div className="styled-scrollbar grid max-h-[52vh] gap-2 overflow-y-auto bg-background p-3 sm:grid-cols-2 sm:p-4">
          {serversLoading ? (
            <p className="col-span-full py-8 text-center text-sm text-muted-foreground">Loading communities…</p>
          ) : shown.length === 0 ? (
            <p className="col-span-full py-8 text-center text-sm text-muted-foreground">No communities match that search.</p>
          ) : (
            shown.map((server) => (
              <a
                key={server.url}
                href={destinationURL(server, location)}
                className="group flex min-w-0 items-center gap-3 rounded-xl border bg-card/55 p-3 text-left transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:bg-card hover:shadow-lg hover:shadow-black/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <CommunityMark server={server} large />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold group-hover:text-(--tertiary)">{serverName(server)}</span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">{serverDetail(server)}</span>
                  {server.unique_players_14d !== undefined && (
                    <span className="mt-1 block font-mono text-[10px] uppercase tracking-wide text-muted-foreground/70">
                      {server.unique_players_14d.toLocaleString()} recent players
                    </span>
                  )}
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-(--tertiary)" aria-hidden="true" />
              </a>
            ))
          )}
        </div>

        <div className="flex items-center gap-2 border-t bg-card/60 px-5 py-3 text-xs text-muted-foreground">
          <ShieldCheck className="size-4 text-emerald-400" aria-hidden="true" />
          Your account and supporter status work across every community.
        </div>
      </DialogContent>
    </Dialog>
  );
}
