/**
 * Rotation timeline processor (pure TS, worker-safe).
 *
 * Collects, for the focus players named in panelContext.focus, everything the
 * rotation timeline draws: casts (with cast time and linked damage), auto
 * attacks, 1 s damage bins, and aura segments. It also totals damage for every
 * player so the page can pick sensible defaults.
 *
 * Only one encounter is processed. Offsets are ms since the encounter's first
 * event (offsetMilli).
 */

import type {
  PanelProcessor,
  ProcessorContext,
  AuraProcessorEvent,
  CastProcessorEvent,
  DamageProcessorEvent,
  SlainProcessorEvent,
  SpellFailProcessorEvent,
  SpellGoProcessorEvent,
  SpellStartProcessorEvent,
} from "../processorTypes";
import { AuraState, CastAction } from "../processorTypes";
import type { StreamType } from "@/hooks/instanceEvents";
import { hasHitType, HitTypeCrit, HitTypeOffHand, HitTypePeriodic } from "@/lib/hittype/hittype";

export const AUTO_ATTACK_SPELL_ID = 6603;
/** A direct hit links to a cast of the same spell this recently (travel time). */
export const DAMAGE_LINK_WINDOW_MS = 3000;
export const DAMAGE_BIN_MS = 1000;

export interface TimelineCast {
  /** When the cast began (spell_start / "begins to cast"), or the go time for instants. */
  startMs: number;
  /** When the spell went off. Equal to startMs for instants. */
  endMs: number;
  spellId: number;
  spellName: string;
  target: string;
  /** Cast time reported by the log (spell_start), if any. */
  castTimeMs: number | null;
  channelTimeMs: number | null;
  failed: boolean;
  itemId: number | null;
  /** Damage linked to this cast: direct hits plus periodic ticks. */
  damage: number;
  periodicDamage: number;
  hits: number;
  crits: number;
}

export interface TimelineSwing {
  offsetMs: number;
  offHand: boolean;
  hitType: number;
  /** Total damage, including tailers (weapon/seal procs logged on the swing). */
  amount: number;
  /** The part of amount that came from tailers. */
  tailerAmount: number;
  target: string;
}

export interface TimelineAuraSegment {
  spellId: number | null;
  spellName: string;
  isBuff: boolean;
  caster: string | null;
  target: string;
  startMs: number;
  /** null while still active at encounter end. */
  endMs: number | null;
  maxStacks: number;
}

export interface PlayerTimelineData {
  guid: string;
  /** Casts from spell_go / spell_start / spell_fail (vanilla pipe format, wotlk). */
  goCasts: TimelineCast[];
  /** Casts from the text "cast" stream (older vanilla logs). */
  textCasts: TimelineCast[];
  swings: TimelineSwing[];
  /** Damage per DAMAGE_BIN_MS bin, including pets. */
  damageBins: number[];
  totalDamage: number;
  /** Buffs and debuffs on this player. */
  aurasOn: TimelineAuraSegment[];
  /** Debuffs this player applied to other units (caster attributed). */
  debuffsCast: TimelineAuraSegment[];
  /** Damage dealt per target GUID. */
  damageByTarget: Record<string, number>;
}

interface PendingStart {
  startMs: number;
  spellId: number;
  castTimeMs: number | null;
  channelTimeMs: number | null;
}

interface PlayerScratch {
  pendingGo: PendingStart | null;
  pendingText: PendingStart | null;
  /** spellId → index of the latest cast, per source. */
  lastGoBySpell: Map<number, number>;
  lastTextBySpell: Map<number, number>;
}

export interface RotationTimelineResult {
  encounterId: string | null;
  /** Absolute time (epoch ms) of the encounter's first event; offsets are relative to it. */
  firstTimestampMs: number | null;
  multipleEncounters: boolean;
  /** Largest event offset seen, a stand-in for encounter length. */
  lastOffsetMs: number;
  players: Map<string, PlayerTimelineData>;
  /** Every player's total damage (including pets), for default A/B selection. */
  damageByPlayer: Map<string, number>;
  _scratch: Map<string, PlayerScratch>;
  /** target guid → open aura segments on it */
  _openAuras: Map<string, TimelineAuraSegment[]>;
}

export type RotationTimelineEvent =
  | SpellGoProcessorEvent
  | SpellStartProcessorEvent
  | SpellFailProcessorEvent
  | CastProcessorEvent
  | DamageProcessorEvent
  | AuraProcessorEvent
  | SlainProcessorEvent;

export function focusFromContext(context: ProcessorContext): Set<string> {
  const focus = context.panelContext?.focus;
  return new Set(Array.isArray(focus) ? focus.filter((g): g is string => typeof g === "string") : []);
}

function emptyPlayer(guid: string): PlayerTimelineData {
  return {
    guid,
    goCasts: [],
    textCasts: [],
    swings: [],
    damageBins: [],
    totalDamage: 0,
    aurasOn: [],
    debuffsCast: [],
    damageByTarget: {},
  };
}

