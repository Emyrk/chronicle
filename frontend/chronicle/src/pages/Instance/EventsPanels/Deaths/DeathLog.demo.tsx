/**
 * Deterministic Death Log demo harness for explainer videos.
 *
 * Mirrors DeathLogContent's chrome and table, and renders the REAL
 * DeathRecap, IncomingEventsBreakout, and RelativeHealthBar with fixture
 * data. Every interactive state (expanded row, killer tooltip, floating
 * breakout position, window, shared fight-offset cursor) is controllable
 * frame-by-frame.
 */

import { ChevronDown, ChevronRight, ExternalLink, HelpCircle, MoreVertical, ScrollText, Skull, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TooltipProvider } from '@/components/ui/Tooltip/tooltip'
import { DeathRecap } from './DeathRecap'
import {
  BLAZEWING_DEATH_ABSOLUTE,
  BLAZEWING_DEATH_OFFSET,
  BLAZEWING_RECAP,
  DEMO_DEATHS,
} from './deathLogDemoData'
import {
  IncomingEventsBreakout,
  type IncomingEventsWindow,
} from '../IncomingEvents/IncomingEventsBreakout'


function formatRelativeTime(offsetMilli: number): string {
  const totalSeconds = offsetMilli / 1000
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = (totalSeconds % 60).toFixed(1)
  return `+${minutes}:${seconds.padStart(4, '0')}`
}

