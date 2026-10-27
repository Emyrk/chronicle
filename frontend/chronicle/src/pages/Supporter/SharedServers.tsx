import { ExternalLink, Plus } from "lucide-react"
import { useDiscoverableServers, useSiteConfig } from "@/api/queries"
import type { DiscoveryEntry } from "@/api/typesGenerated"
import { SUPPORTER_GOLD } from "@/components/Supporter/supporterUpsell"
import { HintTooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip/tooltip"
import { cn } from "@/lib/utils"

/** Above this many servers, everything but the current one collapses into a stack of logos. */
const MAX_CARDS = 3
/** Logos shown in the stack before the rest fold into a "+N" chip. */
const MAX_STACKED = 10

function serverName(server: DiscoveryEntry): string {
  // Without a display name, the subdomain ("faebright") reads better than the full host.
  return server.branding?.display_name || (server.url ? new URL(server.url).hostname.split(".")[0] : "Chronicle")
}

function serverDetail(server: DiscoveryEntry): string | undefined {
  const players = server.unique_players_14d
  return server.branding?.tagline || (players ? `${players.toLocaleString()} players in the last 14 days` : undefined)
}

function isHere(url: string): boolean {
  try {
    // Hostname only: in dev the API reports the backend port, not the page port.
    return new URL(url).hostname === window.location.hostname
  } catch {
    return false
  }
}

/**
 * The server serving this page. Prefers the API's flag, then a URL match, and
 * otherwise builds an entry from site config, since the site you're on may not
 * be discoverable itself.
 */
function useCurrentServer(servers: readonly DiscoveryEntry[] | undefined): DiscoveryEntry | undefined {
  const { data: siteConfig } = useSiteConfig()
  if (!servers) return undefined
  const listed = servers.find((s) => s.current) ?? servers.find((s) => s.url && isHere(s.url))
  if (listed) return { ...listed, current: true }
  if (!siteConfig) return undefined
  const branding = siteConfig.tenant?.branding ?? siteConfig.branding
  return {
    branding: {
      ...branding,
      display_name: branding?.display_name || siteConfig.tenant?.name || "Chronicle",
      square_logo: branding?.square_logo || "/c/chronicle/ChronicleIconSquare.webp",
      tagline: branding?.tagline || "The server you are browsing",
    },
    url: window.location.origin,
    current: true,
  }
}

function ServerLogo({ server, className }: { server: DiscoveryEntry; className?: string }) {
  const logo = server.branding?.square_logo
  if (logo) return <img src={logo} alt="" className={cn("shrink-0 object-contain", className)} />
  return (
    <span className={cn("flex shrink-0 items-center justify-center bg-muted font-wow text-muted-foreground", className)}>
      {serverName(server).charAt(0)}
    </span>
  )
}

function ServerCard({ server }: { server: DiscoveryEntry }) {
  const current = server.current ?? false

  return (
    <a
      href={server.url || undefined}
      target={current ? undefined : "_blank"}
      rel="noopener noreferrer"
      className={cn(
        "group flex min-w-0 items-center gap-3 rounded-lg border p-3 transition-colors",
        current
          ? "border-emerald-500/60 bg-emerald-500/10 ring-1 ring-emerald-500/30"
          : "border-border bg-card/60 hover:border-[#c9a227]/60 hover:bg-card",
      )}
    >
      <ServerLogo server={server} className="size-10 rounded text-lg" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className={cn("truncate font-medium text-white", !current && "group-hover:text-[#f0c060]")}>{serverName(server)}</span>
          {current ? (
            <span className="shrink-0 rounded-full border border-emerald-500/50 bg-emerald-500/10 px-1.5 text-[10px] uppercase tracking-wider text-emerald-300">You are here</span>
          ) : (
            <ExternalLink className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
          )}
        </span>
        <span className="block truncate text-xs text-muted-foreground">{serverDetail(server) ?? " "}</span>
      </span>
    </a>
  )
}

const UNLISTED_NOTE = "Your tier also applies on Chronicle servers that aren't publicly listed."

/** Marks that the list is only the discoverable subset of servers. Compact renders as a stack coin. */
function MoreServers({ compact = false }: { compact?: boolean }) {
  return (
    <HintTooltip delayDuration={100}>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          aria-label="More servers"
          className={cn(
            "flex shrink-0 cursor-help items-center justify-center gap-1 border border-dashed border-muted-foreground/50 bg-background text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
            compact ? "relative size-9 rounded-full ring-2 ring-background" : "h-16 rounded-lg text-sm",
          )}
        >
          <Plus className="size-4" aria-hidden="true" />
          {compact ? null : "more servers"}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">{UNLISTED_NOTE}</TooltipContent>
    </HintTooltip>
  )
}

/** Overlapping round logos, each linking to its server with the name on hover. */
function ServerStack({ servers }: { servers: DiscoveryEntry[] }) {
  const shown = servers.slice(0, MAX_STACKED)
  const hidden = servers.length - shown.length

  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex shrink-0 -space-x-2">
        {shown.map((server) => (
          <HintTooltip key={server.url || serverName(server)} delayDuration={100}>
            <TooltipTrigger asChild>
              <a
                href={server.url || undefined}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={serverName(server)}
                className="relative rounded-full ring-2 ring-background transition-transform hover:z-10 hover:-translate-y-0.5 focus-visible:z-10"
              >
                <ServerLogo server={server} className="size-9 rounded-full bg-zinc-800 text-sm text-zinc-200" />
              </a>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="font-medium text-white">{serverName(server)}</p>
              {serverDetail(server) ? <p className="text-muted-foreground">{serverDetail(server)}</p> : null}
            </TooltipContent>
          </HintTooltip>
        ))}
        {hidden > 0 ? (
          <span className="relative flex size-9 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground ring-2 ring-background">
            +{hidden}
          </span>
        ) : null}
        <MoreServers compact />
      </div>
      <div className="min-w-0 leading-tight">
        <p className="text-sm font-medium text-zinc-200">
          {servers.length} more {servers.length === 1 ? "server" : "servers"}
        </p>
        <p className="text-xs text-muted-foreground">plus unlisted ones</p>
      </div>
    </div>
  )
}

/** Every discoverable server; one supporter tier applies on all of them. */
export function SharedServers() {
  const { data: servers } = useDiscoverableServers()
  const current = useCurrentServer(servers)
  if (!servers || (servers.length === 0 && !current)) return null

  // The server you're on first, then the busiest, then alphabetical.
  const others = servers
    .filter((s) => !current || s.url !== current.url)
    .sort((a, b) => (b.unique_players_14d ?? 0) - (a.unique_players_14d ?? 0) || serverName(a).localeCompare(serverName(b)))
  const sorted = current ? [current, ...others] : others

  return (
    <section aria-labelledby="shared-servers-heading" className="space-y-3">
      <div>
        <h2 id="shared-servers-heading" className="font-wow text-2xl" style={{ color: SUPPORTER_GOLD }}>
          One reputation, every server
        </h2>
        <p className="text-sm text-muted-foreground">
          Your tier follows your account. Perks apply on every Chronicle server, including these.
        </p>
      </div>
      {sorted.length <= MAX_CARDS ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((server) => (
            <ServerCard key={server.url || serverName(server)} server={server} />
          ))}
          <MoreServers />
        </div>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
          {current ? (
            <div className="sm:w-80 sm:shrink-0">
              <ServerCard server={current} />
            </div>
          ) : null}
          <ServerStack servers={others} />
        </div>
      )}
    </section>
  )
}
