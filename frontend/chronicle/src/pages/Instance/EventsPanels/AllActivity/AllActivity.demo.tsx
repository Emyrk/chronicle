/**
 * Deterministic All Activity demo harness for explainer videos.
 *
 * Mirrors AllActivityDebug's chrome: the EventsPanel header (with the
 * Encounter offset switch), the stream-toggle chips, the three quick-filter
 * inputs, the stats/pagination row, and the raw event table with encounter
 * bands. Every interactive state (enabled streams, hovered chip, typed
 * filters, UTC/local/offset time, filter menu/editor flip) is a prop driven
 * frame-by-frame.
 */

import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Filter,
  HelpCircle,
  MoreVertical,
  Search,
  Skull,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DemoFilterEditor,
  type DemoFilterEditorState,
  type DemoFilterStage,
} from '@/components/ui/PlayerMetricChart/PlayerMetricChart.demo'
import {
  DEFAULT_DEMO_STREAMS,
  DEMO_STREAM_CHIPS,
  filterDemoEvents,
  type DemoActivityEvent,
  type DemoStream,
} from './allActivityDemoData'

const ROW_COLUMNS = '30px 56px 92px 108px 146px 118px 68px minmax(150px, 1fr) 100px 64px'

const CLASS_TEXT: Record<string, string> = {
  Warrior: 'text-class-warrior',
  Priest: 'text-class-priest',
  Rogue: 'text-class-rogue',
  Mage: 'text-class-mage',
  Shaman: 'text-class-shaman',
}

const FLAG_STYLES: Record<string, string> = {
  CRIT: 'border-amber-400/25 bg-amber-400/10 text-amber-300',
  OVERKILL: 'border-red-400/25 bg-red-400/10 text-red-300',
  OVERHEAL: 'border-green-400/25 bg-green-400/10 text-green-300',
  ABSORB: 'border-sky-400/25 bg-sky-400/10 text-sky-300',
}

const ACTIVITY_STYLES: Record<string, string> = {
  start: 'border-green-400/25 bg-green-400/10 text-green-300',
  bump: 'border-yellow-400/25 bg-yellow-400/10 text-yellow-300',
  end: 'border-orange-400/25 bg-orange-400/10 text-orange-300',
  slain: 'border-red-400/25 bg-red-400/10 text-red-300',
}

function entityText(className?: string, isEnemy?: boolean): string {
  if (className) return CLASS_TEXT[className] ?? 'text-muted-foreground'
  if (isEnemy) return 'text-red-400'
  return 'text-muted-foreground'
}

function streamChip(stream: DemoStream) {
  return DEMO_STREAM_CHIPS.find((c) => c.stream === stream)!
}

function DemoEventRow({
  event,
  position,
  relativeTime,
  localTime,
}: {
  event: DemoActivityEvent
  position: number
  relativeTime: boolean
  localTime: boolean
}) {
  const chip = streamChip(event.stream)
  const Icon = chip.icon
  const timeStr = relativeTime ? event.rel : localTime ? event.local : event.utc
  return (
    <div
      className={cn(
        'grid min-h-5 items-center border-b border-border/25 font-mono text-[10px] leading-3',
        position % 2 === 0 ? 'bg-background/30' : 'bg-muted/[0.12]',
      )}
      style={{ gridTemplateColumns: ROW_COLUMNS }}
    >
      <span className="pr-1 text-right text-muted-foreground/70">{event.idx}</span>
      <span className="flex min-w-0 items-center gap-1 px-1">
        <Icon className={cn('h-3 w-3 shrink-0', chip.color)} />
        <span className={cn('truncate text-[9px] font-bold tracking-[0.06em]', chip.color)}>{chip.code}</span>
      </span>
      <span className="truncate px-1.5 text-foreground/80">{timeStr}</span>
      <span className={cn('truncate px-1.5', entityText(event.sourceClass, event.sourceEnemy))}>{event.source}</span>
      <span className="truncate px-1.5 text-blue-400">{event.ability}</span>
      <span className={cn('truncate px-1.5', entityText(event.targetClass, event.targetEnemy))}>{event.target}</span>
      <span className={cn('truncate px-1.5 text-right', chip.color)}>{event.value}</span>
      <span className="truncate px-1.5 text-muted-foreground">{event.detail}</span>
      <span className="flex gap-0.5 px-1.5">
        {event.flags.map((flag) => (
          <span key={flag} className={cn('rounded border px-1 text-[8px] leading-3', FLAG_STYLES[flag])}>
            {flag}
          </span>
        ))}
      </span>
      <span className="px-1.5">
        {event.activity && (
          <span className={cn('rounded border px-1 text-[8px] leading-3', ACTIVITY_STYLES[event.activity])}>
            {event.activity}
          </span>
        )}
      </span>
    </div>
  )
}

