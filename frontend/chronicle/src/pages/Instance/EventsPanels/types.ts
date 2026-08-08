/**
 * Shared types for EventsPanels
 */

import type { PlayerMetricChartData } from "@/components/ui/PlayerMetricChart/PlayerMetricChart";
import type { StreamType } from "@/hooks/instanceEvents";
import type { Instance } from "../InstancePage";
import type { ProcessorContext, ProcessorEvent, ProcessorPagination } from "./processorTypes";
import type { ReusableDamage } from "@/api/protodecode/decode";
import type { PanelFilter } from "./processors/filters";
import type { GroupingOption } from "./processors/resolveEntity";
export type { GroupingOption };

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

  /** If true, this panel is hidden from the panel selector unless ?debug=true */
  hidden?: boolean;
  
  /** Custom label for the checkbox (defaults to "Per second" when supportsPerSecond is true) */
  checkboxLabel?: string;
  
  /**
   * If true, this panel manages its own aggregation (e.g., for custom pagination).
   * EventsPanel will skip calling usePanelAggregation and pass only context to render.
   */
  selfManagesAggregation?: boolean;

  /**
   * How this panel's data behaves while Sync mode is active.
   *
   * - "incremental" (default): main-thread processing rebuilds results up to the
   *   Sync timestamp, so metrics grow as playback advances.
   * - "full": the panel always aggregates the complete encounter in the Web
   *   Worker, even during Sync. Sync only supplies presentation timing
   *   (cursors, playheads, row emphasis) that the panel reads itself.
   *
   * Full-data panels keep working when added mid-playback, keep their full
   * encounter duration, and keep applied filters; only filter editing is
   * paused while Sync runs.
   */
  syncDataMode?: "incremental" | "full";
  
  /** If true, shows a warning indicator that this panel is experimental */
  underConstruction?: boolean;

  /** Whether this panel supports the filter-builder UI on the card back. */
  supportsFiltering?: boolean;

  /** Fixed filters that are always active and cannot be edited by the user. */
  fixedFilters?: PanelFilter[];

  /** Default filters pre-populated in the user filter list. Editable and removable.
   *  Reset restores these instead of clearing to empty. */
  defaultFilters?: PanelFilter[];

  /** Available grouping options for this panel. Shown on the card back.
   *  The first option is the default. Stored as a `g:<value>` token in panelOption. */
  groupingOptions?: GroupingOption[];

  /** Available pet handling options. Shown on the card back.
   *  The first option is the default. Stored as a `p:<value>` token in panelOption. */
  petOptions?: GroupingOption[];

  /**
   * panelOption tokens that only affect rendering, never processing.
   * Entries ending in ":" match as prefixes (e.g. "pl:"), others match
   * exactly (e.g. "cb"). Matching tokens are stripped from the panelOption
   * passed to aggregation, so changing them reuses the cached worker result
   * instead of re-processing the event streams.
   */
  renderOnlyOptionTokens?: string[];
  
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

  /**
   * Optional custom card-back renderer. When defined, replaces the default
   * PanelFilterEditor on the back of the panel card.
   */
  renderCardBack?: (props: CardBackProps) => React.ReactNode;

  /**
   * Optional hook to hydrate panelContext from a persisted panelOption string.
   * Called during the panelType-change effect, AFTER the default context reset.
   * Panels that persist complex config in panelOption (e.g. Timeline series)
   * should implement this to avoid the race between child useEffect hydration
   * and the parent panelType effect that resets context to null.
   */
  hydrateContext?: (panelOption: string) => Record<string, unknown> | null;
}

/**
 * Props passed to a custom card-back renderer.
 */
export interface CardBackProps {
  panelContext: Record<string, unknown> | null;
  setPanelContext: (ctx: Record<string, unknown> | null) => void;
  onClose: () => void;
  onReset: () => void;
  panelLabel?: string;
  panelIcon?: React.ReactNode;
  borderColor?: string | null;
  onBorderColorChange?: (color: string | null) => void;
  customTitle?: string | null;
  onCustomTitleChange?: (title: string | null) => void;
  /** Persisted panel option string (survives saves / shared layouts). */
  panelOption?: string | null;
  /** Callback to persist panel option. */
  setPanelOption?: (option: string | null) => void;
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
  panelContextVersion?: string | number;

  /** Stable panel slot index in the current layout (0-based). */
  panelIndex?: number;
  /** Stable layout item ID (e.g. "panel-1"). */
  panelId?: string;
  /** Callback to update panel-specific context payload. */
  setPanelContext?: (context: Record<string, unknown> | null) => void;

  /** Register this panel's PlayerMetricChartData[] in the shared ChartDataRegistry. */
  registerChartData?: (data: PlayerMetricChartData[]) => void;
  /** Whether user-customized filters are active on this panel. */
  hasCustomFilters?: boolean;

}

/**
 * Common aggregation result: map of entity ID to numeric value
 */
export type EntityValueMap = Map<string, number>;

export type PlayerMetricChartMap = Map<string, PlayerMetricChartData>;