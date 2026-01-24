import { useMemo, useState, useRef, useCallback, useEffect } from 'react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/Tooltip/tooltip";
import { useMouse } from '@/hooks/useMouse';
import { cn } from '@/lib/utils';
import { X, GripHorizontal } from 'lucide-react';
import type { Ability } from '@/api/typesGenerated';

export type ChartType = 'damage' | 'healing' | 'taken'

// Ability breakdown for tooltip display
export interface AbilityBreakdown {
  name: string
  totalDamage: number
  hitCount: number
  critCount: number
  missCount: number
  dodgeCount: number
  immuneCount: number
  parryCount: number
  otherCount: number
}

// Raw abilities record type from API: { [targetGUID]: { [abilityName]: Ability } }
export type RawAbilities = Record<string, Record<string, Ability>>;

export interface PlayerMetricChartData {
  playerID: string
  playerName: string
  className: string
  specialization: string
  value: number
  // stackValue is used for over healing.
  stackedValue?: number
  // dimmed reduces visual prominence (used for filtering)
  dimmed?: boolean
  // Ability breakdown for tooltip (computed from rawAbilities, or provided directly for stories)
  abilityBreakdown?: AbilityBreakdown[]
  rawAbilities?: RawAbilities
}

interface PlayerMetricChartProps extends React.ComponentProps<"div"> {
  data: PlayerMetricChartData[]
  /**
   * Height of each row in pixels
   * @default 36
   */
  rowHeight?: number
  type: ChartType
  // If perSecond is true, value is DPS/HPS
  perSecond?: boolean
  duration_millis?: number
  // Title shown on pinned tooltips (e.g., "Damage Done", "Damage Taken")
  panelTitle?: string
}

export function PlayerMetricChart({
  data,
  rowHeight = 30,
  className,
  style,
  type,
  panelTitle,
  perSecond,
  duration_millis,
  ...divProps
}: PlayerMetricChartProps) {
  // Track which rows have pinned tooltips (multiple allowed)
  const [pinnedPlayerIds, setPinnedPlayerIds] = useState<Set<string>>(new Set())

  const computedData = useMemo(() => {
    return data.map((item) => ({
      ...item,
      value: perSecond ? (item.value / duration_millis!) * 1000 : item.value,
      stackedValue: item.stackedValue ? (perSecond ? (item.stackedValue / duration_millis!) * 1000 : item.stackedValue) : undefined,
    }))
  }, [data, perSecond, duration_millis])


  const summedValue = useMemo(() => {
    return computedData.reduce((sum, item) => sum + item.value, 0)
  }, [computedData])

  const maximumValue = useMemo(() => {
    return Math.max(...computedData.map((item) => item.value + (item.stackedValue || 0)))
  }, [computedData])

  // Sort by value descending and calculate percentages
  // Dimmed items are sorted to the bottom
  const chartData = useMemo(() => {
    const sorted = [...computedData].sort((a, b) => {
      // Non-dimmed items come first
      if (a.dimmed !== b.dimmed) {
        return a.dimmed ? 1 : -1;
      }
      return b.value - a.value;
    })
    return sorted.map((item, index) => ({
      ...item,
      rank: index + 1,
      color: `var(--class-${item.className.toLowerCase()})`,
    }))
  }, [computedData])

  const handleTogglePin = (playerId: string) => {
    setPinnedPlayerIds(prev => {
      const next = new Set(prev)
      if (next.has(playerId)) {
        next.delete(playerId)
      } else {
        next.add(playerId)
      }
      return next
    })
  }

  return (
    <div
      style={{
        height: "400px", // Default
        overflowY: 'auto',
        overflowX: 'hidden',
        ...style,
      }}
      className={className}
      {...divProps}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '4px' }}>
        {chartData.map((player) => {
          return <PlayerMetricRow 
            key={player.playerID}
            player={player} 
            rowHeight={rowHeight}
            maximumValue={maximumValue}
            summedValue={summedValue}
            showRank={type === 'damage' || type === 'healing' || type === 'taken'}
            type={type}
            suffix={perSecond ? '/s' : ''}
            isPinned={pinnedPlayerIds.has(player.playerID)}
            onTogglePin={() => handleTogglePin(player.playerID)}
            panelTitle={panelTitle}
            perSecond={perSecond}
            durationMillis={duration_millis}
          />
        })}
      </div>
    </div>
  )
}

