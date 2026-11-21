import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ReactElement } from "react"
import type { EventsPanelProps } from "../EventsPanel"
import type { PanelFilter } from "../processors/filters"
import { PanelFilterEditor } from "../PanelFilterEditor"
import { LuaPanelHost } from "./LuaPanelHost"
import LuaEventsPanel from "./LuaEventsPanel"

// A synchronous hook harness keeps these state/transport tests independent of DOM,
// networking, stream decoding, and worker startup.
const mock = vi.hoisted(() => ({
  states: [] as unknown[], cursor: 0, sync: false,
  panel: { name: "Test", filterMode: "prefilter" as string | undefined, streams: [], assets: [] },
}))
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useState: (initial: unknown) => {
    const index = mock.cursor++
    if (!(index in mock.states)) mock.states[index] = initial
    return [mock.states[index], (value: unknown) => { mock.states[index] = value }]
  },
  useRef: (initial: unknown) => {
    const index = mock.cursor++
    if (!(index in mock.states)) mock.states[index] = { current: initial }
    return mock.states[index]
  },
  useMemo: (fn: () => unknown) => fn(),
  useCallback: (fn: unknown) => fn,
  useEffect: () => {},
}))
vi.mock("@tanstack/react-query", () => ({ useQuery: ({ queryKey }: { queryKey: string[] }) => ({
  data: queryKey[0] === "lua-panel-package" ? mock.panel : {}, isPending: false,
}) }))
vi.mock("@/hooks/instanceEvents", () => ({ useInstanceEventsContext: () => ({ fetchStream: vi.fn() }) }))
vi.mock("../../../LuaProjects/api", () => ({ channelSha: () => "sha" }))
vi.mock("./luaPanelRegistry", () => ({ parseLuaPanelRef: () => ({ id: "test", channel: "stable" }) }))
vi.mock("../PanelTimingContext", () => ({ usePanelTiming: () => {}, usePanelTimingContext: () => null }))
vi.mock("../../SyncModeContext", () => ({ useSyncModeContextOptional: () => ({ enabled: mock.sync }) }))
vi.mock("../../TimeRangeContext", () => ({ useTimeRangeContextOptional: () => null }))
vi.mock("../PanelFilterEditor", () => ({ PanelFilterEditor: () => null }))
vi.mock("../PanelSelector", () => ({ PanelSelector: () => null }))
vi.mock("./LuaPanelHost", () => ({ LuaPanelHost: () => null }))
vi.mock("../usePanelAggregation", () => ({ toSerializableContext: () => ({
  players: { player: { name: "Player", class: "Mage", level: 60 } },
  units: { pet: { name: "Pet", owner: "player", entry: 1 } },
  selectedEncounterIds: ["fight"], entitySelection: { playerIds: ["player"], enemyIds: [] },
}) }))

function elements(node: unknown): ReactElement<Record<string, unknown>>[] {
  if (!node || typeof node !== "object") return []
  if (Array.isArray(node)) return node.flatMap(elements)
  const element = node as ReactElement<Record<string, unknown>>
  return [element, ...elements(element.props?.children), ...elements(element.props?.front)]
}
const seed: PanelFilter[] = [{ type: "ability_name", value: "Fireball" }]
let props: EventsPanelProps
function render() {
  mock.cursor = 0
  const wrapper = LuaEventsPanel(props)
  const content = wrapper.type as (props: EventsPanelProps) => ReactElement
  // Second render settles render-phase seed replacement like React does.
  content(props)
  // Model resolved support-stream fetching; network effects are outside this harness.
  mock.states[4] = {}
  mock.cursor = 0
  return elements(content(props))
}
function editor() { return render().find(element => element.type === PanelFilterEditor)! }
function host() { return render().find(element => element.type === LuaPanelHost)! }
function open() {
  const button = render().find(element => element.props["aria-label"] === "Edit panel filters")!
  ;(button.props.onClick as () => void)()
}
beforeEach(() => {
  mock.states = []; mock.cursor = 0; mock.sync = false; mock.panel.filterMode = "prefilter"
  props = { panelType: "lua:test:stable", context: { instance: { players: {}, units: {} }, selectedEncounterIds: [], entitySelection: { playerIds: new Set(), enemyIds: new Set() } }, seedFilters: seed, seedFiltersVersion: 1, onFiltersChange: vi.fn() } as unknown as EventsPanelProps
})

describe("LuaEventsPanel filters", () => {
  it("buffers edits, persists them eagerly, and applies on Back", () => {
    open()
    const edited: PanelFilter[] = [{ type: "ability_name", value: "Frostbolt" }]
    ;(editor().props.onChange as (filters: PanelFilter[]) => void)(edited)
    expect(props.onFiltersChange).toHaveBeenCalledWith(edited)
    expect((host().props.filterContext as { filters: PanelFilter[] }).filters).toEqual(seed)
    ;(editor().props.onClose as () => void)()
    expect((host().props.filterContext as { filters: PanelFilter[] }).filters).toEqual(edited)
    expect(editor()).toBeUndefined()
  })

  it("replaces seeds only for new versions, including an empty seed", () => {
    props = { ...props, seedFilters: [] }
    expect((host().props.filterContext as { filters: PanelFilter[] }).filters).toEqual([])
    props = { ...props, seedFilters: seed }
    expect((host().props.filterContext as { filters: PanelFilter[] }).filters).toEqual([])
    props = { ...props, seedFiltersVersion: 2 }
    expect((host().props.filterContext as { filters: PanelFilter[] }).filters).toEqual(seed)
    open()
    props = { ...props, seedFilters: [], seedFiltersVersion: 3 }
    expect((host().props.filterContext as { filters: PanelFilter[] }).filters).toEqual([])
    expect(editor()).toBeUndefined()
    expect(props.onFiltersChange).not.toHaveBeenCalled()
  })

  it("supports manual mode, reset, and clone-safe compiler context", () => {
    mock.panel.filterMode = "manual"
    open()
    ;(editor().props.onReset as () => void)()
    expect(props.onFiltersChange).toHaveBeenCalledWith([])
    const context = host().props.filterContext
    expect(structuredClone(context)).toEqual(context)
    expect(context).toMatchObject({ selectedEncounterIds: new Set(["fight"]), entitySelection: { playerIds: new Set(["player"]) }, filters: [] })
  })

  it("hides opt-out editing and keeps applied filters during Sync", () => {
    open()
    mock.sync = true
    expect(editor()).toBeUndefined()
    expect(render().find(element => element.props["aria-label"] === "Edit panel filters")?.props.disabled).toBe(true)
    expect((host().props.filterContext as { filters: PanelFilter[] }).filters).toEqual(seed)
    mock.panel.filterMode = "none"
    expect(render().find(element => element.props["aria-label"] === "Edit panel filters")).toBeUndefined()
    expect(host().props.filterContext).toBeUndefined()
  })

  it("defaults to no filter editor when filterMode is omitted", () => {
    mock.panel.filterMode = undefined
    expect(render().find(element => element.props["aria-label"] === "Edit panel filters")).toBeUndefined()
    expect(host().props.filterContext).toBeUndefined()
  })

  it("keys local state by module identity", () => {
    const before = LuaEventsPanel(props)
    props = { ...props, panelType: "lua:other:stable" as EventsPanelProps["panelType"] }
    expect(LuaEventsPanel(props).key).not.toBe(before.key)
  })
})
