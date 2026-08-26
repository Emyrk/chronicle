import { useMemo, useState, useRef, useCallback, useEffect, useLayoutEffect, type ReactNode } from 'react'
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
import { BreakoutIdentity } from '@/components/ui/BreakoutPanel/BreakoutIdentity';
import { usePortalContainer } from '@/components/ui/PortalContainerContext';
import { X, GripHorizontal } from 'lucide-react';
import { usePlayerSpecializations } from './PlayerSpecializationContext';
import {
  createPlayerMetricChartModel,
  type PlayerMetricChartData,
  type PlayerMetricChartRow,
} from './PlayerMetricChartModel';

export type { PlayerMetricChartData } from './PlayerMetricChartModel';

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

/** Parse pill data for a player row. */
export interface ParsePillData {
  /** Display score (0-100 integer). */
  displayScore: number;
  /** Hex color for the score. */
  color: string;
  /** Tooltip content rendered on hover. */
  tooltipContent: ReactNode;
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
  /** Called when a row is Ctrl+clicked (or Cmd+clicked on Mac). Parent can use this to show a context menu. */
  onRowCtrlClick?: (playerId: string, event: React.MouseEvent) => void
  /** Custom suffix appended to each row's value (e.g. '%'). Overrides the default '/s' from perSecond. */
  valueSuffix?: string
  /** Hide the primary value badge when it is zero, while preserving stacked secondary data. */
  hideZeroValue?: boolean
  /** Parse pill data keyed by playerID. When provided, shows a colored score pill on each matching row. */
  parsePills?: Map<string, ParsePillData>
  /** Initial pinned breakout positions, primarily for stories, screenshots, and guided demos. */
  initialPinnedPositions?: ReadonlyMap<string, { x: number; y: number }>
  /** Controlled pinned-breakout positions (e.g. scripted demos); overrides drag state. */
  pinnedPositionsOverride?: ReadonlyMap<string, { x: number; y: number }>
  /** Base URL for class icon assets. Defaults to the Chronicle application path. */
  classIconBasePath?: string
  /** Animate bar geometry changes. Disable for high-frequency replay updates. */
  animateValues?: boolean
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
  onRowCtrlClick,
  valueSuffix,
  hideZeroValue = false,
  parsePills,
  initialPinnedPositions,
  pinnedPositionsOverride,
  classIconBasePath = '/c/icons',
  animateValues = true,
  // Exclude dir from divProps to avoid type conflict with ScrollArea
  dir: _dir,
  ...divProps
}: PlayerMetricChartProps) {
  void _dir;
  const playerSpecializations = usePlayerSpecializations();
  const enrichedData = useMemo(
    () => data.map((player) => {
      const specialization = playerSpecializations.get(player.playerID);
      if (!specialization) return player;
      return {
        ...player,
        specialization: specialization.name,
        specializationIconUrl: specialization.iconUrl,
      };
    }),
    [data, playerSpecializations],
  );

  // Track which rows have pinned tooltips (multiple allowed)
  const [pinnedPlayerIds, setPinnedPlayerIds] = useState<Set<string>>(
    () => new Set(initialPinnedPositions?.keys() ?? []),
  )

  const { chartData, maximumValue, summedValue } = useMemo(
    () => createPlayerMetricChartModel(enrichedData, perSecond, duration_millis),
    [enrichedData, perSecond, duration_millis],
  )

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
      className={cn("h-full min-h-0 flex-1", className)}
      {...divProps}
    >
      <div
        style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '4px' }}
        data-lesson-target="read-chart"
      >
        {chartData.map((player, index) => {
          return <PlayerMetricRow 
            key={player.playerID}
            player={player} 
            rowHeight={rowHeight}
            maximumValue={maximumValue}
            summedValue={summedValue}
            showRank={type === 'damage' || type === 'healing' || type === 'taken' || type === 'mitigation'}
            type={type}
            suffix={valueSuffix ?? (perSecond ? '/s' : '')}
            decimals={perSecond ? 1 : 0}
            hideZeroValue={hideZeroValue}
            isPinned={pinnedPlayerIds.has(player.playerID)}
            initialPinnedPosition={initialPinnedPositions?.get(player.playerID)}
            pinnedPositionOverride={pinnedPositionsOverride?.get(player.playerID)}
            onTogglePin={() => handleTogglePin(player.playerID)}
            panelTitle={panelTitle}
            breakout={disableInteractions ? undefined : breakout}
            stackedLabel={stackedLabel}
            isFirstRow={index === 0}
            onCtrlClick={onRowCtrlClick ? (e) => onRowCtrlClick(player.playerID, e) : undefined}
            parsePill={parsePills?.get(player.playerID)}
            classIconBasePath={classIconBasePath}
            animateValues={animateValues}
          />
        })}
      </div>
    </ScrollArea>
  )
}