function QuickFilterInput({
  value,
  placeholder,
  caret,
  dataAttr,
}: {
  value: string
  placeholder: string
  caret: boolean
  dataAttr: string
}) {
  return (
    <div className="relative" {...{ [dataAttr]: true }}>
      <div
        className={cn(
          'flex h-6 w-32 items-center rounded border bg-muted px-2 text-xs',
          caret ? 'border-primary ring-1 ring-primary' : 'border-border',
        )}
      >
        {value ? (
          <span className="truncate">{value}</span>
        ) : (
          !caret && <span className="truncate text-muted-foreground">{placeholder}</span>
        )}
        {caret && <span className="ml-px h-3.5 w-px shrink-0 bg-foreground" />}
      </div>
      {value && (
        <span className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5" data-demo-clear>
          <X className="h-3 w-3 text-muted-foreground" />
        </span>
      )}
    </div>
  )
}

export function AllActivityDemo({
  enabledStreams = DEFAULT_DEMO_STREAMS,
  hoveredStream,
  sourceTyped = '',
  abilityTyped = '',
  targetTyped = '',
  caret,
  caretOn = false,
  relativeTime = false,
  localTime = false,
  filterStage = 'idle',
  filterEditor,
}: {
  /** Streams whose chips are lit and whose rows appear in the table. */
  enabledStreams?: DemoStream[]
  /** Chip showing its hover ring + description tooltip. */
  hoveredStream?: DemoStream
  /** Text typed so far into each quick filter. */
  sourceTyped?: string
  abilityTyped?: string
  targetTyped?: string
  /** Which quick filter is focused (shows ring + caret). */
  caret?: 'source' | 'ability' | 'target'
  /** Frame-driven caret blink for the focused input. */
  caretOn?: boolean
  /** Time column: fight offset (+m:ss.s) — wins over localTime. */
  relativeTime?: boolean
  /** Time column: viewer's local clock instead of UTC. */
  localTime?: boolean
  /** idle → filter-icon menu → editor flip → filtered. */
  filterStage?: DemoFilterStage
  filterEditor?: DemoFilterEditorState
}) {
  const events = filterDemoEvents(
    enabledStreams,
    sourceTyped,
    filterStage === 'filtered' ? 'Lava Burst' : abilityTyped,
    targetTyped,
  ).slice(0, 12)
  const hovered = hoveredStream ? streamChip(hoveredStream) : null
  const HoveredIcon = hovered?.icon

  return (
    <section className="relative flex h-[430px] w-[1136px] flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-xl">
      {/* Mirrors the real EventsPanel header chrome (the flip side has none). */}
      {filterStage !== 'editor' && (
        <header className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
          <Skull className="h-4 w-4" />
          <span className="text-sm font-medium">All Activity</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
          <span className={filterStage === 'filtered' ? 'text-emerald-500' : 'text-muted-foreground'} data-demo-filter>
            <Filter className="h-3.5 w-3.5" />
          </span>
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
      )}

      {filterStage === 'editor' ? (
        <DemoFilterEditor
          state={filterEditor}
          icon={<Skull className="h-4 w-4" />}
          label="All Activity"
          chipLabel="Lava Burst"
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col px-3 pb-1 pt-2">
          {/* Stream toggles and quick filters. */}
          <div className="mb-2 flex flex-wrap items-center gap-2" data-demo-streams>
            <span className="text-xs text-muted-foreground">Streams:</span>
            {DEMO_STREAM_CHIPS.map((chipConfig) => {
              const enabled = enabledStreams.includes(chipConfig.stream)
              const ChipIcon = chipConfig.icon
              return (
                <span
                  key={chipConfig.stream}
                  className={cn(
                    'flex items-center gap-1 rounded px-2 py-1 text-xs ring-1 ring-transparent',
                    enabled ? `${chipConfig.color} bg-muted` : 'text-muted-foreground/50',
                    hoveredStream === chipConfig.stream && 'bg-muted/80 ring-border',
                  )}
                  data-demo-stream={chipConfig.stream}
                >
                  <ChipIcon className="h-3.5 w-3.5" />
                  <span className={cn('font-mono', !enabled && 'line-through')}>{chipConfig.count}</span>
                </span>
              )
            })}
            <span className="ml-2 flex items-center gap-1">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <QuickFilterInput value={sourceTyped} placeholder="Filter by source..." caret={caret === 'source' && caretOn} dataAttr="data-demo-source-filter" />
            </span>
            <QuickFilterInput value={abilityTyped} placeholder="Filter by ability..." caret={caret === 'ability' && caretOn} dataAttr="data-demo-ability-filter" />
            <QuickFilterInput value={targetTyped} placeholder="Filter by target..." caret={caret === 'target' && caretOn} dataAttr="data-demo-target-filter" />
          </div>

          {/* Hovered chip's description tooltip (mirrors the real hover card). */}
          {hovered && HoveredIcon && (
            <div
              className="absolute z-20 w-64 rounded-md border border-border bg-popover px-3 py-2.5 text-xs shadow-xl"
              style={{ left: 71 + DEMO_STREAM_CHIPS.indexOf(hovered) * 63.6, top: 78 }}
              data-demo-stream-tooltip
            >
              <div className="flex items-center gap-2">
                <HoveredIcon className={cn('h-4 w-4 shrink-0', hovered.color)} />
                <span className="font-semibold">{hovered.label}</span>
                <span className="ml-auto font-mono text-muted-foreground">{hovered.count}</span>
              </div>
              <p className="mt-1.5 leading-relaxed text-muted-foreground">{hovered.description}</p>
              <p className="mt-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
                Click to {enabledStreams.includes(hovered.stream) ? 'hide' : 'show'} this stream
              </p>
            </div>
          )}

          {/* Stats row with pagination. */}
          <div className="mb-2 flex items-center justify-between gap-4 text-xs text-muted-foreground">
            <span>
              Total Processed: <span className="font-medium text-foreground">9.2K</span>{' '}
              <span className="text-blue-500">(14ms)</span>
            </span>
            <span className="flex items-center gap-2">
              <span>
                <span className="font-medium text-foreground">1</span> - <span className="font-medium text-foreground">{events.length}</span> of{' '}
                <span className="font-medium text-foreground">9,214</span>
              </span>
              <span className="flex items-center gap-0.5">
                <ChevronsLeft className="h-4 w-4 opacity-30" />
                <ChevronLeft className="h-4 w-4 opacity-30" />
                <span className="px-2 font-mono">1 / 768</span>
                <ChevronRight className="h-4 w-4" />
                <ChevronsRight className="h-4 w-4" />
              </span>
            </span>
          </div>

          {/* Raw event table. */}
          <div className="min-h-0 flex-1 overflow-hidden rounded border border-border">
            <div
              className="grid items-center border-b border-border bg-background py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.06em] text-muted-foreground"
              style={{ gridTemplateColumns: ROW_COLUMNS }}
            >
              <span className="pr-1 text-right">#</span>
              <span className="px-1">Type</span>
              <span className="px-1.5" data-demo-time-header>
                Time {relativeTime ? '' : localTime ? '(local)' : '(UTC)'}
              </span>
              <span className="px-1.5">Source</span>
              <span className="px-1.5">Action / Ability</span>
              <span className="px-1.5">Target</span>
              <span className="px-1.5 text-right">Value</span>
              <span className="px-1.5">Outcome / Detail</span>
              <span className="px-1.5">Flags</span>
              <span className="px-1.5">Activity ⓘ</span>
            </div>
            {(() => {
              let lastEncounter: string | null = null
              return events.map((event, position) => {
                const showBand = event.encounter !== lastEncounter
                lastEncounter = event.encounter
                return (
                  <div key={`${event.idx}-${event.stream}`}>
                    {showBand && (
                      <div className="border-y border-cyan-400/20 bg-cyan-400/5 px-1 py-0.5 text-[9px] font-semibold text-cyan-400">
                        📍 Encounter: {event.encounter} @ {event.encounter === 'Ragnaros' ? '19:04:05' : '19:12:07'}
                      </div>
                    )}
                    <DemoEventRow event={event} position={position} relativeTime={relativeTime} localTime={localTime} />
                  </div>
                )
              })
            })()}
            {events.length === 0 && (
              <div className="py-4 text-center text-xs text-muted-foreground">
                No events to display. Enable some streams.
              </div>
            )}
          </div>
        </div>
      )}

      {/* The filter icon's context menu (Edit filters / Reset to default). */}
      {filterStage === 'menu' && (
        <div
          className="absolute z-20 w-[150px] rounded-md border border-border bg-popover p-1 shadow-md"
          style={{ left: 190, top: 26 }}
          data-demo-filter-menu
        >
          <div className="rounded bg-muted/60 px-2 py-1.5 text-xs" data-demo-edit-filters>
            Edit filters
          </div>
          <div className="rounded px-2 py-1.5 text-xs text-muted-foreground">Reset to default</div>
        </div>
      )}

      {/* Mirrors the GenericPanel footer diagnostics. */}
      <footer className="flex h-8 shrink-0 items-center border-t border-border px-3 font-mono text-2xs text-muted-foreground">
        <span>9.2K events (95.3K/s)</span>
        <span className="ml-auto text-chart-1">14ms</span>
      </footer>
    </section>
  )
}
