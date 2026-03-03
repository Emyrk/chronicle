import { useMemo, useState, useRef, useCallback, useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/Tooltip/tooltip";
import { ScrollArea } from "@/components/ui/ScrollArea/ScrollArea";
import { useMouse } from '@/hooks/useMouse';
import { useIsMobile } from '@/hooks/useIsMobile';
import { cn } from '@/lib/utils';
import { X, GripHorizontal } from 'lucide-react';

/* eslint-disable react-refresh/only-export-components */
// Re-export types from BreakdownContent for backwards compatibility
export {
  type AbilityBreakdown,
  type RawAbilities,
  computeAbilityBreakdown,
  TabbedBreakdownTable,
  AbilityBreakdownTable,
  TargetBreakdownTable,
} from './BreakdownContent';
/* eslint-enable react-refresh/only-export-components */

export type ChartType = 'damage' | 'healing' | 'taken' | 'mitigation'

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
}

/**
 * Function that renders the breakout/tooltip content for a player row.
 * @param playerID - The ID of the player to render content for
 * @param pinned - Whether this is a pinned (detached, draggable) tooltip vs a hover tooltip
 * @returns React node to display in the tooltip/breakout panel
 */
export type BreakoutFn = (playerID: string, pinned: boolean) => ReactNode

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
  /**
   * Function that renders the breakout/tooltip content for a player.
   * If not provided, no tooltip is shown.
   */
  breakout?: BreakoutFn
  /** Label for the stacked secondary metric (defaults to "Overheal") */
  stackedLabel?: string
  /** Disable hover/click breakout interactions (used by layout editor previews) */
  disableInteractions?: boolean
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
  breakout,
  stackedLabel = 'Overheal',
  disableInteractions = false,
  // Exclude dir from divProps to avoid type conflict with ScrollArea
  dir: _dir,
  ...divProps
}: PlayerMetricChartProps) {
  void _dir;
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
    const sum = computedData.reduce((sum, item) => sum + item.value, 0)
    // Avoid division by zero - return 1 if sum is 0
    return sum || 1
  }, [computedData])

  // Scale chart so the max effective value takes 75% width, leaving room for stacked
  const maximumValue = useMemo(() => {
    if (computedData.length === 0) return 1 // Avoid Math.max on empty array
    const maxEffective = Math.max(...computedData.map((item) => item.value))
    // Scale so max effective is 75% of chart, leaving 25% for stacked values
    // Avoid division by zero - return 1 if maxEffective is 0
    return maxEffective ? maxEffective / 0.75 : 1
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
    <ScrollArea
      style={style}
      className={cn("h-full min-h-0", className)}
      {...divProps}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '4px' }}>
        {chartData.map((player, index) => {
          return <PlayerMetricRow 
            key={player.playerID}
            player={player} 
            rowHeight={rowHeight}
            maximumValue={maximumValue}
            summedValue={summedValue}
            showRank={type === 'damage' || type === 'healing' || type === 'taken' || type === 'mitigation'}
            type={type}
            suffix={perSecond ? '/s' : ''}
            decimals={perSecond ? 1 : 0}
            isPinned={pinnedPlayerIds.has(player.playerID)}
            onTogglePin={() => handleTogglePin(player.playerID)}
            panelTitle={panelTitle}
            breakout={disableInteractions ? undefined : breakout}
            stackedLabel={stackedLabel}
            isFirstRow={index === 0}
          />
        })}
      </div>
    </ScrollArea>
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
  decimals?: number
  isPinned?: boolean
  onTogglePin?: () => void
  panelTitle?: string
  breakout?: BreakoutFn
  stackedLabel?: string
  /** Whether this is the first row (used for tutorial highlight) */
  isFirstRow?: boolean
}

// Draggable pinned tooltip component
interface DraggablePinnedTooltipProps {
  player: PlayerMetricChartData & { color: string }
  initialPosition: { x: number; y: number }
  onClose: () => void
  panelTitle?: string
  breakout?: BreakoutFn
}