export interface PlayerMetricRowProps {
  player: PlayerMetricChartData & {color:string, rank:number, dimmed?: boolean}
  rowHeight: number
  maximumValue: number
  summedValue: number
  showRank: boolean
  type: ChartType
  suffix?: string
  isPinned?: boolean
  onTogglePin?: () => void
  panelTitle?: string
  perSecond?: boolean
  durationMillis?: number
}

// Format number compactly
function formatCompactNumber(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`
  }
  return value.toFixed(0)
}

// Ability breakdown table component
// invertedColors: when true, uses bg-foreground/text-background (for tooltips with dark bg)
function AbilityBreakdownTable({ abilities, totalValue, invertedColors = false, perSecond = false, durationMillis }: { 
  abilities: AbilityBreakdown[], 
  totalValue: number,
  invertedColors?: boolean,
  perSecond?: boolean,
  durationMillis?: number,
}) {
  if (!abilities || abilities.length === 0) {
    const emptyClass = invertedColors ? "text-background/60" : "text-muted-foreground"
    return <p className={cn("text-xs p-2", emptyClass)}>No ability breakdown available</p>
  }

  // Sort by damage descending
  const sorted = [...abilities].sort((a, b) => b.totalDamage - a.totalDamage)

  // Color classes based on inverted mode
  const textClass = invertedColors ? "text-background" : "text-foreground"
  const mutedClass = invertedColors ? "text-background/60" : "text-muted-foreground"
  const headerBgClass = invertedColors ? "bg-foreground" : "bg-popover"
  const borderClass = invertedColors ? "border-background/20" : "border-border"
  const hoverClass = invertedColors ? "hover:bg-background/10" : "hover:bg-muted/50"

  return (
    <div className="max-h-64 overflow-y-auto">
      <table className={cn("w-full text-xs", textClass)}>
        <thead className={cn("sticky top-0", headerBgClass)}>
          <tr className={cn("border-b", borderClass)}>
            <th className="text-left py-1.5 px-2 font-medium">Ability</th>
            <th className="text-right py-1.5 px-2 font-medium">{perSecond ? 'DPS' : 'Damage'}</th>
            <th className="text-right py-1.5 px-2 font-medium">%</th>
            <th className="text-right py-1.5 px-2 font-medium">Count</th>
            <th className="text-right py-1.5 px-2 font-medium">Crit%</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((ability) => {
            const totalHits = ability.hitCount + ability.critCount
            const critPercent = totalHits > 0 ? (ability.critCount / totalHits) * 100 : 0
            const displayDamage = perSecond && durationMillis ? (ability.totalDamage / durationMillis) * 1000 : ability.totalDamage
            const damagePercent = totalValue > 0 ? (displayDamage / totalValue) * 100 : 0
            
            return (
              <tr key={ability.name} className={cn("border-b", borderClass.replace("20", "10"), hoverClass)}>
                <td className="py-1 px-2 max-w-[150px] truncate" title={ability.name}>
                  {ability.name}
                </td>
                <td className="text-right py-1 px-2 tabular-nums">
                  {formatCompactNumber(displayDamage)}
                </td>
                <td className={cn("text-right py-1 px-2 tabular-nums", mutedClass)}>
                  {damagePercent.toFixed(1)}%
                </td>
                <td className="text-right py-1 px-2 tabular-nums">
                  {totalHits}
                </td>
                <td className="text-right py-1 px-2 tabular-nums">
                  {critPercent.toFixed(0)}%
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// Draggable pinned tooltip component
interface DraggablePinnedTooltipProps {
  player: PlayerMetricChartData & { color: string }
  initialPosition: { x: number; y: number }
  onClose: () => void
  panelTitle?: string
  perSecond?: boolean
  durationMillis?: number
}

function DraggablePinnedTooltip({ player, initialPosition, onClose, panelTitle, perSecond, durationMillis }: DraggablePinnedTooltipProps) {
  const [position, setPosition] = useState(initialPosition)
  const [isDragging, setIsDragging] = useState(false)
  const dragStartRef = useRef<{ x: number; y: number; posX: number; posY: number } | null>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only start drag from the header area
    if ((e.target as HTMLElement).closest('[data-drag-handle]')) {
      e.preventDefault()
      setIsDragging(true)
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        posX: position.x,
        posY: position.y,
      }
    }
  }, [position])

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return
      const deltaX = e.clientX - dragStartRef.current.x
      const deltaY = e.clientY - dragStartRef.current.y
      setPosition({
        x: dragStartRef.current.posX + deltaX,
        y: dragStartRef.current.posY + deltaY,
      })
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      dragStartRef.current = null
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging])

  return (
    <div
      ref={tooltipRef}
      className="border-3 border-solid  fixed z-50 min-w-[340px] rounded-md bg-foreground text-background shadow-md"
      style={{
        left: position.x,
        top: position.y,
        cursor: isDragging ? 'grabbing' : 'default',
      }}
      onMouseDown={handleMouseDown}
    >
      {/* Header with drag handle and close button */}
      <div 
        className="flex items-center gap-2 p-3 border-b border-background/20"
        data-drag-handle
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      >
        <GripHorizontal className="h-4 w-4 text-background/60 flex-shrink-0" />
        <span 
          className="w-3 h-3 rounded-full flex-shrink-0"
          style={{ backgroundColor: player.color }}
        />
        <span className="font-medium">{player.playerName}</span>
        <span className="text-background/60 text-xs">
          {player.className}
        </span>
        {panelTitle && (
          <span className="text-xs text-background/60 border-l border-background/20 pl-2 ml-auto">
            {panelTitle}
          </span>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onClose()
          }}
          className={cn("p-1 rounded hover:bg-background/20 text-background/60 hover:text-background transition-colors", !panelTitle && "ml-auto")}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <AbilityBreakdownTable 
        abilities={player.abilityBreakdown ?? []} 
        totalValue={player.value}
        invertedColors
        perSecond={perSecond}
        durationMillis={durationMillis}
      />
    </div>
  )
}

export function PlayerMetricRow({
  player,
  rowHeight,
  maximumValue,
  summedValue,
  showRank,
  type,
  suffix,
  isPinned = false,
  onTogglePin,
  panelTitle,
  perSecond,
  durationMillis,
}: PlayerMetricRowProps) {
  const { ref, x, y } = useMouse<HTMLDivElement>();
  const rowRef = useRef<HTMLDivElement>(null)
  const isDimmed = player.dimmed ?? false;
  const [pinnedPosition, setPinnedPosition] = useState<{ x: number; y: number } | null>(null)
  
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    if (!isPinned && rowRef.current) {
      // Calculate initial position for the pinned tooltip
      const rect = rowRef.current.getBoundingClientRect()
      setPinnedPosition({
        x: rect.left + x,
        y: rect.top + rowHeight + 5,
      })
    }
    onTogglePin?.()
  }, [isPinned, onTogglePin, x, rowHeight])

  const handleClose = useCallback(() => {
    onTogglePin?.()
  }, [onTogglePin])

  // Combine refs - useMouse returns a callback ref, rowRef is an object ref
  const setRefs = useCallback((element: HTMLDivElement | null) => {
    // Set the useMouse callback ref
    ref(element)
    // Set our local object ref
    if (rowRef.current !== element) {
      (rowRef as React.MutableRefObject<HTMLDivElement | null>).current = element
    }
  }, [ref])

  return (
  <>
    <TooltipProvider key={player.playerID + player.playerName}>
      <Tooltip delayDuration={0} open={isPinned ? false : undefined}>
        <TooltipTrigger asChild>
          <div
            ref={setRefs}
            onClick={handleClick}
            style={{
              display: 'flex',
              alignItems: 'center',
              height: rowHeight,
              position: 'relative',
              borderRadius: 'var(--radius)',
              overflow: 'hidden',
              color: 'var(--class-foreground)',//'oklch(0.985 0 0)',
              opacity: isDimmed ? 0.35 : 1,
              transition: 'opacity 0.2s ease',
              cursor: 'pointer',
            }}
            className={cn(isPinned && "ring-2 ring-primary ring-inset")}
          >
            {/* Colored bar background */}
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: `${(player.value / maximumValue) * 100}%`,
                background: `linear-gradient(to right, oklch(0 0 0 / 0.3), oklch(0 0 0 / 0.15)), ${player.color}`,
                opacity: 0.85,
                transition: 'width 0.3s ease',
              }}
            />
            
            {/* Stacked value */}
            {player.stackedValue && (
            <div
              style={{
                position: 'absolute',
                left: `${(player.value / maximumValue) * 100}%`,
                top: 0,
                bottom: 0,
                width: `${(player.stackedValue / maximumValue) * 100}%`,
                background: `${player.color}`,
                opacity: 0.3,
                transition: 'width 0.3s ease',
              }}
            />)
            }

            {/* Content overlay */}
            <div
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                width: '100%',
                padding: '0 12px',
                zIndex: 1,
              }}
            >

            {/* Rank */}
            {showRank && (<span
                style={{
                  width: '32px',
                  fontSize: '13px',
                  fontWeight: 500,
                }}
              >
                #{player.rank}
              </span>
              )}

              {/* Icon */}
              <img
                src={`/icons/spec_${player.className.toLowerCase()}_${player.specialization.toLowerCase().replace(/\s+/g, '')}.png`}
                alt={player.specialization}
                style={{
                  width: '20px',
                  height: '20px',
                  marginRight: '8px',
                  borderRadius: '2px',
                }}
                onError={(e) => {
                  // Fallback to class icon if spec icon not found, then to unknown
                  const target = e.currentTarget;
                  const classIcon = `/icons/class_${player.className.toLowerCase()}.png`;
                  const unknownIcon = '/icons/class_unknown.png';
                  if (target.src.endsWith(unknownIcon)) {
                    // Already at fallback, hide the image
                    target.style.display = 'none';
                  } else if (target.src.includes('/icons/class_')) {
                    // Class icon failed, try unknown
                    target.src = unknownIcon;
                  } else {
                    // Spec icon failed, try class icon
                    target.src = classIcon;
                  }
                }}
              />

              {/* Spec name */}
              <span
                style={{
                  flex: 1,
                  fontSize: '13px',
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {player.playerName}
              </span>

              {/* DPS value */}
              {formatValue(type, player, suffix)}

              {/* Percentage */}
              <span
                style={{
                  width: '50px',
                  textAlign: 'right',
                  fontSize: '13px',
                  fontWeight: 500,
                  color: 'var(--class-muted-foreground)',
                }}
              >
                {((player.value/summedValue)*100).toFixed(2)}%
              </span>
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent 
          align="start"
          alignOffset={x}
          sideOffset={-y + 10}
          hideWhenDetached
          className="p-0 min-w-[340px]"
        >
          <div className="p-3 border-b border-background/20">
            <div className="flex items-center gap-2">
              <span 
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: player.color }}
              />
              <span className="font-medium">{player.playerName}</span>
              <span className="text-background/60 text-xs ml-auto">
                {player.className}
              </span>
            </div>
          </div>
          <AbilityBreakdownTable 
            abilities={player.abilityBreakdown ?? []} 
            totalValue={player.value}
            invertedColors
            perSecond={perSecond}
            durationMillis={durationMillis}
          />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
    
    {/* Pinned draggable tooltip */}
    {isPinned && pinnedPosition && (
      <DraggablePinnedTooltip
        player={player}
        initialPosition={pinnedPosition}
        onClose={handleClose}
        panelTitle={panelTitle}
        perSecond={perSecond}
        durationMillis={durationMillis}
      />
    )}
  </>
)
}

function formatValue(type: ChartType, player: PlayerMetricChartData, suffix?: string) {
  const styles = {
    fontSize: '0.7em',
    fontWeight: 600,
    color: 'oklch(0.985 0 0)',
    background: 'oklch(0.205 0 0 / 0.7)',
    padding: '2px 8px',
    borderRadius: '4px',
    marginRight: '12px',
  }

  switch (type) {
    // case 'healing':
      // return <span
      //   style={{
      //     ...styles
      //   }}
      //   >
      //   {player.value.toFixed(1)}/s &nbsp;
      //   <span
      //   style={{color: 'var(--class-muted-foreground)', fontSize: '0.8em'}}>
      //   {`(+${player.stackedValue?.toFixed(1) ?? 0}/s)`}
      //   </span>
      // </span>
    // case 'damage':
    default:
      return (<span
        style={{
          ...styles
        }}
      >
        {player.value.toFixed(1)}{suffix}
      </span>)
  }
}