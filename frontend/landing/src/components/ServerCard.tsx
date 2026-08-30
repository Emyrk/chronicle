import type { ServerEntry } from "../types";
import { AttributeBadges } from "./AttributeBadges";
import { StatusBadges } from "./StatusBadges";

function ExternalIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

function DiscordIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="shrink-0">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.947 2.418-2.157 2.418z" />
    </svg>
  );
}

function HostedByChronicleBadge({ tooltipId, compact = false }: { tooltipId: string; compact?: boolean }) {
  return (
    <div className="group/hosted relative z-10 inline-flex">
      <a
        href="/support/"
        aria-describedby={tooltipId}
        className={`inline-flex items-center gap-1.5 font-semibold uppercase tracking-wider text-sky-200 outline-none transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-sky-300/70 ${
          compact
            ? "text-[11px]"
            : "rounded-md border border-sky-300/50 bg-slate-950/85 px-2.5 py-1 text-[11px] shadow-lg shadow-black/30 backdrop-blur-sm"
        }`}
      >
        <span aria-hidden="true" className="text-sky-400">◆</span>
        Hosted by Chronicle
      </a>
      <div
        id={tooltipId}
        role="tooltip"
        className="pointer-events-none absolute left-0 top-full z-20 mt-2 w-64 translate-y-1 rounded-md border border-border bg-slate-950 px-3 py-2 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-slate-200 opacity-0 shadow-xl transition group-hover/hosted:pointer-events-auto group-hover/hosted:translate-y-0 group-hover/hosted:opacity-100 group-focus-within/hosted:pointer-events-auto group-focus-within/hosted:translate-y-0 group-focus-within/hosted:opacity-100"
      >
        Chronicle operates this deployment and pays its hosting costs.
        <span className="mt-1 block italic text-muted-foreground">Click to learn more.</span>
      </div>
    </div>
  );
}

export function ServerCard({ server }: { server: ServerEntry }) {
  const isClosed = server.status?.includes("closed");

  return (
    <div
      className={`group relative flex w-full flex-col rounded-lg border bg-card transition-all duration-200 hover:z-10 focus-within:z-10 ${
        isClosed
          ? "border-border/60 saturate-[0.35] hover:saturate-[0.6]"
          : "border-border hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-0.5"
      }`}
      style={server.accentColor ? { "--accent-glow": server.accentColor } as React.CSSProperties : undefined}
    >
      {server.hostedByChronicle && (
        <div className="absolute left-3 top-3 z-20">
          <HostedByChronicleBadge tooltipId={`hosted-tooltip-${server.id}`} />
        </div>
      )}

      {/* Banner */}
      {server.banner ? (
        <div className="relative h-28 overflow-hidden rounded-t-lg bg-muted">
          <img
            src={server.banner}
            alt=""
            className={`absolute inset-0 h-full w-full object-cover transition-opacity ${isClosed ? "opacity-40" : "opacity-60 group-hover:opacity-80"}`}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-card to-transparent" />
          {isClosed && (
            <div className="absolute top-3 right-3 rounded bg-red-900/80 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-red-300 border border-red-500/30">
              Closed
            </div>
          )}
        </div>
      ) : server.hostedByChronicle ? (
        <div className="h-10 rounded-t-lg bg-gradient-to-r from-sky-950/70 to-card" />
      ) : null}

      <div className="flex flex-1 flex-col gap-3 p-5">
        {/* Header: logo + name */}
        <div className="flex items-center gap-3">
          <img
            src={server.logo}
            alt={`${server.name} logo`}
            className="h-10 w-10 shrink-0 rounded-md object-contain"
            onError={(e) => {
              // Hide broken images gracefully
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-foreground truncate">
              {server.name}
            </h3>
            <p className="text-xs text-muted-foreground truncate">
              {server.tagline}
            </p>
          </div>
        </div>

        {/* Description */}
        <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
          {server.description}
        </p>

        {/* Badges */}
        <div className="flex flex-col gap-2">
          <AttributeBadges server={server} />
          <StatusBadges tags={server.status} />
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Action buttons */}
        <div className="flex items-center gap-2 pt-2 border-t border-border">
          <a
            href={server.chronicleUrl}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {isClosed ? "Archived Chronicle" : "Open Chronicle"}
          </a>
          {server.homepageUrl && (
            <a
              href={server.homepageUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground hover:border-foreground/20"
            >
              Website <ExternalIcon />
            </a>
          )}
          {server.discordUrl && (
            <a
              href={server.discordUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground hover:border-foreground/20"
              title="Join Discord"
            >
              <DiscordIcon />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
