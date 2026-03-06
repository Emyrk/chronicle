/**
 * Shared types for EventsPanels
 */

import type { PlayerMetricChartData } from "@/components/ui/PlayerMetricChart/PlayerMetricChart";
import type { StreamType } from "@/hooks/instanceEvents";
import type { Instance } from "../InstancePage";
import type { ProcessorContext, ProcessorEvent, ProcessorPagination } from "./processorTypes";
import type { ReusableDamage } from "@/api/protodecode/decode";
import type { PanelFilter } from "./processors/filters";

/**
 * Selection state for filtering entities
 */
export interface EntitySelection {
  enemyIds: Set<string>;
  playerIds: Set<string>;
}

/**
 * Context available to panels for processing and rendering.
 */
export interface PanelContext {
  /** Optional render mode hint for panel presentation contexts (e.g., Layout Lab). */
  renderMode?: "default" | "layout_lab";

  /** The full instance data (players, encounters, metadata) */
  instance: Instance;
  
  /** Currently selected encounter IDs */
  selectedEncounterIds: string[];
  
  /** Currently selected entity GUIDs for filtering display */
  entitySelection: EntitySelection;
  
  /** Callback to select specific encounter(s) */
  onSelectEncounters?: (encounterIds: string[]) => void;
  
  /** Callback to toggle player selection */
  onTogglePlayer?: (playerId: string) => void;
  
  /** Callback to toggle multiple players at once (all selected or all deselected) */
  onTogglePlayers?: (playerIds: string[]) => void;
  
  /** Optional pagination for processors that support paging (e.g., all_activity) */
  pagination?: ProcessorPagination;
}

/**
 * Callback invoked for each event during aggregation.
 * The event object is reused - do not store references to it.
 */
export type EventCallback = (event: ReusableDamage, encounterID: string) => void;

/**
 * Function that processes events and builds aggregated data.
 * Called with a callback that will be invoked for each event.
 */
export type AggregatorFn = (
  onEvent: EventCallback,
  encounterID: string,
) => void;

/**
 * Configuration for a panel type
 * 
 * @typeParam TResult - The aggregated state type returned by this processor
 * @typeParam TEvent - The event types this processor handles (defaults to all ProcessorEvent types)
 */
export interface PanelDefinition<TResult, TEvent extends ProcessorEvent = ProcessorEvent> {
  /** Unique identifier for this panel type */
  id: string;
  
  /** Display label */
  label: string;
  
  /** Icon component */
  icon: React.ReactNode;
  
  /** Which streams this panel needs */
  streams: StreamType[];
  
  /** Whether this panel supports per-second display mode (shows checkbox when true) */
  supportsPerSecond?: boolean;
  
  /** Custom label for the checkbox (defaults to "Per second" when supportsPerSecond is true) */
  checkboxLabel?: string;
  
  /**
   * If true, this panel manages its own aggregation (e.g., for custom pagination).
   * EventsPanel will skip calling usePanelAggregation and pass only context to render.
   */
  selfManagesAggregation?: boolean;
  
  /** If true, shows a warning indicator that this panel is experimental */
  underConstruction?: boolean;

  /** Whether this panel supports the filter-builder UI on the card back. */
  supportsFiltering?: boolean;

  /** Fixed filters that are always active and cannot be edited by the user. */
  fixedFilters?: PanelFilter[];
  
  /**
   * Create the initial state for aggregation
   */
  createState: () => TResult;
  
  /**
   * Process a single event and update the state.
   * Runs in a Web Worker with serializable ProcessorContext.
   */
  processEvent: (
    state: TResult,
    event: TEvent,
    encounterID: string,
    firstTimestamp: Date,
    streamType: StreamType,
    context: ProcessorContext,
  ) => void;
  
  /**
   * Render the panel content.
   * Called with the aggregated result and display context.
   * 
   * Components inside render can decide their own caching strategy:
   * - Use `props.result` directly for always-fresh data
   * - Cache result when `props.loading` becomes true for static data
   */
  render: (props: PanelRenderProps<TResult>) => React.ReactNode;
}

export interface PanelRenderProps<TResult> {
  /** The aggregated state */
  result: TResult;
  
  /** Total events processed */
  totalEvents: number;
  
  /** Processing time in ms */
  processingTimeMs: number | null;
  
  /** Duration of selected encounters in ms */
  durationMs: number;
  
  /** Whether to show per-second values (or generic checkbox state) */
  perSecond: boolean;
  
  /** Generic checkbox state (same as perSecond, clearer name for non-perSecond uses) */
  checkboxChecked: boolean;
  
  /** Loading state */
  loading: boolean;
  
  /** Processing state */
  processing: boolean;
  
  /** Error if any */
  error: Error | null;
  
  /** Full context for rendering (instance data, selections) */
  context: PanelContext;
  
  /** Panel-specific option from URL (e.g., selected aura name) */
  panelOption?: string | null;
  
  /** Callback to update the panel option in URL */
  setPanelOption?: (option: string | null) => void;

  /** Optional panel-specific context payload for processor configuration. */
  panelContext?: Record<string, unknown> | null;

  /** Bumps whenever panelContext changes; useful for local cache invalidation. */
  panelContextVersion?: number;

  /** Stable panel slot index in the current layout (0-based). */
  panelIndex?: number;
  /** Callback to update panel-specific context payload. */
  setPanelContext?: (context: Record<string, unknown> | null) => void;
}

/**
 * Common aggregation result: map of entity ID to numeric value
 */
export type EntityValueMap = Map<string, number>;

export type PlayerMetricChartMap = Map<string, PlayerMetricChartData>;