function ownerOf(guid: string, context: ProcessorContext): string {
  if (context.players[guid]) return guid;
  const owner = context.unitState?.getOwner(guid) ?? context.units?.[guid]?.owner ?? null;
  return owner && context.players[owner] ? owner : guid;
}

const normalizeName = (name: string) => name.trim().toLowerCase();

/** Same aura by spell ID, falling back to name (some log lines only carry the name). */
function sameAura(seg: TimelineAuraSegment, spellId: number | null, spellName: string): boolean {
  if (spellId != null && seg.spellId === spellId) return true;
  return normalizeName(seg.spellName) === normalizeName(spellName);
}

/**
 * Close open segments for a removed aura. Like the shared aura state machine,
 * a removal matches by spell ID or name whatever the caster, because fades are
 * often logged without one. When the fade does name a caster, only that
 * caster's segment closes.
 */
export function closeAuraSegments(
  open: TimelineAuraSegment[],
  spellId: number | null,
  spellName: string,
  caster: string | null,
  atMs: number,
): TimelineAuraSegment[] {
  const matches = open.filter((seg) => sameAura(seg, spellId, spellName));
  const exact = caster != null ? matches.filter((seg) => seg.caster === caster) : [];
  const closing = new Set(exact.length > 0 ? exact : matches);
  for (const seg of closing) seg.endMs = atMs;
  return open.filter((seg) => !closing.has(seg));
}

function newCast(startMs: number, endMs: number, spellId: number, spellName: string, target: string): TimelineCast {
  return {
    startMs,
    endMs,
    spellId,
    spellName,
    target,
    castTimeMs: null,
    channelTimeMs: null,
    failed: false,
    itemId: null,
    damage: 0,
    periodicDamage: 0,
    hits: 0,
    crits: 0,
  };
}

/** Attach a pending "begins to cast" to the cast that completes it. */
function completeCast(cast: TimelineCast, pending: PendingStart | null): void {
  if (!pending || pending.spellId !== cast.spellId) return;
  cast.startMs = pending.startMs;
  cast.castTimeMs = pending.castTimeMs ?? cast.endMs - pending.startMs;
  cast.channelTimeMs = pending.channelTimeMs;
}

