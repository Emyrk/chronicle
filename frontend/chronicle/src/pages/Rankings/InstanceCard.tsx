import type { ReactNode } from "react"
import { Link } from "react-router-dom"
import {
  getInstanceBackground,
  getInstanceAbbrev,
} from "@/pages/Logs/utils/instanceImages"

/** Image-backed instance card shared by the leaderboard landing grids. */
export function InstanceCard({
  name,
  to,
  badge,
  children,
}: {
  name: string
  to: string
  badge?: ReactNode
  children?: ReactNode
}) {
  return (
    <Link
      to={to}
      className="group relative block overflow-hidden rounded-xl border bg-card text-left transition-all hover:border-white/20 hover:shadow-lg aspect-[16/7]"
    >
      {/* Background image */}
      <img
        src={getInstanceBackground(name)}
        alt={name}
        className="absolute inset-0 h-full w-full object-cover transition-transform group-hover:scale-105"
      />
      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/20" />

      {/* Badge — top-right corner */}
      {badge && (
        <div className="absolute top-2.5 right-2.5 z-10 flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-xs font-semibold text-white backdrop-blur-sm border border-white/10">
          {badge}
        </div>
      )}

      {/* Content */}
      <div className="relative flex h-full flex-col justify-end p-4">
        {/* Title + abbrev */}
        <div className="mb-2">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {getInstanceAbbrev(name)}
          </span>
          <h2 className="text-lg font-bold leading-tight">{name}</h2>
        </div>
        {children}
      </div>
    </Link>
  )
}
