import { ExternalLink } from "lucide-react"
import { useDiscoverableServers } from "@/api/queries"
import type { DiscoveryEntry } from "@/api/typesGenerated"
import { SUPPORTER_GOLD } from "@/components/Supporter/supporterUpsell"
import { cn } from "@/lib/utils"

function ServerCard({ server }: { server: DiscoveryEntry }) {
  const branding = server.branding
  const name = branding?.display_name || (server.url ? new URL(server.url).host : "Chronicle")
  const current = server.current ?? false
  const players = server.unique_players_14d

  return (
    <a
      href={server.url || undefined}
      target={current ? undefined : "_blank"}
      rel="noopener noreferrer"
      className={cn(
        "group flex items-center gap-3 rounded-lg border p-3 transition-colors",
        current
          ? "border-emerald-500/60 bg-emerald-500/10 ring-1 ring-emerald-500/30"
          : "border-border bg-card/60 hover:border-[#c9a227]/60 hover:bg-card",
      )}
    >
      {branding?.square_logo ? (
        <img src={branding.square_logo} alt="" className="size-10 shrink-0 rounded object-contain" />
      ) : (
        <span className="flex size-10 shrink-0 items-center justify-center rounded bg-muted font-wow text-lg text-muted-foreground">{name.charAt(0)}</span>
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className={cn("truncate font-medium text-white", !current && "group-hover:text-[#f0c060]")}>{name}</span>
          {current ? (
            <span className="shrink-0 rounded-full border border-emerald-500/50 bg-emerald-500/10 px-1.5 text-[10px] uppercase tracking-wider text-emerald-300">You are here</span>
          ) : (
            <ExternalLink className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
          )}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {branding?.tagline || (players ? `${players.toLocaleString()} players in the last 14 days` : " ")}
        </span>
      </span>
    </a>
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

  return (
    <section aria-labelledby="shared-servers-heading" className="space-y-3">
      <div>
        <h2 id="shared-servers-heading" className="font-wow text-2xl" style={{ color: SUPPORTER_GOLD }}>
          One reputation, every server
        </h2>
        <p className="text-sm text-muted-foreground">
          Your tier follows your account. Perks apply on all {sorted.length} Chronicle {sorted.length === 1 ? "server" : "servers"} below.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map((server) => (
          <ServerCard key={server.url || server.branding?.display_name} server={server} />
        ))}
      </div>
    </section>
  )
}
