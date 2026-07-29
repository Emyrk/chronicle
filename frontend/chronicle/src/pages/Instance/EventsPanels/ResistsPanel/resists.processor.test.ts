import { describe, expect, it } from 'vitest';
import { resistsProcessor } from './resists.processor';
import type { DamageProcessorEvent, ProcessorContext } from '../processorTypes';
import { HitTypeHit, HitTypePartialResist, HitTypeFullResist, HitTypeCrit } from '@/lib/hittype/hittype';
import { AttackOutcomeResist, AttackOutcomeHit, AttackOutcomeCrit } from '@/lib/spellOutcome';

function createContext(overrides: Partial<ProcessorContext> = {}): ProcessorContext {
  return {
    players: {
      '0x0000000000099515': { name: 'TestPlayer', class: 'WARRIOR' },
    },
    units: {
      '0xF13000F1FF276A34': { name: 'Boss', owner: null, entry: 12345 },
    },
    selectedEncounterIds: new Set(['enc1']),
    entitySelection: {
      enemyIds: new Set(),
      playerIds: new Set(),
    },
    ...overrides,
  };
}

function createDamageEvent(overrides: Partial<DamageProcessorEvent> = {}): DamageProcessorEvent {
  return {
    type: 'damage',
    index: 0,
    offsetMilli: 0,
    caster: '0xF13000F1FF276A34',
    sourceName: 'Frostbolt',
    target: '0x0000000000099515',
    hitType: HitTypeHit,
    amount: 1000,
    school: 6, // Frost
    tailers: [],
    tailerCount: 0,
    activity: [],
    activityCount: 0,
    isSynthetic: false,
    spellId: 51099,
    spellAttackOutcome: AttackOutcomeHit | AttackOutcomeCrit | AttackOutcomeResist,
    overkill: 0,
    ...overrides,
  };
}

