import { ExternalLink } from "lucide-react"
import { useDiscoverableServers } from "@/api/queries"
import type { DiscoveryEntry } from "@/api/typesGenerated"
import { SUPPORTER_GOLD } from "@/components/Supporter/supporterUpsell"
import { HintTooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip/tooltip"
import { cn } from "@/lib/utils"

/** Above this many servers, everything but the current one collapses into a stack of logos. */
const MAX_CARDS = 3
/** Logos shown in the stack before the rest fold into a "+N" chip. */
const MAX_STACKED = 10

function serverName(server: DiscoveryEntry): string {
  return server.branding?.display_name || (server.url ? new URL(server.url).host : "Chronicle")
}

function serverDetail(server: DiscoveryEntry): string | undefined {
  const players = server.unique_players_14d
  return server.branding?.tagline || (players ? `${players.toLocaleString()} players in the last 14 days` : undefined)
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

/** Overlapping round logos, each linking to its server with the name on hover. */
function ServerStack({ servers }: { servers: DiscoveryEntry[] }) {
  const shown = servers.slice(0, MAX_STACKED)
  const hidden = servers.length - shown.length
  const names = servers.map(serverName)
  const label = names.length <= 2 ? names.join(" and ") : `${names.slice(0, 2).join(", ")} and ${names.length - 2} more`

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
      </div>
      <span className="truncate text-sm text-muted-foreground">{label}</span>
    </div>
  )
}

/** Every discoverable server; one supporter tier applies on all of them. */
export function SharedServers() {
  const { data: servers } = useDiscoverableServers()
  if (!servers || servers.length === 0) return null

  // The server you're on first, then the busiest.
  const sorted = [...servers].sort(
    (a, b) => Number(b.current ?? false) - Number(a.current ?? false) || (b.unique_players_14d ?? 0) - (a.unique_players_14d ?? 0),
  )
  const current = sorted[0].current ? sorted[0] : undefined
  const others = current ? sorted.slice(1) : sorted

  return (
    <section aria-labelledby="shared-servers-heading" className="space-y-3">
      <div>
        <h2 id="shared-servers-heading" className="font-wow text-2xl" style={{ color: SUPPORTER_GOLD }}>
          One reputation, every server
        </h2>
        <p className="text-sm text-muted-foreground">
          Your tier follows your account. Perks apply on all {sorted.length} Chronicle {sorted.length === 1 ? "server" : "servers"}.
        </p>
      </div>
      {sorted.length <= MAX_CARDS ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((server) => (
            <ServerCard key={server.url || serverName(server)} server={server} />
          ))}
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