export interface PlayerMetricRowProps {
  player: PlayerMetricChartRow
  rowHeight: number
  maximumValue: number
  summedValue: number
  showRank: boolean
  type: ChartType
  suffix?: string
  decimals?: number
  hideZeroValue?: boolean
  isPinned?: boolean
  initialPinnedPosition?: { x: number; y: number }
  /** Controlled breakout position; overrides internal drag state. */
  pinnedPositionOverride?: { x: number; y: number }
  onTogglePin?: () => void
  panelTitle?: string
  breakout?: BreakoutFn
  stackedLabel?: string
  /** Whether this is the first row (used for tutorial highlight) */
  isFirstRow?: boolean
  /** Called when the row is Ctrl+clicked (or Cmd+clicked on Mac) */
  onCtrlClick?: (event: React.MouseEvent) => void
  /** Optional parse score pill to show at the bar's right edge */
  parsePill?: ParsePillData
  classIconBasePath?: string
  animateValues?: boolean
}

// Draggable pinned tooltip component
interface DraggablePinnedTooltipProps {
  player: PlayerMetricChartData & { color: string }
  initialPosition: { x: number; y: number }
  /** Controlled position; overrides internal drag state while set. */
  positionOverride?: { x: number; y: number }
  onClose: () => void
  panelTitle?: string
  breakout?: BreakoutFn
}