export const rotationTimelineProcessor: PanelProcessor<RotationTimelineResult, RotationTimelineEvent> = {
  id: "rotation_timeline",
  streams: ["spell_go", "spell_start", "spell_fail", "cast", "damage", "aura", "slain"] as StreamType[],

  createState: (): RotationTimelineResult => ({
    encounterId: null,
    firstTimestampMs: null,
    multipleEncounters: false,
    lastOffsetMs: 0,
    players: new Map(),
    damageByPlayer: new Map(),
    _scratch: new Map(),
    _openAuras: new Map(),
  }),

  processEvent(state, event, encounterID, firstTimestamp, _streamType, context): void {
    if (!encounterID || !context.selectedEncounterIds.has(encounterID)) return;
    if (context.selectedEncounterIds.size !== 1) {
      state.multipleEncounters = true;
      return;
    }
    state.encounterId = encounterID;
    state.firstTimestampMs = firstTimestamp.getTime();
    if (event.offsetMilli > state.lastOffsetMs) state.lastOffsetMs = event.offsetMilli;

    const focus = focusFromContext(context);
    const player = (guid: string): PlayerTimelineData => {
      let p = state.players.get(guid);
      if (!p) {
        p = emptyPlayer(guid);
        state.players.set(guid, p);
      }
      return p;
    };
    const scratch = (guid: string): PlayerScratch => {
      let s = state._scratch.get(guid);
      if (!s) {
        s = { pendingGo: null, pendingText: null, lastGoBySpell: new Map(), lastTextBySpell: new Map() };
        state._scratch.set(guid, s);
      }
      return s;
    };

    switch (event.type) {
      case "damage": {
        if (!event.caster) return;
        const owner = ownerOf(event.caster, context);
        if (!context.players[owner]) return;
        const amount = event.amount + event.tailers.reduce((sum, t) => sum + t.amount, 0);
        state.damageByPlayer.set(owner, (state.damageByPlayer.get(owner) ?? 0) + amount);
        if (!focus.has(owner)) return;

        const p = player(owner);
        p.totalDamage += amount;
        const bin = Math.floor(event.offsetMilli / DAMAGE_BIN_MS);
        while (p.damageBins.length <= bin) p.damageBins.push(0);
        p.damageBins[bin] += amount;
        if (event.target) p.damageByTarget[event.target] = (p.damageByTarget[event.target] ?? 0) + amount;

        if (owner !== event.caster) return; // pet damage: bins only
        if (event.spellId === AUTO_ATTACK_SPELL_ID) {
          p.swings.push({
            offsetMs: event.offsetMilli,
            offHand: hasHitType(event.hitType, HitTypeOffHand),
            hitType: event.hitType,
            amount,
            tailerAmount: amount - event.amount,
            target: event.target,
          });
          return;
        }
        if (event.spellId == null) return;

        const periodic = hasHitType(event.hitType, HitTypePeriodic);
        const s = scratch(owner);
        const link = (casts: TimelineCast[], lastBySpell: Map<number, number>) => {
          const idx = lastBySpell.get(event.spellId as number);
          if (idx == null) return;
          const cast = casts[idx];
          if (periodic) {
            cast.periodicDamage += amount;
            return;
          }
          if (event.offsetMilli - cast.endMs > DAMAGE_LINK_WINDOW_MS) return;
          cast.damage += amount;
          cast.hits += 1;
          if (hasHitType(event.hitType, HitTypeCrit)) cast.crits += 1;
        };
        link(p.goCasts, s.lastGoBySpell);
        link(p.textCasts, s.lastTextBySpell);
        return;
      }

      case "spell_start": {
        if (!focus.has(event.caster)) return;
        scratch(event.caster).pendingGo = {
          startMs: event.offsetMilli,
          spellId: event.spell.id,
          castTimeMs: event.castTimeMilli > 0 ? event.castTimeMilli : null,
          channelTimeMs: event.channelTimeMilli > 0 ? event.channelTimeMilli : null,
        };
        return;
      }

      case "spell_go": {
        if (!focus.has(event.caster)) return;
        const p = player(event.caster);
        const s = scratch(event.caster);
        const cast = newCast(event.offsetMilli, event.offsetMilli, event.spell.id, event.spell.name, event.target);
        cast.itemId = event.itemId;
        completeCast(cast, s.pendingGo);
        s.pendingGo = null;
        s.lastGoBySpell.set(cast.spellId, p.goCasts.length);
        p.goCasts.push(cast);
        return;
      }

      case "spell_fail": {
        if (!focus.has(event.caster)) return;
        const s = scratch(event.caster);
        const pending = s.pendingGo;
        if (!pending || pending.spellId !== event.spell.id) return;
        const cast = newCast(pending.startMs, event.offsetMilli, event.spell.id, event.spell.name, "");
        cast.castTimeMs = pending.castTimeMs;
        cast.failed = true;
        player(event.caster).goCasts.push(cast);
        s.pendingGo = null;
        return;
      }

      case "cast": {
        if (!focus.has(event.caster)) return;
        const p = player(event.caster);
        const s = scratch(event.caster);
        const spellId = event.spell.id;
        if (event.action === CastAction.BeginsToCast) {
          s.pendingText = { startMs: event.offsetMilli, spellId, castTimeMs: null, channelTimeMs: null };
          return;
        }
        if (event.action === CastAction.FailsCasting) {
          const pending = s.pendingText;
          if (pending && pending.spellId === spellId) {
            const cast = newCast(pending.startMs, event.offsetMilli, spellId, event.spell.name, "");
            cast.failed = true;
            p.textCasts.push(cast);
          }
          s.pendingText = null;
          return;
        }
        if (event.action !== CastAction.Casts && event.action !== CastAction.Channels) return;
        const cast = newCast(event.offsetMilli, event.offsetMilli, spellId, event.spell.name, event.target);
        completeCast(cast, s.pendingText);
        s.pendingText = null;
        s.lastTextBySpell.set(spellId, p.textCasts.length);
        p.textCasts.push(cast);
        return;
      }

      case "aura": {
        const open = state._openAuras.get(event.target) ?? [];
        if (event.amount <= 0 || event.state === AuraState.Removed) {
          if (open.length > 0) {
            state._openAuras.set(
              event.target,
              closeAuraSegments(open, event.spellId, event.spellName, event.caster, event.offsetMilli),
            );
          }
          return;
        }

        const onFocus = focus.has(event.target);
        const byFocus = !event.isBuff && event.caster != null && focus.has(event.caster);
        if (!onFocus && !byFocus) return;

        // A gain of an aura that is already up is a refresh or stack change.
        // Buffs merge across casters; debuffs stay per caster (A and B each).
        const existing = open.find(
          (seg) => sameAura(seg, event.spellId, event.spellName) && (seg.isBuff || seg.caster === event.caster),
        );
        if (existing) {
          existing.maxStacks = Math.max(existing.maxStacks, event.amount);
          return;
        }
        const seg: TimelineAuraSegment = {
          spellId: event.spellId,
          spellName: event.spellName,
          isBuff: event.isBuff,
          caster: event.caster,
          target: event.target,
          startMs: event.offsetMilli,
          endMs: null,
          maxStacks: Math.max(1, event.amount),
        };
        open.push(seg);
        state._openAuras.set(event.target, open);
        if (onFocus) player(event.target).aurasOn.push(seg);
        if (byFocus) player(event.caster as string).debuffsCast.push(seg);
        return;
      }

      case "slain": {
        const open = state._openAuras.get(event.target);
        if (!open) return;
        for (const seg of open) seg.endMs = event.offsetMilli;
        state._openAuras.delete(event.target);
        return;
      }
    }
  },
};