export function DeathLogDemo({
  expandedIndex,
  relativeTime = false,
  killerTooltip = false,
  floating,
  window: eventsWindow = 10,
  fightOffset = null,
}: {
  /** Row expanded to its inline death recap (index into DEMO_DEATHS). */
  expandedIndex?: number
  /** The 'Encounter offset' toggle — relative (+m:ss.s) vs wall-clock times. */
  relativeTime?: boolean
  /** Show the killer attribution tooltip beside Blazewing's Killed By cell. */
  killerTooltip?: boolean
  /** Floating death-recap breakout position (relative to the demo root). */
  floating?: { x: number; y: number }
  /** The breakout's 'seconds before death' window. */
  window?: IncomingEventsWindow
  /** Shared fight-offset cursor (ms) — the health bar replays to this point. */
  fightOffset?: number | null
}) {
  return (
    <TooltipProvider>
      <div className="relative h-[430px] w-[1136px]">
      <section className="relative flex h-[430px] w-[620px] flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-xl">
        {/* Mirrors the real EventsPanel header chrome. */}
        <header className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
          <ScrollText className="h-4 w-4" />
          <span className="text-sm font-medium">Death Log</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
          <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
          <div className="ml-auto flex items-center gap-2" data-demo-offset-toggle>
            <span className="text-xs text-muted-foreground">Encounter offset</span>
            <div
              className="h-[18px] w-[34px] rounded-full border border-border"
              style={{ background: relativeTime ? 'var(--primary)' : 'var(--muted)' }}
            >
              <div
                className="h-[14px] w-[14px] rounded-full bg-foreground"
                style={{ translate: `${relativeTime ? 17 : 2}px 1px` }}
              />
            </div>
          </div>
        </header>

        {/* Mirrors DeathLogContent's Total / mode-toggle row. */}
        <div className="flex shrink-0 items-center justify-between px-3 pb-1 pt-2">
          <div className="text-xs text-muted-foreground">
            Total Deaths: <span className="font-medium text-foreground">{DEMO_DEATHS.length}</span>
          </div>
          <div className="flex items-center gap-1 rounded-md bg-muted p-0.5">
            <span className="flex items-center gap-1 rounded bg-background px-2 py-0.5 text-2xs text-foreground shadow-sm">
              <User className="h-3 w-3" />
              Players
            </span>
            <span className="flex items-center gap-1 rounded px-2 py-0.5 text-2xs text-muted-foreground">
              <Skull className="h-3 w-3" />
              Enemies
            </span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden px-1">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="w-5" />
                <th className="w-16 px-2 py-1.5 text-left font-medium">Time</th>
                <th className="w-16 px-2 py-1.5 text-left font-medium">Encounter</th>
                <th className="w-28 px-2 py-1.5 text-left font-medium">Killed By</th>
                <th className="px-2 py-1.5 text-left font-medium">Unit</th>
              </tr>
            </thead>
            <tbody>
              {DEMO_DEATHS.map((death, index) => {
                const isExpanded = expandedIndex === index
                const prev = index > 0 ? DEMO_DEATHS[index - 1] : null
                const isNewEncounter = prev !== null && prev.encounter !== death.encounter
                return (
                  <>
                    <tr
                      key={`${death.playerName}-${index}`}
                      className={cn(
                        'border-b border-border/10',
                        isNewEncounter && 'border-t-2 border-t-border',
                        isExpanded && 'border-b-0 bg-muted/30',
                      )}
                      data-demo-death-row={index}
                    >
                      <td className="w-5 px-1 py-1 text-muted-foreground">
                        {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                      </td>
                      <td className="px-2 py-1 font-mono text-2xs text-muted-foreground">
                        {relativeTime ? formatRelativeTime(death.offsetMilli) : death.clock}
                      </td>
                      <td className="max-w-[120px] px-2 py-1">
                        <span className="block max-w-full truncate text-left text-2xs text-blue-500">
                          {death.encounter}
                        </span>
                      </td>
                      <td
                        className="w-24 max-w-24 px-2 py-1 text-muted-foreground"
                        data-demo-death-killer={index}
                      >
                        <span className="block truncate underline decoration-dotted decoration-muted-foreground/50">
                          {death.killerName}
                        </span>
                      </td>
                      <td className="px-2 py-1">
                        <div className="flex items-center gap-2">
                          <span
                            className="min-w-0 flex-1 truncate font-medium"
                            style={{ color: `var(--color-class-${death.className.toLowerCase()})` }}
                          >
                            {death.playerName}
                          </span>
                          <span
                            className="shrink-0 rounded p-1 text-muted-foreground"
                            data-demo-death-float={index}
                          >
                            <ExternalLink className="h-3 w-3" />
                          </span>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="border-b border-border/10">
                        <td colSpan={5} className="p-0 pb-1">
                          <DeathRecap
                            recap={BLAZEWING_RECAP}
                            outgoingRecap={[]}
                            deathOffsetMilli={BLAZEWING_DEATH_OFFSET}
                          />
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Killer attribution tooltip (mirrors the real hover card). */}
        {killerTooltip && (
          <div
            className="absolute z-20 w-[210px] space-y-1 rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-lg"
            style={{ left: 175, top: 148 }}
            data-demo-killer-tooltip
          >
            <div className="font-medium">Ragnaros</div>
            <div className="text-xs text-muted-foreground">Lava Burst</div>
            <div className="flex items-center gap-2 text-xs">
              <span className="font-medium text-orange-400">5,200</span>
              <span className="text-muted-foreground">Fire</span>
              <span className="font-medium text-yellow-500">Crit!</span>
            </div>
          </div>
        )}

        {/* Mirrors the GenericPanel footer diagnostics. */}
        <footer className="flex h-8 shrink-0 items-center border-t border-border px-3 font-mono text-2xs text-muted-foreground">
          <span>2.1K events (95.3K/s)</span>
          <span className="ml-auto text-chart-1">12ms</span>
        </footer>
      </section>

      {/* Floating death recap — the REAL IncomingEventsBreakout. */}
      {floating && (
        <div
          className="absolute w-[400px] rounded-lg border border-border bg-card shadow-2xl"
          style={{ left: floating.x, top: floating.y }}
          data-demo-floating
        >
          <IncomingEventsBreakout
            unitName="Blazewing"
            className="Mage"
            anchorOffsetMilli={BLAZEWING_DEATH_OFFSET}
            anchorAbsoluteMilli={BLAZEWING_DEATH_ABSOLUTE}
            events={BLAZEWING_RECAP}
            window={eventsWindow}
            onWindowChange={() => {}}
            sharedFightOffsetMilli={fightOffset}
            onSharedFightOffsetChange={() => {}}
            onClose={() => {}}
          />
        </div>
        )}
      </div>
    </TooltipProvider>
  )
}