function DraggablePinnedTooltip({ player, initialPosition, positionOverride, onClose, panelTitle, breakout }: DraggablePinnedTooltipProps) {
  const isMobile = useIsMobile()
  const portalContainer = usePortalContainer()
  const portalDocument = portalContainer?.ownerDocument
  const [position, setPosition] = useState(initialPosition)
  const [isDragging, setIsDragging] = useState(false)
  const dragStartRef = useRef<{ x: number; y: number; posX: number; posY: number } | null>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    // Only start drag from non-interactive header space, and not on mobile
    if (!isMobile && target.closest('[data-drag-handle]') && !target.closest('button, input, select, a')) {
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

    if (!portalDocument) return
    portalDocument.addEventListener('mousemove', handleMouseMove)
    portalDocument.addEventListener('mouseup', handleMouseUp)
    return () => {
      portalDocument.removeEventListener('mousemove', handleMouseMove)
      portalDocument.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, portalDocument])

  if (!portalContainer) return null

  // Mobile: centered modal
  if (isMobile) {
    return createPortal(
      <>
        {/* Backdrop */}
        <div 
          className="fixed inset-0 z-[200] bg-black/50"
          onClick={onClose}
        />
        {/* Modal - centered */}
        <div
          className="fixed inset-x-2 top-1/2 z-[200] flex max-h-[85vh] -translate-y-1/2 flex-col rounded-lg bg-popover text-foreground shadow-xl"
          style={{ border: `1px solid color-mix(in oklch, ${player.color} 60%, transparent)` }}
        >
          {/* Header */}
          <div className="flex shrink-0 items-center gap-2 border-b border-border bg-background/45 px-2.5 py-1.5">
            <BreakoutIdentity
              color={player.color}
              name={player.playerName}
              className={player.className}
              specialization={player.specialization}
            />
            {panelTitle && (
              <span className="ml-auto border-l border-border pl-2 text-2xs text-muted-foreground">
                {panelTitle}
              </span>
            )}
            <button
              onClick={onClose}
              className={cn("rounded p-0.5 text-destructive/75 hover:bg-destructive/15 hover:text-destructive cursor-pointer transition-colors", !panelTitle && "ml-auto")}
            >
              <X className="h-3.5 w-3.5" />
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
      portalContainer
    )
  }

  // Desktop: draggable tooltip (portaled to body to escape panel stacking contexts)
  return createPortal(
    <div
      ref={tooltipRef}
      data-breakout-panel
      className="fixed z-[200] min-w-[340px] max-w-[90vw] rounded-md bg-popover text-foreground shadow-md"
      style={{
        left: (positionOverride ?? position).x,
        top: (positionOverride ?? position).y,
        cursor: isDragging ? 'grabbing' : 'default',
        border: `1px solid color-mix(in oklch, ${player.color} 60%, transparent)`,
      }}
      onMouseDown={handleMouseDown}
    >
      {/* Header with drag handle and close button */}
      <div
        className="flex items-center gap-2 border-b border-border bg-background/45 px-2.5 py-1.5"
        data-drag-handle
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      >
        <GripHorizontal className="h-3 w-3 shrink-0 text-muted-foreground" />
        <BreakoutIdentity
          color={player.color}
          name={player.playerName}
          className={player.className}
          specialization={player.specialization}
        />
        {panelTitle && (
          <span className="ml-auto border-l border-border pl-2 text-2xs text-muted-foreground">
            {panelTitle}
          </span>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onClose()
          }}
          className={cn("rounded p-0.5 text-destructive/75 hover:bg-destructive/15 hover:text-destructive cursor-pointer transition-colors", !panelTitle && "ml-auto")}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div>
        {breakout?.(player.playerID, true)}
      </div>
    </div>,
    portalContainer
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
  initialPinnedPosition,
  pinnedPositionOverride,
  onTogglePin,
  panelTitle,
  breakout,
  stackedLabel = 'Overheal',
  isFirstRow = false,
  onCtrlClick: onCtrlClickProp,
  parsePill,
  classIconBasePath = '/c/icons',
  animateValues = true,
  hideZeroValue = false,
}: PlayerMetricRowProps) {
  const { ref, x, y } = useMouse<HTMLDivElement>();
  const rowRef = useRef<HTMLDivElement>(null)
  const isDimmed = player.dimmed ?? false;
  const [pinnedPosition, setPinnedPosition] = useState<{ x: number; y: number } | null>(
    initialPinnedPosition ?? null,
  )
  const [tooltipOpen, setTooltipOpen] = useState(false)
  
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    // Ctrl+click (or Cmd+click on Mac) opens the focus menu
    if ((e.ctrlKey || e.metaKey) && onCtrlClickProp) {
      onCtrlClickProp(e)
      return
    }
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
  }, [isPinned, onTogglePin, x, rowHeight, breakout, onCtrlClickProp])

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

  // Parse pill placement: prefer sitting inside the bar, right-aligned at
  // the bar end. The position is clamped so it can never overlap the value
  // columns (measured via valuesRef). If the clamped position would collide
  // with the player name (short bar or long name), fall back to rendering
  // in-flow just left of the value columns.
  const nameRef = useRef<HTMLSpanElement>(null)
  const valuesRef = useRef<HTMLSpanElement>(null)
  const [pillInsideBar, setPillInsideBar] = useState(false)
  const [valuesWidth, setValuesWidth] = useState(0)
  useLayoutEffect(() => {
    if (!parsePill) return
    const row = rowRef.current
    const name = nameRef.current
    const values = valuesRef.current
    if (!row || !name) return
    const compute = () => {
      const rowWidth = row.clientWidth
      const barEnd = rowWidth * (player.value / maximumValue)
      // Name text end (offsetLeft covers rank/icon/padding; scrollWidth is
      // the full text width even when the flex box is wider).
      const nameEnd = name.offsetLeft + Math.min(name.scrollWidth, name.clientWidth)
      const pillWidth = 43 // approx: 2-3 digits + padding + border
      // Measure the actual right-side columns (value + % + optional
      // stacked %) so extra columns (e.g. overheal %) are accounted for.
      const measuredValuesW = values?.offsetWidth ?? 0
      setValuesWidth(measuredValuesW)
      // Effective pill right edge after clamping away from the values.
      const pillRight = Math.max(rowWidth - barEnd + 6, measuredValuesW + 16)
      const pillLeftEdge = rowWidth - pillRight - pillWidth
      setPillInsideBar(pillLeftEdge > nameEnd + 4)
    }
    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(row)
    if (values) ro.observe(values)
    return () => ro.disconnect()
  }, [parsePill, player.value, maximumValue])

  const pillElement = parsePill ? (
    <TooltipProvider>
      <Tooltip delayDuration={150}>
        <TooltipTrigger asChild>
          <span
            className="font-mono font-bold tabular-nums shrink-0"
            style={{
              display: 'inline-block',
              fontSize: '11px',
              padding: '1.5px 7px',
              borderRadius: '10px',
              border: `1.5px solid ${parsePill.color}`,
              color: parsePill.color,
              background: 'oklch(0.15 0 0 / 0.85)',
              lineHeight: '1.3',
            }}
            onClick={(e) => e.stopPropagation()}
            data-lesson-target="parse-scores"
          >
            {parsePill.displayScore}
          </span>
        </TooltipTrigger>
        <TooltipContent
          align="end"
          sideOffset={5}
          hideArrow
          className="max-w-[280px] bg-popover text-foreground border border-border"
        >
          {parsePill.tooltipContent}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ) : null

  const rowContent = (
    <div
      ref={setRefs}
      onClick={handleClick}
      data-panel-row={isFirstRow ? true : undefined}
      data-lesson-target={hasBreakout ? "pin-breakout" : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        height: rowHeight,
        position: 'relative',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
        color: 'var(--color-class-foreground)',//'oklch(0.985 0 0)',
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
          transition: animateValues ? 'width 0.3s ease' : 'none',
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
                transition: animateValues ? 'left 0.3s ease, width 0.3s ease' : 'none',
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

      {/* Parse score pill (inside-the-bar variant): right-aligned at the
          bar end. The max() clamp guarantees the pill never overlaps the
          value columns even if a resize races the measurement. */}
      {pillElement && pillInsideBar && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            right: `max(calc(100% - ${(player.value / maximumValue) * 100}% + 6px), ${valuesWidth + 16}px)`,
            zIndex: 2,
          }}
        >
          {pillElement}
        </div>
      )}

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

        {/* Specialization icon, falling back to class when talents are unavailable. */}
        <img
          src={player.specializationIconUrl ?? `${classIconBasePath}/class_${player.className.toLowerCase()}.png`}
          alt={player.specialization || player.className}
          data-player-icon={player.specializationIconUrl ? "specialization" : "class"}
          style={{
            width: '24px',
            height: '24px',
            marginRight: '8px',
            flexShrink: 0,
            borderRadius: '3px',
          }}
          onError={(e) => {
            const target = e.currentTarget;
            const classIcon = `${classIconBasePath}/class_${player.className.toLowerCase()}.png`;
            const unknownIcon = `${classIconBasePath}/class_unknown.png`;
            const iconType = target.dataset.playerIcon;
            if (iconType === "specialization") {
              target.dataset.playerIcon = "class";
              target.src = classIcon;
            } else if (iconType === "class") {
              target.dataset.playerIcon = "unknown";
              target.src = unknownIcon;
            } else {
              target.style.display = 'none';
            }
          }}
        />

        {/* Spec name */}
        <span
          ref={nameRef}
          style={{
            flex: '0 1 auto',
            minWidth: 0,
            fontSize: '13px',
            fontWeight: 500,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {player.playerName}
        </span>

        {/* Parse score pill (fallback variant): right after the name when
            the inside-bar position would collide with the player name. */}
        {pillElement && !pillInsideBar && (
          <span style={{ marginLeft: '8px', display: 'inline-flex', flexShrink: 0 }}>
            {pillElement}
          </span>
        )}

        {/* Spacer - keeps values/percentage right-aligned */}
        <span style={{ flex: 1, minWidth: 0 }} />
        {/* Right-side value columns — measured via valuesRef so the parse
            pill placement can avoid overlapping them. */}
        <span ref={valuesRef} style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
        {/* DPS value */}
        {(!hideZeroValue || player.displayValue !== 0)
          ? formatValue(type, player, suffix, decimals)
          : null}

        {/* Percentage */}
        <span
          className='text-xs tabular-nums'
          style={{
            width: '50px',
            textAlign: 'right',
            fontWeight: 500,
            color: 'var(--color-class-muted-foreground)',
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
              className='text-2xs tabular-nums'
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
        </span>
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
                {player.specialization ? `${player.specialization.toUpperCase()} ${player.className}` : player.className}
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
        positionOverride={pinnedPositionOverride}
        onClose={handleClose}
        panelTitle={panelTitle}
        breakout={breakout}
      />
    )}
  </>
)
}

function formatValue(type: ChartType, player: PlayerMetricChartRow, suffix?: string, decimals: number = 1) {
  const styles: React.CSSProperties = {
    fontWeight: 600,
    // color: 'oklch(0.985 0 0)',
    background: 'oklch(0.205 0 0 / 0.7)',
    padding: '2px 8px',
    borderRadius: '4px',
    marginRight: '12px',
    textAlign: 'right',
    fontFamily: 'var(--font-mono)',
    fontVariantNumeric: 'tabular-nums',
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
      //   style={{color: 'var(--color-class-muted-foreground)', fontSize: '0.8em'}}>
      //   {`(+${player.stackedValue?.toFixed(1) ?? 0}/s)`}
      //   </span>
      // </span>
    // case 'damage':
    default:
      return (<span
        className='text-xs tabular-nums'
        style={{
          ...styles
        }}
      >
        {player.displayValue.toLocaleString(undefined, {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        })}{suffix}
      </span>)
  }
}
