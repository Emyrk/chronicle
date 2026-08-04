import { useState, useRef, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import type { DamageAbilityBreakout, HitTypeStats } from '@/pages/Instance/EventsPanels/processors/abilityBreakout'
import { useBreakoutHover, getCellHighlight, type BreakoutHoverState } from './BreakoutHoverContext'
import { ChevronRight, ChevronLeft } from 'lucide-react'
import { SpellIdTooltip } from '@/components/ui/SpellIdTooltip'
import type { WoWSpell } from '@/api/wowdb'
import { useLocalStorage } from '@/hooks/useLocalStorage'
import { usePortalContainer } from '@/components/ui/PortalContainerContext'

// ============================================================================
// CSS Tooltip with Portal (escapes overflow containers)
// ============================================================================

interface CssTooltipProps {
  children: React.ReactNode
  content: React.ReactNode
  className?: string
}

function CssTooltip({ children, content, className }: CssTooltipProps) {
  const [show, setShow] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const triggerRef = useRef<HTMLSpanElement>(null)
  const portalContainer = usePortalContainer()
  
  useEffect(() => {
    if (show && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      setPosition({
        x: rect.left + rect.width / 2,
        y: rect.bottom + 4,
      })
    }
  }, [show])
  
  return (
    <>
      <span
        ref={triggerRef}
        className={className}
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
      >
        {children}
      </span>
      {show && portalContainer && createPortal(
        <div
          className="pointer-events-none fixed z-[9999] px-2 py-1 rounded bg-foreground text-background text-xs whitespace-nowrap"
          style={{
            left: position.x,
            top: position.y,
            transform: 'translateX(-50%)',
          }}
        >
          {content}
        </div>,
        portalContainer
      )}
    </>
  )
}


// ============================================================================
// Types
// ============================================================================

/** Expanded view modes */
type ExpandedViewMode = 'count' | 'percent' | 'minmax'
export type AbilityDetailMode = 'summary' | 'outcomes' | 'minmax'

/** Hit type column definition for expanded view */
interface HitTypeColumn {
  key: keyof DamageAbilityBreakout
  label: string       // Single letter/short label
  fullName: string    // Full name for tooltip
  description?: string // Optional description for tooltip
}

/** All possible hit type columns in display order */
const HIT_TYPE_COLUMNS: HitTypeColumn[] = [
  { key: 'Hits', label: 'H', fullName: 'Hits', description: 'Includes glancing, crushing, and crits' },
  { key: 'Absorbs', label: 'A', fullName: 'Absorbs', description: 'Fully absorbed hits' },
  { key: 'Crits', label: 'C', fullName: 'Crits' },
  { key: 'Misses', label: 'M', fullName: 'Misses' },
  { key: 'Dodges', label: 'D', fullName: 'Dodges' },
  { key: 'Parries', label: 'P', fullName: 'Parries' },
  { key: 'FullResist', label: 'R', fullName: 'Resists', description: 'Fully resisted (0 damage)' },
  { key: 'FullBlocks', label: 'B', fullName: 'Blocks', description: 'Fully blocked (0 damage)' },
  { key: 'Glancing', label: 'G', fullName: 'Glancing', description: 'Reduced damage hit' },
  { key: 'Immunes', label: 'I', fullName: 'Immunes' },
  { key: 'Reflects', label: 'Rf', fullName: 'Reflects' },
  { key: 'Crushing', label: 'Cr', fullName: 'Crushing', description: 'Increased damage hit' },
]

/** Min/max stats columns (only for damage-dealing hit types) */
interface MinMaxColumn {
  statsKey: 'HitStats' | 'CritStats' | 'GlancingStats' | 'CrushingStats' | 'AbsorbStats'
  label: string
  fullName: string
}

const MIN_MAX_COLUMNS: MinMaxColumn[] = [
  { statsKey: 'HitStats', label: 'Hit', fullName: 'Regular Hits' },
  { statsKey: 'CritStats', label: 'Crit', fullName: 'Critical Hits' },
  { statsKey: 'GlancingStats', label: 'Glnc', fullName: 'Glancing Blows' },
  { statsKey: 'CrushingStats', label: 'Crsh', fullName: 'Crushing Blows' },
  { statsKey: 'AbsorbStats', label: 'Abs', fullName: 'Fully Absorbed Hits' },
]

/** Get the value of a hit type column from an ability */
function getHitTypeValue(ability: DamageAbilityBreakout, key: keyof DamageAbilityBreakout): number {
  const val = ability[key]
  return typeof val === 'number' ? val : 0
}

/** Determine which hit type columns have any non-zero values across all abilities */
function getVisibleHitTypeColumns(abilities: DamageAbilityBreakout[]): HitTypeColumn[] {
  return HIT_TYPE_COLUMNS.filter(col => 
    abilities.some(ability => getHitTypeValue(ability, col.key) > 0)
  )
}

/** Determine which min/max columns have data across all abilities */
function getVisibleMinMaxColumns(abilities: DamageAbilityBreakout[]): MinMaxColumn[] {
  return MIN_MAX_COLUMNS.filter(col =>
    abilities.some(ability => {
      const stats = ability[col.statsKey] as HitTypeStats | undefined
      return stats && stats.count > 0
    })
  )
}

/** Merge multiple HitTypeStats into one */
function mergeHitTypeStats(statsArray: (HitTypeStats | undefined)[]): HitTypeStats | undefined {
  const validStats = statsArray.filter((s): s is HitTypeStats => s !== undefined && s.count > 0)
  if (validStats.length === 0) return undefined
  
  return validStats.reduce((acc, stats) => ({
    count: acc.count + stats.count,
    total: acc.total + stats.total,
    min: Math.min(acc.min, stats.min),
    max: Math.max(acc.max, stats.max),
  }), { count: 0, total: 0, min: Infinity, max: -Infinity })
}

/** Merge selected abilities into a summary row */
function mergeAbilities(abilities: DamageAbilityBreakout[]): DamageAbilityBreakout {
  const merged: DamageAbilityBreakout = {
    Total: 0,
    Count: 0,
    Crits: 0,
    Hits: 0,
    Misses: 0,
  }
  
  for (const ability of abilities) {
    merged.Total += ability.Total
    merged.Absorbed = (merged.Absorbed || 0) + (ability.Absorbed || 0)
    merged.Count += ability.Count
    merged.Crits += ability.Crits
    merged.Hits += ability.Hits
    merged.Misses += ability.Misses
    merged.Absorbs = (merged.Absorbs || 0) + (ability.Absorbs || 0)
    merged.Dodges = (merged.Dodges || 0) + (ability.Dodges || 0)
    merged.Parries = (merged.Parries || 0) + (ability.Parries || 0)
    merged.FullResist = (merged.FullResist || 0) + (ability.FullResist || 0)
    merged.Immunes = (merged.Immunes || 0) + (ability.Immunes || 0)
    merged.FullBlocks = (merged.FullBlocks || 0) + (ability.FullBlocks || 0)
    merged.Reflects = (merged.Reflects || 0) + (ability.Reflects || 0)
    merged.Glancing = (merged.Glancing || 0) + (ability.Glancing || 0)
    merged.Crushing = (merged.Crushing || 0) + (ability.Crushing || 0)
    merged.Unknown = (merged.Unknown || 0) + (ability.Unknown || 0)
  }
  
  // Merge hit type stats
  merged.HitStats = mergeHitTypeStats(abilities.map(a => a.HitStats))
  merged.CritStats = mergeHitTypeStats(abilities.map(a => a.CritStats))
  merged.GlancingStats = mergeHitTypeStats(abilities.map(a => a.GlancingStats))
  merged.CrushingStats = mergeHitTypeStats(abilities.map(a => a.CrushingStats))
  merged.AbsorbStats = mergeHitTypeStats(abilities.map(a => a.AbsorbStats))
  
  return merged
}

/** Format min/avg/max as a compact string */
function formatMinAvgMax(stats: HitTypeStats | undefined): React.ReactNode {
  if (!stats || stats.count === 0) return '-'
  const avg = Math.round(stats.total / stats.count)
  const min = stats.min === Infinity ? 0 : stats.min
  const max = stats.max === -Infinity ? 0 : stats.max

  return (
    <span className="whitespace-nowrap font-mono tabular-nums">
      <span className="text-muted-foreground/60 inline-block text-right min-w-[5ch]">{min}</span>
      <span className="text-muted-foreground/40 mx-0.5">/</span>
      <span className="font-semibold inline-block text-right min-w-[5ch]">{avg}</span>
      <span className="text-muted-foreground/40 mx-0.5">/</span>
      <span className="text-muted-foreground/60 inline-block text-right min-w-[5ch]">{max}</span>
    </span>
  )
}

/**
 * Ability data for display in the breakout table.
 * This is a simplified structure compared to the old AbilityBreakdown.
 */
export interface AbilityData extends DamageAbilityBreakout{
  name: string
  value: number
  /** Optional overheal value - displayed in a separate column with distinct styling */
  overheal?: number
  /** Optional absorbed value displayed in a separate column. */
  absorbed?: number
  /** Optional subtitle displayed in muted text after the name (e.g., spell rank) */
  subtitle?: string
  /** Optional spell ID for showing spell icon and tooltip */
  spellId?: number
  /** Optional deterministic spell metadata for stories and guided demos. */
  spellOverride?: WoWSpell
  /** Optional unique key for React (defaults to name if not provided) */
  key?: string
}

/**
 * Target breakdown data for "By Target" tab.
 */
export interface TargetData {
  targetId: string
  targetName: string
  value: number
  hitCount: number
  critCount: number
  /** Optional overheal value - displayed in a separate column with distinct styling */
  overheal?: number
}

function groupTargetsByName(targets: TargetData[]): TargetData[] {
  const grouped = new Map<string, TargetData>()

  for (const target of targets) {
    const key = target.targetName
    const existing = grouped.get(key)

    if (!existing) {
      grouped.set(key, {
        ...target,
        // In grouped mode, name is the identity shown to users
        targetId: key,
      })
      continue
    }

    existing.value += target.value
    existing.hitCount += target.hitCount
    existing.critCount += target.critCount

    if (target.overheal !== undefined) {
      existing.overheal = (existing.overheal ?? 0) + target.overheal
    }
  }

  return Array.from(grouped.values())
}

// ============================================================================
// Highlight Styles
// ============================================================================

/** Get highlight class based on cell state */
function getHighlightClass(highlight: ReturnType<typeof getCellHighlight>): string {
  switch (highlight) {
    case 'intersection':
      return 'bg-primary/25'
    case 'row':
      return 'bg-primary/5'
    case 'column':
      return 'bg-primary/5'
    default:
      return ''
  }
}

/** HoverCell component that handles mouse events */
function HoverCell({
  rowId,
  columnId,
  hover,
  setHover,
  clearHover,
  className,
  children,
  ...props
}: {
  rowId: string
  columnId: string
  hover: BreakoutHoverState
  setHover: (state: BreakoutHoverState) => void
  clearHover: () => void
  className?: string
  children: React.ReactNode
} & React.TdHTMLAttributes<HTMLTableCellElement>) {
  const highlight = getCellHighlight(hover, rowId, columnId)
  
  return (
    <td
      className={cn(className, getHighlightClass(highlight))}
      onMouseEnter={() => setHover({ rowId, columnId })}
      onMouseLeave={clearHover}
      {...props}
    >
      {children}
    </td>
  )
}

// ============================================================================
// Ability Table Component
// ============================================================================

export interface AbilityTableProps {
  abilities: AbilityData[]
  totalValue: number
  /** Label for the value column (e.g., "Damage", "Healing", "DPS", "HPS") */
  valueLabel?: string
  /** Whether to show the Hits column (damage can miss, heals cannot) */
  showHits?: boolean
  /** Whether to show the stacked secondary column */
  showOverheal?: boolean
  /** Label for the stacked secondary column */
  stackedLabel?: string
  /** Whether to show the absorbed column */
  showAbsorbed?: boolean
  /** Whether absorbed damage is additive to value instead of a subset of it. */
  absorbedIsAdditive?: boolean
  /** Controlled detail mode used by guided demonstrations. */
  detailMode?: AbilityDetailMode
}

/**
 * Table showing ability-by-ability breakdown.
 */
export function AbilityTable({ 
  abilities, 
  totalValue,
  valueLabel = 'Value',
  showHits = true,
  showOverheal = false,
  stackedLabel = 'Overheal',
  showAbsorbed = false,
  absorbedIsAdditive = false,
  detailMode,
}: AbilityTableProps) {
  const { hover, setHover, clearHover, selectedAbilities, toggleAbilitySelection, clearSelection } = useBreakoutHover()
  const [internalExpanded, setInternalExpanded] = useState(false)
  const [internalViewMode, setInternalViewMode] = useState<ExpandedViewMode>('percent')
  const isExpanded = detailMode ? detailMode !== 'summary' : internalExpanded
  const viewMode: ExpandedViewMode = detailMode === 'minmax' ? 'minmax' : internalViewMode
  
  if (!abilities || abilities.length === 0) {
    return <p className="text-xs p-2 text-muted-foreground">No ability breakdown available</p>
  }

  const effectiveValue = (ability: AbilityData) =>
    ability.value + (absorbedIsAdditive ? (ability.absorbed ?? 0) : 0)

  // Filter out zero-damage abilities and sort by effective contribution.
  const sorted = [...abilities]
    .filter(a => a.Total > 0 || (showOverheal && (a.overheal ?? 0) > 0))
    .sort((a, b) => effectiveValue(b) - effectiveValue(a))
  
  // Check if any ability has overheal data
  const hasOverhealData = showOverheal && sorted.some(a => a.overheal !== undefined && a.overheal > 0)
  // Check if any ability has absorbed data
  const hasAbsorbedData = showAbsorbed && sorted.some(a => a.absorbed !== undefined && a.absorbed > 0)
  
  // Get visible columns based on view mode
  const visibleHitTypeColumns = isExpanded && viewMode !== 'minmax' ? getVisibleHitTypeColumns(sorted) : []
  const visibleMinMaxColumns = isExpanded && viewMode === 'minmax' ? getVisibleMinMaxColumns(sorted) : []
  
  // Selection state from context
  const hasSelection = selectedAbilities.size > 0
  
  // Compute totals from selected abilities (or all if none selected)
  const abilitiesToSum = hasSelection 
    ? sorted.filter(a => selectedAbilities.has(a.name))
    : sorted
  const mergedTotals = mergeAbilities(abilitiesToSum)
  const totalValueForSelection = abilitiesToSum.reduce((sum, a) => sum + a.value, 0)
  const totalEffectiveValueForSelection = abilitiesToSum.reduce((sum, a) => sum + effectiveValue(a), 0)
  const totalOverhealForSelection = abilitiesToSum.reduce((sum, a) => sum + (a.overheal || 0), 0)
  const totalAbsorbedForSelection = abilitiesToSum.reduce((sum, a) => sum + (a.absorbed || 0), 0)

  // Column IDs for hover tracking
  const COL = {
    ABILITY: 'ability',
    OVERHEAL: 'overheal',
    ABSORBED: 'absorbed',
    VALUE: 'value',
    PERCENT: 'percent',
    COUNT: 'count',
    HITS: 'hits',
    CRIT: 'crit',
  }

  return (
    <div>
      {/* Controls above the table */}
      <div className="flex items-center justify-end gap-1 px-2 py-1 text-xs">
        {hasSelection && (
          <button
            onClick={clearSelection}
            className="px-1.5 py-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted mr-auto"
            title="Clear selection"
          >
            ✕ Clear ({selectedAbilities.size})
          </button>
        )}
        {isExpanded && (
          <>
            <span className="text-muted-foreground mr-1">Show:</span>
            <CssTooltip content="Show counts">
              <button
                onClick={() => setInternalViewMode('count')}
                className={cn(
                  "px-1.5 py-0.5 rounded",
                  viewMode === 'count' ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                #
              </button>
            </CssTooltip>
            <CssTooltip content="Show percentages">
              <button
                onClick={() => setInternalViewMode('percent')}
                className={cn(
                  "px-1.5 py-0.5 rounded",
                  viewMode === 'percent' ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                %
              </button>
            </CssTooltip>
            <CssTooltip content="Show min/avg/max">
              <button
                onClick={() => setInternalViewMode('minmax')}
                className={cn(
                  "px-1.5 py-0.5 rounded mr-2",
                  viewMode === 'minmax' ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"
                )}
                data-minmax-toggle={viewMode !== 'minmax' ? true : undefined}
              >
                ↕
              </button>
            </CssTooltip>
          </>
        )}
        <button
          onClick={() => setInternalExpanded(!isExpanded)}
          className="text-muted-foreground hover:text-foreground p-0.5"
          title={isExpanded ? "Collapse hit breakdown" : "Expand hit breakdown"}
          data-more-detail={!isExpanded ? true : undefined}
        >
          {isExpanded ? 
          <span className="inline-flex items-center gap-0.5"><ChevronLeft className="w-3 h-3" /> Less detail</span> : 
          <span className="inline-flex items-center gap-0.5">More detail <ChevronRight className="w-3 h-3" /></span>}
        </button>
      </div>
      <div className="max-h-64 overflow-auto styled-scrollbar">
        <table className="w-full text-xs text-foreground whitespace-nowrap">
          <thead className="sticky top-0 bg-popover z-10">
            <tr className="border-b border-border">
              <th className={cn("text-left py-1.5 px-2 font-medium", hover.columnId === COL.ABILITY && "bg-primary/20")}>Ability</th>
              {hasOverhealData && (
                <th className={cn("text-right py-1.5 px-2 font-medium text-yellow-500/80", hover.columnId === COL.OVERHEAL && "bg-primary/20")}>{stackedLabel}</th>
              )}
              {hasAbsorbedData && (
                <th className={cn("text-right py-1.5 px-2 font-medium text-sky-400/80", hover.columnId === COL.ABSORBED && "bg-primary/20")}>Absorbed</th>
              )}
              <th className={cn("text-right py-1.5 px-2 font-medium", hover.columnId === COL.VALUE && "bg-primary/20")}>{valueLabel}</th>
              <th className={cn("text-right py-1.5 px-2 font-medium", hover.columnId === COL.PERCENT && "bg-primary/20")}>%</th>
              <th className={cn("text-right py-1.5 px-2 font-medium", hover.columnId === COL.COUNT && "bg-primary/20")} title="Total count">#</th>
              {/* Collapsed view: simple Hits and Crit% columns */}
              {!isExpanded && showHits && (
                <th className={cn("text-right py-1.5 px-2 font-medium", hover.columnId === COL.HITS && "bg-primary/20")}>Hits</th>
              )}
              {!isExpanded && (
                <th className={cn("text-right py-1.5 px-2 font-medium", hover.columnId === COL.CRIT && "bg-primary/20")}>Crit%</th>
              )}
              {/* Expanded view: individual hit type columns (count/percent mode) */}
              {isExpanded && viewMode !== 'minmax' && visibleHitTypeColumns.map(col => (
                <th 
                  key={col.key}
                  className={cn(
                    "text-right py-1.5 px-1 font-medium",
                    hover.columnId === col.key && "bg-primary/20"
                  )}
                >
                  <CssTooltip
                    content={
                      <>
                        <span className="font-medium">{col.fullName}</span>
                        {col.description && <span className="text-background/70"> – {col.description}</span>}
                      </>
                    }
                  >
                    {col.label}
                  </CssTooltip>
                </th>
              ))}
              {/* Expanded view: min/avg/max columns (minmax mode) */}
              {isExpanded && viewMode === 'minmax' && visibleMinMaxColumns.map(col => (
                <th 
                  key={col.statsKey}
                  className={cn(
                    "text-right py-1.5 px-1 font-medium",
                    hover.columnId === col.statsKey && "bg-primary/20"
                  )}
                >
                  <CssTooltip
                    content={
                      <>
                        <span className="font-medium">{col.fullName}</span>
                        <span className="text-background/70"> – min / avg / max</span>
                      </>
                    }
                  >
                    {col.label}
                  </CssTooltip>
                </th>
              ))}
            </tr>
          </thead>
        <tbody>
          {sorted.map((ability) => {
            const critPercent = ability.Hits > 0 ? (ability.Crits / (ability.Count)) * 100 : 0
            const valuePercent = totalValue > 0 ? (effectiveValue(ability) / totalValue) * 100 : 0
            const abilityKey = ability.key ?? ability.name
            const rowId = abilityKey
            const isSelected = selectedAbilities.has(ability.name)
            const isDimmed = hasSelection && !isSelected
            
            return (
              <tr 
                key={abilityKey} 
                className={cn(
                  "border-b border-border/10 cursor-pointer transition-opacity",
                  isSelected && "bg-primary/10",
                  isDimmed && "opacity-40"
                )}
                onClick={() => toggleAbilitySelection(ability.name)}
              >
                <HoverCell
                  rowId={rowId}
                  columnId={COL.ABILITY}
                  hover={hover}
                  setHover={setHover}
                  clearHover={clearHover}
                  className="px-2 max-w-[220px] truncate"
                  title={ability.spellId ? undefined : (ability.subtitle ? `${ability.name} (${ability.subtitle})` : ability.name)}
                >
                  <span className="inline-flex items-center gap-1">
                    {ability.spellId ? (
                      <SpellIdTooltip 
                        spellId={ability.spellId} 
                        name={ability.name} 
                        size={14}
                        spellOverride={ability.spellOverride}
                        className="inline-flex items-center gap-1"
                      />
                    ) : (
                      ability.name
                    )}
                    {ability.subtitle && (
                      <span className="text-2xs text-muted-foreground/70">{ability.subtitle}</span>
                    )}
                  </span>
                </HoverCell>
                {hasOverhealData && (() => {
                  const overhealVal = ability.overheal ?? 0;
                  const totalForAbility = ability.value + overhealVal;
                  const overhealPct = totalForAbility > 0 ? (overhealVal / totalForAbility) * 100 : 0;
                  return (
                    <HoverCell
                      rowId={rowId}
                      columnId={COL.OVERHEAL}
                      hover={hover}
                      setHover={setHover}
                      clearHover={clearHover}
                      className="text-right py-1 px-2 font-mono text-yellow-500/70"
                    >
                      {overhealVal.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                      <span className="text-yellow-500/50 ml-1">({overhealPct.toFixed(0)}%)</span>
                    </HoverCell>
                  );
                })()}
                {hasAbsorbedData && (() => {
                  const absorbedVal = ability.absorbed ?? 0;
                  const absorbedBase = absorbedIsAdditive ? ability.value + absorbedVal : ability.value;
                  const absorbedPct = absorbedBase > 0 ? (absorbedVal / absorbedBase) * 100 : 0;
                  return (
                    <HoverCell
                      rowId={rowId}
                      columnId={COL.ABSORBED}
                      hover={hover}
                      setHover={setHover}
                      clearHover={clearHover}
                      className="text-right py-1 px-2 font-mono text-sky-400/70"
                    >
                      {absorbedVal.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                      <span className="text-sky-400/50 ml-1">({absorbedPct.toFixed(0)}%)</span>
                    </HoverCell>
                  );
                })()}
                <HoverCell
                  rowId={rowId}
                  columnId={COL.VALUE}
                  hover={hover}
                  setHover={setHover}
                  clearHover={clearHover}
                  className="text-right py-1 px-2 font-mono"
                >
                  {ability.value.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                </HoverCell>
                <HoverCell
                  rowId={rowId}
                  columnId={COL.PERCENT}
                  hover={hover}
                  setHover={setHover}
                  clearHover={clearHover}
                  className="text-right py-1 px-2 font-mono text-muted-foreground"
                >
                  {valuePercent.toFixed(1)}%
                </HoverCell>
                <HoverCell
                  rowId={rowId}
                  columnId={COL.COUNT}
                  hover={hover}
                  setHover={setHover}
                  clearHover={clearHover}
                  className="text-right py-1 px-2 font-mono"
                >
                  {ability.Count}
                </HoverCell>
                {/* Collapsed view: simple Hits and Crit% columns */}
                {!isExpanded && showHits && (
                  <HoverCell
                    rowId={rowId}
                    columnId={COL.HITS}
                    hover={hover}
                    setHover={setHover}
                    clearHover={clearHover}
                    className="text-right py-1 px-2 font-mono"
                  >
                    {ability.Hits}
                  </HoverCell>
                )}
                {!isExpanded && (
                  <HoverCell
                    rowId={rowId}
                    columnId={COL.CRIT}
                    hover={hover}
                    setHover={setHover}
                    clearHover={clearHover}
                    className="text-right py-1 px-2 font-mono"
                  >
                    {critPercent.toLocaleString(undefined, {maximumFractionDigits: 1})}%
                  </HoverCell>
                )}
                {/* Expanded view: individual hit type columns (count/percent mode) */}
                {isExpanded && viewMode !== 'minmax' && visibleHitTypeColumns.map(col => {
                  const count = getHitTypeValue(ability, col.key)
                  const percent = ability.Count > 0 ? (count / ability.Count) * 100 : 0
                  const isZero = viewMode === 'percent' ? percent === 0 : count === 0
                  return (
                    <HoverCell
                      key={col.key}
                      rowId={rowId}
                      columnId={col.key}
                      hover={hover}
                      setHover={setHover}
                      clearHover={clearHover}
                      className={cn("text-right py-1 px-1 font-mono", isZero && "text-muted-foreground/50")}
                    >
                      {viewMode === 'percent' ? `${percent.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 1})}%` : count}
                    </HoverCell>
                  )
                })}
                {/* Expanded view: min/avg/max columns (minmax mode) */}
                {isExpanded && viewMode === 'minmax' && visibleMinMaxColumns.map(col => {
                  const stats = ability[col.statsKey] as HitTypeStats | undefined
                  const hasData = stats && stats.count > 0
                  return (
                    <HoverCell
                      key={col.statsKey}
                      rowId={rowId}
                      columnId={col.statsKey}
                      hover={hover}
                      setHover={setHover}
                      clearHover={clearHover}
                      className={cn("text-right py-1 px-1 font-mono text-xs", !hasData && "text-muted-foreground/50")}
                    >
                      {formatMinAvgMax(stats)}
                    </HoverCell>
                  )
                })}
              </tr>
            )
          })}
          </tbody>
          {/* Footer row with totals */}
          <tfoot className="sticky bottom-0 bg-popover border-t border-border">
            <tr className="font-medium">
              <td className="py-1.5 px-2 text-muted-foreground">
                {hasSelection ? `Total (${selectedAbilities.size})` : 'Total'}
              </td>
              {hasOverhealData && (
                <td className="text-right py-1.5 px-2 font-mono text-yellow-500/70">
                  {totalOverhealForSelection.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                </td>
              )}
              {hasAbsorbedData && (
                <td className="text-right py-1.5 px-2 font-mono text-sky-400/70">
                  {totalAbsorbedForSelection.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                </td>
              )}
              <td className="text-right py-1.5 px-2 font-mono">
                {totalValueForSelection.toLocaleString(undefined, { maximumFractionDigits: 1 })}
              </td>
              <td className="text-right py-1.5 px-2 font-mono text-muted-foreground">
                {totalValue > 0 ? ((totalEffectiveValueForSelection / totalValue) * 100).toFixed(1) : 0}%
              </td>
              <td className="text-right py-1.5 px-2 font-mono">
                {mergedTotals.Count}
              </td>
              {/* Collapsed view */}
              {!isExpanded && showHits && (
                <td className="text-right py-1.5 px-2 font-mono">
                  {mergedTotals.Hits}
                </td>
              )}
              {!isExpanded && (
                <td className="text-right py-1.5 px-2 font-mono">
                  {mergedTotals.Hits > 0 ? ((mergedTotals.Crits / mergedTotals.Count) * 100).toFixed(1) : 0}%
                </td>
              )}
              {/* Expanded view: hit type columns (count/percent mode) */}
              {isExpanded && viewMode !== 'minmax' && visibleHitTypeColumns.map(col => {
                const count = getHitTypeValue(mergedTotals, col.key)
                const percent = mergedTotals.Count > 0 ? (count / mergedTotals.Count) * 100 : 0
                return (
                  <td key={col.key} className="text-right py-1.5 px-1 font-mono">
                    {viewMode === 'percent' ? `${percent.toFixed(1)}%` : count}
                  </td>
                )
              })}
              {/* Expanded view: min/avg/max columns (minmax mode) */}
              {isExpanded && viewMode === 'minmax' && visibleMinMaxColumns.map(col => {
                const stats = mergedTotals[col.statsKey] as HitTypeStats | undefined
                return (
                  <td key={col.statsKey} className="text-right py-1.5 px-1 font-mono text-xs">
                    {formatMinAvgMax(stats)}
                  </td>
                )
              })}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

// ============================================================================
// Target Table Component
// ============================================================================

export interface TargetTableProps {
  targets: TargetData[]
  totalValue: number
  /** Label for the value column (e.g., "Damage", "Healing") */
  valueLabel?: string
  /** Whether to show the stacked secondary column */
  showOverheal?: boolean
  /** Label for the stacked secondary column */
  stackedLabel?: string
  /** Group duplicate target names into a single row */
  groupByName?: boolean
}

/**
 * Table showing breakdown by target.
 */
export function TargetTable({ 
  targets, 
  totalValue, 
  valueLabel = 'Value',
  showOverheal = false,
  stackedLabel = 'Overheal',
  groupByName = false,
}: TargetTableProps) {
  const { hover, setHover, clearHover } = useBreakoutHover()

  const displayTargets = useMemo(
    () => (groupByName ? groupTargetsByName(targets) : targets),
    [groupByName, targets]
  )
  
  if (!displayTargets || displayTargets.length === 0) {
    return <p className="text-xs p-2 text-muted-foreground">No target breakdown available</p>
  }

  // Sort by value descending
  const sorted = [...displayTargets].sort((a, b) => b.value - a.value)
  
  // Check if any target has overheal data
  const hasOverhealData = showOverheal && sorted.some(t => t.overheal !== undefined && t.overheal > 0)

  // Column IDs for hover tracking (shared with AbilityTable where applicable)
  const COL = {
    TARGET: 'ability', // Use 'ability' so it syncs with the "Ability" column header
    VALUE: 'value',
    OVERHEAL: 'overheal',
    PERCENT: 'percent',
  }

  return (
    <div className="max-h-64 overflow-auto styled-scrollbar">
      <table className="w-full text-xs text-foreground whitespace-nowrap">
        <thead className="sticky top-0 bg-popover z-10">
          <tr className="border-b border-border">
            <th className={cn("text-left py-1.5 px-2 font-medium", hover.columnId === COL.TARGET && "bg-primary/20")}>Target</th>
            <th className={cn("text-right py-1.5 px-2 font-medium", hover.columnId === COL.VALUE && "bg-primary/20")}>{valueLabel}</th>
            {hasOverhealData && (
              <th className={cn("text-right py-1.5 px-2 font-medium text-yellow-500/70", hover.columnId === COL.OVERHEAL && "bg-primary/20")}>{stackedLabel}</th>
            )}
            <th className={cn("text-right py-1.5 px-2 font-medium", hover.columnId === COL.PERCENT && "bg-primary/20")}>%</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((target) => {
            const valuePercent = totalValue > 0 ? (target.value / totalValue) * 100 : 0
            const rowId = target.targetName
            
            return (
              <tr key={target.targetId} className="border-b border-border/10">
                <HoverCell
                  rowId={rowId}
                  columnId={COL.TARGET}
                  hover={hover}
                  setHover={setHover}
                  clearHover={clearHover}
                  className="py-1 px-2 max-w-[150px] truncate"
                  title={target.targetName}
                >
                  {target.targetName}
                </HoverCell>
                <HoverCell
                  rowId={rowId}
                  columnId={COL.VALUE}
                  hover={hover}
                  setHover={setHover}
                  clearHover={clearHover}
                  className="text-right py-1 px-2 font-mono"
                >
                  {target.value.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                </HoverCell>
                {hasOverhealData && (
                  <HoverCell
                    rowId={rowId}
                    columnId={COL.OVERHEAL}
                    hover={hover}
                    setHover={setHover}
                    clearHover={clearHover}
                    className="text-right py-1 px-2 font-mono text-yellow-500/70"
                  >
                    {(() => {
                      const overhealVal = target.overheal ?? 0;
                      const totalForTarget = target.value + overhealVal;
                      const overhealPct = totalForTarget > 0 ? (overhealVal / totalForTarget) * 100 : 0;
                      return (
                        <>
                          {overhealVal.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                          <span className="text-yellow-500/50 ml-1">({overhealPct.toFixed(0)}%)</span>
                        </>
                      );
                    })()}
                  </HoverCell>
                )}
                <HoverCell
                  rowId={rowId}
                  columnId={COL.PERCENT}
                  hover={hover}
                  setHover={setHover}
                  clearHover={clearHover}
                  className="text-right py-1 px-2 font-mono text-muted-foreground"
                >
                  {valuePercent.toFixed(1)}%
                </HoverCell>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ============================================================================
// Tabbed Breakout Component
// ============================================================================

export type BreakoutTab = 'ability' | 'target'

const GROUP_TARGETS_STORAGE_KEY = 'breakout-group-targets'

export interface AbilityBreakoutProps {
  abilities: AbilityData[]
  targets?: TargetData[]
  totalValue: number
  /** Label for the value column (e.g., "Damage", "Healing", "DPS", "HPS") */
  valueLabel?: string
  /** Entity GUID for optional debug display */
  debugGuid?: string
  /** Whether this is a pinned breakout (for potential styling differences) */
  pinned?: boolean
  /** Controlled active tab (optional - defaults to internal state) */
  activeTab?: BreakoutTab
  /** Callback when tab changes (required if activeTab is controlled) */
  onTabChange?: (tab: BreakoutTab) => void
  /** Label for the target tab (defaults to "By Target") */
  targetTabLabel?: string
  /** Whether to show the Hits column (damage can miss, heals cannot) */
  showHits?: boolean
  /** Whether to show the stacked secondary column */
  showOverheal?: boolean
  /** Label for the stacked secondary column */
  stackedLabel?: string
  /** Whether to show the absorbed column */
  showAbsorbed?: boolean
  /** Whether absorbed damage is additive to value instead of a subset of it. */
  absorbedIsAdditive?: boolean
  /** Controlled ability-table detail mode used by guided demonstrations. */
  detailMode?: AbilityDetailMode
}

function formatValue(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}M`
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`
  }
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 })
}

/**
 * Tabbed breakout component - switches between Ability and Target views.
 * This is the main component to use for player breakouts.
 */
export function AbilityBreakout({
  abilities,
  targets,
  totalValue,
  valueLabel = 'Value',
  debugGuid,
  activeTab: controlledTab,
  onTabChange,
  targetTabLabel = 'By Target',
  showHits = true,
  showOverheal = false,
  stackedLabel = 'Overheal',
  showAbsorbed = false,
  absorbedIsAdditive = false,
  detailMode,
}: AbilityBreakoutProps) {
  const [internalTab, setInternalTab] = useState<BreakoutTab>('ability')
  const [groupTargets, setGroupTargets] = useLocalStorage<boolean>(GROUP_TARGETS_STORAGE_KEY, false)

  // Use controlled or uncontrolled tab state
  const activeTab = controlledTab ?? internalTab
  const setActiveTab = onTabChange ?? setInternalTab

  const isDebugMode = useMemo(() => {
    if (typeof window === 'undefined') return false
    return new URLSearchParams(window.location.search).get('debug') === 'true'
  }, [])
  
  const hasTargets = targets && targets.length > 0
  
  const tabClass = "px-2 py-1 text-2xs font-medium transition-colors"
  const activeTabClass = "text-foreground border-b-2 border-foreground"
  const inactiveTabClass = "text-muted-foreground hover:text-foreground"

  const totalDisplay = (
    <div className="text-2xs ml-auto pr-1.5 text-muted-foreground flex items-center gap-2 min-w-0">
      {isDebugMode && debugGuid && (
        <span className="font-mono truncate" title={debugGuid}>
          GUID: {debugGuid}
        </span>
      )}
      <span>
        Total: <span className="font-medium font-mono text-foreground">{formatValue(totalValue)}</span>
      </span>
    </div>
  )

  // If no targets, just show the ability table without tabs
  if (!hasTargets) {
    return (
      <div>
        <div className="flex items-center border-b border-border">
          <span className={cn(tabClass, activeTabClass)}>By Ability</span>
          {totalDisplay}
        </div>
        <AbilityTable
          abilities={abilities}
          totalValue={totalValue}
          valueLabel={valueLabel}
          showHits={showHits}
          showOverheal={showOverheal}
          stackedLabel={stackedLabel}
          showAbsorbed={showAbsorbed}
          absorbedIsAdditive={absorbedIsAdditive}
          detailMode={detailMode}
        />
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center border-b border-border">
        <button
          className={cn(tabClass, activeTab === 'ability' ? activeTabClass : inactiveTabClass)}
          onClick={() => setActiveTab('ability')}
        >
          By Ability
        </button>
        <button
          className={cn(tabClass, activeTab === 'target' ? activeTabClass : inactiveTabClass)}
          onClick={() => setActiveTab('target')}
        >
          {targetTabLabel}
        </button>
        {activeTab === 'target' && (
          <CssTooltip content="Combine targets with the same name">
            <button
              className={cn(
                "ml-1 mb-0.5 mt-0.5 px-1.5 py-0.5 rounded text-2xs border transition-colors",
                groupTargets
                  ? "bg-primary/15 text-primary border-primary/40"
                  : "text-muted-foreground border-border hover:text-foreground hover:bg-muted"
              )}
              onClick={() => setGroupTargets((prev) => !prev)}
            >
              Group
            </button>
          </CssTooltip>
        )}
        {totalDisplay}
      </div>
      {activeTab === 'ability' ? (
        <AbilityTable
          abilities={abilities}
          totalValue={totalValue}
          valueLabel={valueLabel}
          showHits={showHits}
          showOverheal={showOverheal}
          stackedLabel={stackedLabel}
          showAbsorbed={showAbsorbed}
          absorbedIsAdditive={absorbedIsAdditive}
          detailMode={detailMode}
        />
      ) : (
        <TargetTable
          targets={targets}
          totalValue={totalValue}
          valueLabel={valueLabel}
          showOverheal={showOverheal}
          stackedLabel={stackedLabel}
          groupByName={groupTargets}
        />
      )}
    </div>
  )
}