describe('resistsProcessor', () => {
  const processor = resistsProcessor;

  it('skips events without AttackOutcomeResist', () => {
    const state = processor.createState();
    const ctx = createContext();

    // spellAttackOutcome without Resist flag — should be ignored
    processor.processEvent(
      state,
      createDamageEvent({ spellAttackOutcome: AttackOutcomeHit | AttackOutcomeCrit }),
      'enc1', new Date(), 'damage', ctx,
    );

    expect(state.EncounterResists.size).toBe(0);
  });

  it('skips events with null spellAttackOutcome (melee)', () => {
    const state = processor.createState();
    const ctx = createContext();

    processor.processEvent(
      state,
      createDamageEvent({ spellAttackOutcome: null }),
      'enc1', new Date(), 'damage', ctx,
    );

    expect(state.EncounterResists.size).toBe(0);
  });

  it('skips events where target is not a player or pet', () => {
    const state = processor.createState();
    const ctx = createContext();

    // Target is a creature, not a player
    processor.processEvent(
      state,
      createDamageEvent({ target: '0xF13000F1FF276A34' }),
      'enc1', new Date(), 'damage', ctx,
    );

    expect(state.EncounterResists.size).toBe(0);
  });

  // Real combat log line:
  // 1778212906931|SPELL_DMG|0x0000000000099515|0xF13000F1FF276A34|51099|1083|0,0,1082|0|6|2,0,0,0
  //
  // Caster: 0x0000000000099515 (player)
  // Target: 0xF13000F1FF276A34 (creature) — but for resists we track damage to players,
  //         so we flip caster/target to match the processor's perspective (boss hitting player).
  // Amount: 1083 (damage dealt after resist)
  // Tailers: blocked=0, absorbed=0, resisted=1082
  // School: 6 (Frost)
  // HitType: HitTypeHit | HitTypePartialResist
  //
  // Resist fraction: 1082 / (1083 + 1082) = 1082 / 2165 ≈ 0.4998 → 50% bucket
  it('classifies 1083 damage with 1082 resisted as 50% resist bucket', () => {
    const state = processor.createState();
    const ctx = createContext();

    processor.processEvent(
      state,
      createDamageEvent({
        caster: '0xF13000F1FF276A34',   // Boss hitting player
        target: '0x0000000000099515',    // Player receiving damage
        sourceName: 'Frostbolt',
        hitType: HitTypeHit, // Hit is still a hit — resist is on the tailer
        amount: 1083,
        school: 6, // Arcane
        spellId: 51099,
        spellAttackOutcome: AttackOutcomeHit | AttackOutcomeCrit | AttackOutcomeResist,
        tailers: [{ amount: 1082, hitType: HitTypePartialResist }],
        tailerCount: 1,
        overkill: 0,
      }),
      'enc1', new Date(), 'damage', ctx,
    );

    // Check encounter-level data
    const encMap = state.EncounterResists.get('enc1');
    expect(encMap).toBeDefined();
    expect(encMap!.size).toBe(1);

    const player = encMap!.get('0x0000000000099515')!;
    expect(player).toBeDefined();
    expect(player.totalIncoming).toBe(1083 + 1082); // 2165
    expect(player.totalResisted).toBe(1082);
    expect(player.partialResistCount).toBe(1);
    expect(player.fullResistCount).toBe(0);
    expect(player.count).toBe(1); // Every resistable event increments count

    // Check ability breakout
    const abilities = state.ByAbility.get('0x0000000000099515');
    expect(abilities).toBeDefined();

    const frostbolt = abilities!.get('Frostbolt')!;
    expect(frostbolt).toBeDefined();
    expect(frostbolt.totalIncoming).toBe(2165);
    expect(frostbolt.totalResisted).toBe(1082);
    expect(frostbolt.school).toBe(6);
    expect(frostbolt.partialResistCount).toBe(1);

    // 1082 / 2165 ≈ 0.4998 → 50% bucket
    expect(frostbolt.resist25).toBe(0);
    expect(frostbolt.resist50).toBe(1);
    expect(frostbolt.resist75).toBe(0);
    expect(frostbolt.resist100).toBe(0);
  });

  it('classifies full resist into 100% bucket', () => {
    const state = processor.createState();
    const ctx = createContext();

    processor.processEvent(
      state,
      createDamageEvent({
        caster: '0xF13000F1FF276A34',
        target: '0x0000000000099515',
        hitType: HitTypeFullResist,
        amount: 0, // Full resist = 0 damage
        tailers: [],
        tailerCount: 0,
      }),
      'enc1', new Date(), 'damage', ctx,
    );

    const player = state.EncounterResists.get('enc1')!.get('0x0000000000099515')!;
    expect(player.fullResistCount).toBe(1);
    expect(player.count).toBe(1); // Full resist still counts as an event
    expect(player.totalIncoming).toBe(0); // Full resist has no incoming amount

    const abilities = state.ByAbility.get('0x0000000000099515')!;
    const frostbolt = abilities.get('Frostbolt')!;
    expect(frostbolt.resist100).toBe(1);
    expect(frostbolt.resist25).toBe(0);
    expect(frostbolt.resist50).toBe(0);
    expect(frostbolt.resist75).toBe(0);
  });

  it('classifies ~25% resist into 25% bucket', () => {
    const state = processor.createState();
    const ctx = createContext();

    // 750 damage, 250 resisted → 250/1000 = 25%
    processor.processEvent(
      state,
      createDamageEvent({
        caster: '0xF13000F1FF276A34',
        target: '0x0000000000099515',
        hitType: HitTypeHit,
        amount: 750,
        tailers: [{ amount: 250, hitType: HitTypePartialResist }],
        tailerCount: 1,
      }),
      'enc1', new Date(), 'damage', ctx,
    );

    const frostbolt = state.ByAbility.get('0x0000000000099515')!.get('Frostbolt')!;
    expect(frostbolt.resist25).toBe(1);
    expect(frostbolt.resist50).toBe(0);
    expect(frostbolt.resist75).toBe(0);
  });

  it('classifies ~75% resist into 75% bucket', () => {
    const state = processor.createState();
    const ctx = createContext();

    // 250 damage, 750 resisted → 750/1000 = 75%
    processor.processEvent(
      state,
      createDamageEvent({
        caster: '0xF13000F1FF276A34',
        target: '0x0000000000099515',
        hitType: HitTypeHit,
        amount: 250,
        tailers: [{ amount: 750, hitType: HitTypePartialResist }],
        tailerCount: 1,
      }),
      'enc1', new Date(), 'damage', ctx,
    );

    const frostbolt = state.ByAbility.get('0x0000000000099515')!.get('Frostbolt')!;
    expect(frostbolt.resist25).toBe(0);
    expect(frostbolt.resist50).toBe(0);
    expect(frostbolt.resist75).toBe(1);
  });

  it('counts clean hit (no resist) correctly', () => {
    const state = processor.createState();
    const ctx = createContext();

    processor.processEvent(
      state,
      createDamageEvent({
        caster: '0xF13000F1FF276A34',
        target: '0x0000000000099515',
        hitType: HitTypeHit | HitTypeCrit,
        amount: 2000,
        tailers: [],
        tailerCount: 0,
      }),
      'enc1', new Date(), 'damage', ctx,
    );

    const player = state.EncounterResists.get('enc1')!.get('0x0000000000099515')!;
    expect(player.count).toBe(1);
    expect(player.partialResistCount).toBe(0);
    expect(player.fullResistCount).toBe(0);
    expect(player.totalIncoming).toBe(2000);
    expect(player.totalResisted).toBe(0);
  });
});
