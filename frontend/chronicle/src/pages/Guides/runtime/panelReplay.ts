import {
  FastAbsorbedCursor, FastAuraCastCursor, FastAuraCursor, FastCastCursor, FastCombatantInfoCursor, FastConsumeCursor, FastDamageCursor,
  FastDispelCursor, FastExtraAttackCursor, FastHealCursor, FastInterruptCursor, FastRaidGroupCursor, FastResourceChangeCursor,
  FastResurrectionCursor, FastSlainCursor, FastSpellFailCursor, FastSpellGoCursor, FastSpellStartCursor, FastUnitClassificationCursor,
  FastUnitPositionCursor, FastUnitResourcesCursor, type PayloadHeader,
} from "@/api/protodecode/decode"
import type { PanelStream } from "./panelEvents"

/** A decoded event as the cursor returns it. The object is reused by the next read; never keep it. */
export type ReplayEvent = { index: number; offsetMilli: number }

interface StreamCursor {
  readonly currentHeader: PayloadHeader | null
  readonly hasMoreInEncounter: boolean
  next(): ReplayEvent | null
  nextEncounter(): boolean
  skipEncounter(): boolean
}

const CURSORS: Record<PanelStream, new (data: Uint8Array) => StreamCursor> = {
  damage: FastDamageCursor, heal: FastHealCursor, absorbed: FastAbsorbedCursor, resource_change: FastResourceChangeCursor,
  extra_attack: FastExtraAttackCursor, slain: FastSlainCursor, ressurection: FastResurrectionCursor, cast: FastCastCursor,
  spell_start: FastSpellStartCursor, spell_go: FastSpellGoCursor, spell_fail: FastSpellFailCursor, aura: FastAuraCursor,
  aura_cast: FastAuraCastCursor, dispel: FastDispelCursor, interrupt: FastInterruptCursor, unit_classification: FastUnitClassificationCursor,
  unit_position: FastUnitPositionCursor, unit_resources: FastUnitResourcesCursor, combatant_info: FastCombatantInfoCursor,
  consume: FastConsumeCursor, raid_group: FastRaidGroupCursor,
}

interface Peekable {
  stream: PanelStream
  cursor: StreamCursor
  event: ReplayEvent | null
  encounterId: string
  startMs: number
}

/**
 * Replays several framed event streams in log order: encounter by encounter (earliest first), and within
 * an encounter by event index across streams. With `selectedOnly`, other encounters are skipped without
 * decoding.
 */
export function replayStreams(
  streams: ReadonlyArray<{ stream: PanelStream; data: Uint8Array }>,
  options: ReplayOptions,
  onEvent: ReplayCallback,
): Set<string> {
  const replay = createStreamReplay(streams, options)
  replay.run(onEvent)
  return replay.encounters
}

type ReplayOptions = { selected: ReadonlySet<string>; selectedOnly: boolean; unselectedStreams?: ReadonlySet<PanelStream> }
type ReplayCallback = (stream: PanelStream, event: ReplayEvent, encounterId: string, startMs: number) => void

/**
 * A replay that can pause at a log timestamp and resume later, in the same order as replayStreams.
 * Replay mode uses it to deliver events only up to the playhead.
 */
export function createStreamReplay(streams: ReadonlyArray<{ stream: PanelStream; data: Uint8Array }>, options: ReplayOptions) {
  const cursors: Peekable[] = streams.map(({ stream, data }) => ({ stream, cursor: new CURSORS[stream](data), event: null, encounterId: "", startMs: 0 }))
  const peek = (pc: Peekable): ReplayEvent | null => {
    while (!pc.event) {
      const header = pc.cursor.currentHeader
      if (!header) return null
      if (!pc.cursor.hasMoreInEncounter) { pc.cursor.nextEncounter(); continue }
      if (options.selectedOnly && !options.selected.has(header.encounterID) && !options.unselectedStreams?.has(pc.stream)) { pc.cursor.skipEncounter(); continue }
      pc.event = pc.cursor.next()
      pc.encounterId = header.encounterID
      pc.startMs = header.firstTimestamp.getTime()
    }
    return pc.event
  }
  const encounters = new Set<string>()
  // The encounter being replayed; null between encounters.
  let encounterId: string | null = null
  let done = false
  return {
    /** Every encounter that delivered (or started delivering) events so far. */
    encounters,
    /**
     * Delivers events whose log time (encounter start + offset, epoch ms) is at most untilMs, then pauses
     * before the next one. Returns true once every event has been delivered.
     */
    run(onEvent: ReplayCallback, untilMs = Infinity): boolean {
      while (!done) {
        if (encounterId === null) {
          let current: Peekable | null = null
          for (const pc of cursors) if (peek(pc) && (!current || pc.startMs < current.startMs)) current = pc
          if (!current) { done = true; break }
          encounterId = current.encounterId
        }
        let next: Peekable | null = null
        for (const pc of cursors) {
          const event = peek(pc)
          if (event && pc.encounterId === encounterId && (!next || event.index < next.event!.index)) next = pc
        }
        if (!next) { encounterId = null; continue }
        const event = next.event!
        if (next.startMs + event.offsetMilli > untilMs) return false
        encounters.add(encounterId)
        next.event = null
        onEvent(next.stream, event, encounterId, next.startMs)
      }
      return true
    },
  }
}