function DraggablePinnedTooltip({ player, initialPosition, onClose, panelTitle, breakout }: DraggablePinnedTooltipProps) {
  const isMobile = useIsMobile()
  const [position, setPosition] = useState(initialPosition)
  const [isDragging, setIsDragging] = useState(false)
  const dragStartRef = useRef<{ x: number; y: number; posX: number; posY: number } | null>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only start drag from the header area, and not on mobile
    if (!isMobile && (e.target as HTMLElement).closest('[data-drag-handle]')) {
      e.preventDefault()
      setIsDragging(true)
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        posX: position.x,
        posY: position.y,
      }
    }
  }, [position, isMobile])

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

  // Mobile: centered modal
  if (isMobile) {
    return createPortal(
      <>
        {/* Backdrop */}
        <div 
          className="fixed inset-0 z-50 bg-black/50"
          onClick={onClose}
        />
        {/* Modal - centered */}
        <div
          className="fixed inset-x-2 top-1/2 -translate-y-1/2 z-50 flex flex-col bg-background rounded-lg max-h-[85vh] shadow-xl"
          style={{ border: `2px solid color-mix(in oklch, ${player.color} 50%, transparent)` }}
        >
          {/* Header */}
          <div 
            className="flex items-center gap-2 p-4 border-b border-border shrink-0"
          >
            <span 
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: player.color }}
            />
            <span className="font-medium">{player.playerName}</span>
            <span className="text-muted-foreground text-xs">
              {player.className}
            </span>
            {panelTitle && (
              <span className="text-xs text-muted-foreground border-l border-border pl-2 ml-auto">
                {panelTitle}
              </span>
            )}
            <button
              onClick={onClose}
              className={cn("p-2 rounded bg-destructive/5 text-destructive/75 hover:bg-destructive/25 hover:text-destructive cursor-pointer transition-colors", !panelTitle && "ml-auto")}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          {/* Content - scrollable both directions */}
          <div 
            className="flex-1 styled-scrollbar"
            style={{ overflow: 'auto' }}
          >
            {breakout?.(player.playerID, true)}
          </div>
        </div>
      </>,
      document.body
    )
  }

  // Desktop: draggable tooltip
  return (
    <div
      ref={tooltipRef}
      data-breakout-panel
      className="bg-popover text-foreground border-3 border-solid fixed z-50 min-w-[340px] max-w-[90vw] rounded-md shadow-md"
      style={{
        left: position.x,
        top: position.y,
        cursor: isDragging ? 'grabbing' : 'default',
        border: `2px solid color-mix(in oklch, ${player.color} 50%, transparent)`,
      }}
      onMouseDown={handleMouseDown}
    >
      {/* Header with drag handle and close button */}
      <div 
        className="flex items-center gap-2 p-3 border-b border-border"
        data-drag-handle
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      >
        <GripHorizontal className="h-4 w-4 flex-shrink-0" />
        <span 
          className="w-3 h-3 rounded-full flex-shrink-0"
          style={{ backgroundColor: player.color }}
        />
        <span className="font-medium">{player.playerName}</span>
        <span className="text-muted-foreground text-xs">
          {player.className}
        </span>
        {panelTitle && (
          <span className="text-xs text-muted-foreground border-l border-border pl-2 ml-auto">
            {panelTitle}
          </span>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onClose()
          }}
          className={cn("p-1 rounded bg-destructive/5 text-destructive/75 hover:bg-destructive/25 hover:text-destructive cursor-pointer transition-colors", !panelTitle && "ml-auto")}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div>
        {breakout?.(player.playerID, true)}
      </div>
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
  decimals,
  isPinned = false,
  onTogglePin,
  panelTitle,
  breakout,
  stackedLabel = 'Overheal',
  isFirstRow = false,
}: PlayerMetricRowProps) {
  const { ref, x, y } = useMouse<HTMLDivElement>();
  const rowRef = useRef<HTMLDivElement>(null)
  const isDimmed = player.dimmed ?? false;
  const [pinnedPosition, setPinnedPosition] = useState<{ x: number; y: number } | null>(null)
  const [tooltipOpen, setTooltipOpen] = useState(false)
  
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    if (!breakout) return // No action if no breakout function
    if (!isPinned && rowRef.current) {
      // Calculate initial position for the pinned tooltip
      const rect = rowRef.current.getBoundingClientRect()
      setPinnedPosition({
        x: rect.left + x,
        y: rect.top + rowHeight + 5,
      })
    }
    onTogglePin?.()
  }, [isPinned, onTogglePin, x, rowHeight, breakout])

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

  const hasBreakout = !!breakout

  const rowContent = (
    <div
      ref={setRefs}
      onClick={handleClick}
      data-panel-row={isFirstRow ? true : undefined}
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
        cursor: hasBreakout ? 'pointer' : 'default',
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
      
      {/* Stacked secondary value - fills remaining space, stripes at end when overflow */}
      {player.stackedValue && player.stackedValue > 0 && (() => {
        const mainBarEnd = (player.value / maximumValue) * 100;
        const stackedWidth = (player.stackedValue / maximumValue) * 100;
        const availableSpace = 100 - mainBarEnd;
        // Overflow when stacked would extend beyond available space
        const isOverflowing = stackedWidth > availableSpace;
        // Always display what fits
        const displayWidth = Math.min(stackedWidth, availableSpace);
        
        return (
          <>
            {/* Main stacked bar */}
            <div
              style={{
                position: 'absolute',
                left: `${mainBarEnd}%`,
                top: 0,
                bottom: 0,
                width: `${displayWidth}%`,
                background: player.color,
                opacity: 0.35,
                transition: 'width 0.3s ease',
              }}
              title={isOverflowing ? `${stackedLabel} extends beyond chart` : undefined}
            />
            {/* Striped end cap to indicate overflow */}
            {isOverflowing && (
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  top: 0,
                  bottom: 0,
                  width: '12px',
                  background: `repeating-linear-gradient(
                    -45deg,
                    ${player.color},
                    ${player.color} 2px,
                    transparent 2px,
                    transparent 4px
                  )`,
                  opacity: 0.5,
                }}
                title={`${stackedLabel} extends beyond chart`}
              />
            )}
          </>
        );
      })()}

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
        {formatValue(type, player, suffix, decimals)}

        {/* Percentage */}
        <span
          className='text-xs'
          style={{
            width: '50px',
            textAlign: 'right',
            fontWeight: 500,
            color: 'var(--class-muted-foreground)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {((player.value/summedValue)*100).toFixed(2)}%
        </span>
        
        {/* Stacked percentage - shown when stackedValue exists */}
        {player.stackedValue !== undefined && player.stackedValue > 0 && (() => {
          const totalWithStacked = player.value + player.stackedValue;
          const stackedPct = totalWithStacked > 0 ? (player.stackedValue / totalWithStacked) * 100 : 0;
          return (
            <span
              className='text-2xs'
              style={{
                width: '50px',
                textAlign: 'right',
                fontWeight: 500,
                color: 'var(--color-yellow-500)',
                opacity: 0.7,
                fontFamily: 'var(--font-mono)',
              }}
              title={`${stackedPct.toFixed(1)}% ${stackedLabel.toLowerCase()}`}
            >
              ({stackedPct.toFixed(0)}%)
            </span>
          );
        })()}
      </div>
    </div>
  )

  // If no breakout function, just render the row without tooltip
  if (!hasBreakout) {
    return rowContent
  }

  return (
  <>
    <TooltipProvider key={player.playerID + player.playerName}>
      <Tooltip 
        delayDuration={0} 
        open={isPinned ? false : tooltipOpen}
        onOpenChange={setTooltipOpen}
        disableHoverableContent
      >
        <TooltipTrigger asChild>
          {rowContent}
        </TooltipTrigger>
        <TooltipContent 
          align="start"
          alignOffset={x+2}
          sideOffset={-y + 10}
          hideWhenDetached
          hideArrow
          className="p-0 min-w-[340px] max-w-[90vw] bg-popover text-foreground animate-none border-2"
          style={{ borderColor: `color-mix(in oklch, ${player.color} 60%, transparent)` }}
        >
          <div className="p-3 border-b border-border">
            <div className="flex items-center gap-2">
              <span 
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: player.color }}
              />
              <span className="font-medium">{player.playerName}</span>
              <span className="text-muted-foreground text-xs ml-auto">
                {player.className}
              </span>
            </div>
          </div>
          {breakout(player.playerID, false)}
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
        breakout={breakout}
      />
    )}
  </>
)
}

function formatValue(type: ChartType, player: PlayerMetricChartData, suffix?: string, decimals: number = 1) {
  const styles: React.CSSProperties = {
    fontWeight: 600,
    // color: 'oklch(0.985 0 0)',
    background: 'oklch(0.205 0 0 / 0.7)',
    padding: '2px 8px',
    borderRadius: '4px',
    marginRight: '12px',
    fontFamily: 'var(--font-mono)',
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
        className='text-xs'
        style={{
          ...styles
        }}
      >
        {player.value.toLocaleString(undefined, {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        })}{suffix}
      </span>)
  }
}
