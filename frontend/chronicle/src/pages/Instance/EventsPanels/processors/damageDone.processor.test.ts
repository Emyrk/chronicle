import { describe, it, expect } from 'vitest';
import { createDamageDoneProcessor } from '../DamageDone/damageDone.processor';
import { resolveSelectedVulnerability } from '../VulnerabilityEffect/vulnerabilityConfig';
import type { VulnerabilitySpell } from '../VulnerabilityEffect/vulnerabilityDerive';
import { AuraApplication, AuraState, type AuraProcessorEvent, type DamageProcessorEvent, type ProcessorContext, type SlainProcessorEvent } from '../processorTypes';
import { HitTypeFullAbsorb, HitTypeHit, HitTypePartialAbsorb } from '@/lib/hittype/hittype';

// Vulnerability effects are derived per-dataset from the spell lookup at runtime;
// tests use a fixed config map that mirrors the Turtle-derived values, and inject
// the resolved config into panelContext exactly like VulnerabilityEffectContent does.
const TEST_VULN_CONFIG: Record<number, VulnerabilitySpell> = {
  23605: { name: 'Spell Vulnerability', schoolBitmask: 126, percentAffect: 10, flatAffect: null },
  11374: { name: 'Gift of Arthas', schoolBitmask: 1, percentAffect: null, flatAffect: 8 },
  1490: { name: 'Curse of the Elements', schoolBitmask: 20, percentAffect: 6, flatAffect: null },
  11721: { name: 'Curse of the Elements', schoolBitmask: 20, percentAffect: 8, flatAffect: null },
  11722: { name: 'Curse of the Elements', schoolBitmask: 20, percentAffect: 10, flatAffect: null },
  17862: { name: 'Curse of Shadow', schoolBitmask: 96, percentAffect: 8, flatAffect: null },
  17937: { name: 'Curse of Shadow', schoolBitmask: 96, percentAffect: 10, flatAffect: null },
};

// Stand-in for the compiled-in constant the tests used to read directly.
const VulnerabilitySpells = TEST_VULN_CONFIG;

describe('damageDoneProcessor', () => {
  const processor = createDamageDoneProcessor('players');

  function createContext(overrides: Partial<ProcessorContext> = {}): ProcessorContext {
    return {
      players: {
        '0x0000000000001234': { name: 'TestPlayer', class: 'WARRIOR' },
        '0x0000000000005678': { name: 'TestHealer', class: 'PRIEST' },
      },
      units: {
        '0xF130000CE0000001': { name: 'Boss', owner: null, entry: 12345 },
        '0xF140000CE0000002': { name: 'Player Pet', owner: '0x0000000000001234', entry: 99 },
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
      caster: '0x0000000000001234', // player by default
      sourceName: 'Mortal Strike',
      target: '0xF130000CE0000001', // enemy by default
      hitType: 0,
      amount: 1000,
      school: 1, // physical
      tailers: [],
      tailerCount: 0,
      activity: [],
      activityCount: 0,
      isSynthetic: false,
      spellId: null,
      spellAttackOutcome: null,
      overkill: 0,
      ...overrides,
    };
  }

  function createAuraEvent(overrides: Partial<AuraProcessorEvent> = {}): AuraProcessorEvent {
    return {
      type: 'aura',
      index: 0,
      offsetMilli: 0,
      target: '0xF130000CE0000001',
      spellName: 'Sunder Armor',
      spellId: 7386,
      spellAttackOutcome: null,
      amount: 1,
      application: AuraApplication.Gains,
      state: AuraState.Added,
      activity: [],
      activityCount: 0,
      isSynthetic: false,
      ...overrides,
    };
  }

  function createSlainEvent(overrides: Partial<SlainProcessorEvent> = {}): SlainProcessorEvent {
    return {
      type: 'slain',
      index: 0,
      offsetMilli: 0,
      target: '0xF130000CE0000001',
      caster: '0x0000000000001234',
      attribution: null,
      activity: [],
      activityCount: 0,
      isSynthetic: false,
      ...overrides,
    };
  }

  it('creates initial empty state', () => {
    const state = processor.createState();
    expect(state.EncounterDamage.size).toBe(0);
    expect(state.ByAbility.size).toBe(0);
    expect(state.ByTarget.size).toBe(0);
  });

  it('aggregates player damage by encounter', () => {
    const state = processor.createState();
    const context = createContext();
    const event = createDamageEvent();

    processor.processEvent(state, event, 'enc1', new Date(), 'damage', context);

    expect(state.EncounterDamage.has('enc1')).toBe(true);
    const encDamage = state.EncounterDamage.get('enc1')!;
    expect(encDamage.has('0x0000000000001234')).toBe(true);

    const playerData = encDamage.get('0x0000000000001234')!;
    expect(playerData.playerName).toBe('TestPlayer');
    expect(playerData.className).toBe('WARRIOR');
    expect(playerData.target.get('0xF130000CE0000001')).toBe(1000);
  });

  it('includes partially absorbed damage in totals and hit statistics', () => {
    const state = processor.createState();
    const context = createContext();

    processor.processEvent(state, createDamageEvent({
      amount: 800,
      hitType: HitTypeHit,
      tailers: [{ amount: 200, hitType: HitTypePartialAbsorb }],
      tailerCount: 1,
    }), 'enc1', new Date(), 'damage', context);

    const playerData = state.EncounterDamage.get('enc1')!.get('0x0000000000001234')!;
    expect(playerData.target.get('0xF130000CE0000001')).toBe(1000);

    const ability = state.ByAbility.get('0x0000000000001234')!.get('Mortal Strike')!;
    expect(ability.Total).toBe(1000);
    expect(ability.Absorbed).toBe(200);
    expect(ability.HitStats).toEqual({ count: 1, total: 1000, min: 1000, max: 1000 });
  });

  it('counts fully absorbed damage as effective damage and an absorb outcome', () => {
    const state = processor.createState();
    const context = createContext();

    processor.processEvent(state, createDamageEvent({
      amount: 0,
      hitType: HitTypeFullAbsorb,
      tailers: [{ amount: 500, hitType: HitTypeFullAbsorb }],
      tailerCount: 1,
    }), 'enc1', new Date(), 'damage', context);

    const playerData = state.EncounterDamage.get('enc1')!.get('0x0000000000001234')!;
    expect(playerData.target.get('0xF130000CE0000001')).toBe(500);

    const ability = state.ByAbility.get('0x0000000000001234')!.get('Mortal Strike')!;
    expect(ability.Total).toBe(500);
    expect(ability.Absorbed).toBe(500);
    expect(ability.Absorbs).toBe(1);
    expect(ability.Hits).toBe(0);
    expect(ability.AbsorbStats).toEqual({ count: 1, total: 500, min: 500, max: 500 });
  });

  it('accumulates multiple damage events', () => {
    const state = processor.createState();
    const context = createContext();

    // Two damage events from same player
    processor.processEvent(state, createDamageEvent({ amount: 500 }), 'enc1', new Date(), 'damage', context);
    processor.processEvent(state, createDamageEvent({ amount: 300 }), 'enc1', new Date(), 'damage', context);

    const encDamage = state.EncounterDamage.get('enc1')!;
    const playerData = encDamage.get('0x0000000000001234')!;
    expect(playerData.target.get('0xF130000CE0000001')).toBe(800);
  });

  it('tracks damage by ability for selected encounters', () => {
    const state = processor.createState();
    const context = createContext();
    const event = createDamageEvent({ sourceName: 'Heroic Strike' });

    processor.processEvent(state, event, 'enc1', new Date(), 'damage', context);

    expect(state.ByAbility.has('0x0000000000001234')).toBe(true);
    const abilityBreakout = state.ByAbility.get('0x0000000000001234')!;
    expect(abilityBreakout.has('Heroic Strike')).toBe(true);
    expect(abilityBreakout.get('Heroic Strike')!.Total).toBe(1000);
  });

  it('records damage regardless of source type (filtering done by fixedFilters)', () => {
    const state = processor.createState();
    const context = createContext();
    // Enemy attacking player - processor records it, fixedFilters handles exclusion
    const event = createDamageEvent({
      caster: '0xF130000CE0000001', // enemy
      target: '0x0000000000001234', // player
    });

    processor.processEvent(state, event, 'enc1', new Date(), 'damage', context);

    // Processor records all damage; source type filtering is done by fixedFilters in DamageDone.tsx
    expect(state.EncounterDamage.get('enc1')?.size).toBe(1);
    expect(state.EncounterDamage.get('enc1')?.has('0xF130000CE0000001')).toBe(true);
  });

  it('attributes pet damage to owner', () => {
    const state = processor.createState();
    const context = createContext();
    // Pet attacking enemy
    const event = createDamageEvent({
      caster: '0xF140000CE0000002', // pet owned by player
      sourceName: 'Bite',
      target: '0xF130000CE0000001',
    });

    processor.processEvent(state, event, 'enc1', new Date(), 'damage', context);

    // Pet damage should be attributed to owner
    const encDamage = state.EncounterDamage.get('enc1')!;
    expect(encDamage.has('0x0000000000001234')).toBe(true); // owner's GUID
  });

  it('ignores events with no caster', () => {
    const state = processor.createState();
    const context = createContext();
    const event = createDamageEvent({ caster: '' });

    processor.processEvent(state, event, 'enc1', new Date(), 'damage', context);

    expect(state.EncounterDamage.size).toBe(0);
  });
  it('skips aura tracking when no vulnerability is selected', () => {
    const state = processor.createState();
    const context = createContext();

    processor.processEvent(state, createAuraEvent(), 'enc1', new Date(), 'aura', context);
    processor.processEvent(state, createDamageEvent({ amount: 777 }), 'enc1', new Date(), 'damage', context);

    const encDamage = state.EncounterDamage.get('enc1')!;
    const playerData = encDamage.get('0x0000000000001234')!;
    expect(playerData.target.get('0xF130000CE0000001')).toBe(777);
    expect(state._damageEventsWithSunderArmor).toBe(0);
    expect(state.AuraState.activeByEncounter.size).toBe(0);
  });

  it('clears tracked target auras on slain events', () => {
    const state = processor.createState();
    const context = createContext();

    processor.processEvent(state, createAuraEvent(), 'enc1', new Date(), 'aura', context);
    processor.processEvent(state, createSlainEvent(), 'enc1', new Date(), 'slain', context);
    processor.processEvent(state, createDamageEvent({ amount: 300 }), 'enc1', new Date(), 'damage', context);

    expect(state._damageEventsWithSunderArmor).toBe(0);
  });

});

describe('vulnerabilityEffectProcessor', () => {
  const processor = createDamageDoneProcessor('players', {
    id: 'vulnerability_effect',
    vulnerabilityMode: true,
  });

  const spellVulnerabilityId = 23605;
  const giftOfArthasId = 11374;
  const curseOfElementsRank1Id = 1490;
  const curseOfElementsRank3Id = 11722;
  const curseOfShadowRank1Id = 17862;
  const curseOfShadowRank2Id = 17937;

  function createContext(overrides: Partial<ProcessorContext> = {}): ProcessorContext {
    // The panel selects a vulnerability by spell id; the worker consumes the
    // resolved config injected via panelContext.selectedVulnerability. Translate
    // the (default or overridden) panelOption into that injected config here.
    const panelOption = overrides.panelOption !== undefined
      ? overrides.panelOption
      : spellVulnerabilityId.toString();
    const selectedSpellId = panelOption == null ? null : Number.parseInt(panelOption, 10);
    const selectedVulnerability = resolveSelectedVulnerability(
      selectedSpellId != null && Number.isFinite(selectedSpellId) ? selectedSpellId : null,
      TEST_VULN_CONFIG,
    );
    const existingPanelContext = (overrides.panelContext as Record<string, unknown> | undefined) ?? {};

    return {
      players: {
        '0x0000000000001234': { name: 'TestPlayer', class: 'MAGE' },
      },
      units: {
        '0xF130000CE0000001': { name: 'Boss', owner: null, entry: 12345 },
      },
      selectedEncounterIds: new Set(['enc1']),
      entitySelection: {
        enemyIds: new Set(),
        playerIds: new Set(),
      },
      ...overrides,
      panelOption,
      panelContext: {
        // Default-derived config first; an explicit panelContext (e.g. schoolMask,
        // or a bespoke selectedVulnerability) provided by the caller wins.
        ...(selectedVulnerability ? { selectedVulnerability } : {}),
        ...existingPanelContext,
      },
    };
  }

  function createDamageEvent(overrides: Partial<DamageProcessorEvent> = {}): DamageProcessorEvent {
    return {
      type: 'damage',
      index: 0,
      offsetMilli: 0,
      caster: '0x0000000000001234',
      sourceName: 'Fireball',
      target: '0xF130000CE0000001',
      hitType: 0,
      amount: 1100,
      school: 4,
      tailers: [],
      tailerCount: 0,
      activity: [],
      activityCount: 0,
      isSynthetic: false,
      spellId: 133,
      spellAttackOutcome: null,
      overkill: 0,
      ...overrides,
    };
  }

  function createSpellVulnerabilityAuraEvent(overrides: Partial<AuraProcessorEvent> = {}): AuraProcessorEvent {
    return {
      type: 'aura',
      index: 0,
      offsetMilli: 0,
      target: '0xF130000CE0000001',
      spellName: 'Spell Vulnerability',
      spellId: spellVulnerabilityId,
      spellAttackOutcome: null,
      amount: 1,
      application: AuraApplication.Gains,
      state: AuraState.Added,
      activity: [],
      activityCount: 0,
      isSynthetic: false,
      ...overrides,
    };
  }


  function createVulnerabilityAuraEvent(spellId: number, overrides: Partial<AuraProcessorEvent> = {}): AuraProcessorEvent {
    return createSpellVulnerabilityAuraEvent({
      spellId,
      spellName: VulnerabilitySpells[spellId]?.name ?? "Vulnerability",
      ...overrides,
    });
  }
  it('uses VulnerabilitySpells percentAffect for base/bonus split', () => {
    const state = processor.createState();
    const context = createContext();

    processor.processEvent(state, createSpellVulnerabilityAuraEvent(), 'enc1', new Date(), 'aura', context);
    processor.processEvent(state, createDamageEvent({ amount: 1100, school: 4 }), 'enc1', new Date(), 'damage', context);

    const percentAffect = VulnerabilitySpells[spellVulnerabilityId].percentAffect!;
    const expectedBase = 1100 / (1 + percentAffect / 100);
    const expectedBonus = 1100 - expectedBase;

    const bonus = state.EncounterVulnerabilityBonus.get('enc1')?.get('0x0000000000001234')?.get('0xF130000CE0000001') ?? 0;
    const base = state.EncounterVulnerabilityBase.get('enc1')?.get('0x0000000000001234')?.get('0xF130000CE0000001') ?? 0;

    expect(base).toBeCloseTo(expectedBase);
    expect(bonus).toBeCloseTo(expectedBonus);
  });

  it('uses rank 1 Curse of Elements modifier when rank 1 aura is active', () => {
    const state = processor.createState();
    const context = createContext({ panelOption: curseOfElementsRank3Id.toString() });

    processor.processEvent(state, createVulnerabilityAuraEvent(curseOfElementsRank1Id), 'enc1', new Date(), 'aura', context);
    // Fire school in chronicleproto.School enum = 4.
    processor.processEvent(state, createDamageEvent({ amount: 1060, school: 4 }), 'enc1', new Date(), 'damage', context);

    const percentAffect = VulnerabilitySpells[curseOfElementsRank1Id].percentAffect!;
    const expectedBase = 1060 / (1 + percentAffect / 100);
    const expectedBonus = 1060 - expectedBase;

    const bonus = state.EncounterVulnerabilityBonus.get('enc1')?.get('0x0000000000001234')?.get('0xF130000CE0000001') ?? 0;
    const base = state.EncounterVulnerabilityBase.get('enc1')?.get('0x0000000000001234')?.get('0xF130000CE0000001') ?? 0;

    expect(base).toBeCloseTo(expectedBase);
    expect(bonus).toBeCloseTo(expectedBonus);
  });

  it('uses rank 3 Curse of Elements modifier when rank 3 aura is active', () => {
    const state = processor.createState();
    const context = createContext({ panelOption: curseOfElementsRank3Id.toString() });

    processor.processEvent(state, createVulnerabilityAuraEvent(curseOfElementsRank3Id), 'enc1', new Date(), 'aura', context);
    processor.processEvent(state, createDamageEvent({ amount: 1100, school: 4 }), 'enc1', new Date(), 'damage', context);

    const percentAffect = VulnerabilitySpells[curseOfElementsRank3Id].percentAffect!;
    const expectedBase = 1100 / (1 + percentAffect / 100);
    const expectedBonus = 1100 - expectedBase;

    const bonus = state.EncounterVulnerabilityBonus.get('enc1')?.get('0x0000000000001234')?.get('0xF130000CE0000001') ?? 0;
    const base = state.EncounterVulnerabilityBase.get('enc1')?.get('0x0000000000001234')?.get('0xF130000CE0000001') ?? 0;

    expect(base).toBeCloseTo(expectedBase);
    expect(bonus).toBeCloseTo(expectedBonus);
  });

  it('does not apply Curse of the Elements bonus to Arcane damage (Fire+Frost only)', () => {
    // Regression: Turtle CoE (schoolBitmask 20 = Fire+Frost) must not amplify
    // Arcane Missiles. Arcane damage arrives as chronicleproto.School enum 8.
    const state = processor.createState();
    const context = createContext({ panelOption: curseOfElementsRank3Id.toString() });

    processor.processEvent(state, createVulnerabilityAuraEvent(curseOfElementsRank3Id), 'enc1', new Date(), 'aura', context);
    processor.processEvent(state, createDamageEvent({ amount: 1000, school: 8, sourceName: 'Arcane Missiles' }), 'enc1', new Date(), 'damage', context);

    const bonus = state.EncounterVulnerabilityBonus.get('enc1')?.get('0x0000000000001234')?.get('0xF130000CE0000001') ?? 0;
    const base = state.EncounterVulnerabilityBase.get('enc1')?.get('0x0000000000001234')?.get('0xF130000CE0000001') ?? 0;

    expect(bonus).toBe(0);
    expect(base).toBe(1000);
  });

  it('applies Curse of the Elements bonus to Arcane damage when the effect covers all magic (WotLK)', () => {
    // On WotLK/AzerothCore, CoE amplifies all magic schools (schoolBitmask 126).
    // Same processor, different derived config → Arcane now gets the bonus.
    const state = processor.createState();
    const wotlkConfig: Record<number, VulnerabilitySpell> = {
      11722: { name: 'Curse of the Elements', schoolBitmask: 126, percentAffect: 10, flatAffect: null },
    };
    const selectedVulnerability = resolveSelectedVulnerability(curseOfElementsRank3Id, wotlkConfig);
    const context = createContext({ panelContext: { selectedVulnerability } });

    processor.processEvent(state, createVulnerabilityAuraEvent(curseOfElementsRank3Id), 'enc1', new Date(), 'aura', context);
    processor.processEvent(state, createDamageEvent({ amount: 1100, school: 8, sourceName: 'Arcane Missiles' }), 'enc1', new Date(), 'damage', context);

    const expectedBase = 1100 / (1 + 10 / 100);
    const bonus = state.EncounterVulnerabilityBonus.get('enc1')?.get('0x0000000000001234')?.get('0xF130000CE0000001') ?? 0;
    const base = state.EncounterVulnerabilityBase.get('enc1')?.get('0x0000000000001234')?.get('0xF130000CE0000001') ?? 0;

    expect(base).toBeCloseTo(expectedBase);
    expect(bonus).toBeCloseTo(1100 - expectedBase);
  });

  it('uses rank 1 Curse of Shadow modifier when rank 1 aura is active', () => {
    const state = processor.createState();
    const context = createContext({ panelOption: curseOfShadowRank2Id.toString() });

    processor.processEvent(state, createVulnerabilityAuraEvent(curseOfShadowRank1Id), 'enc1', new Date(), 'aura', context);
    // Shadow school in chronicleproto.School enum = 7.
    processor.processEvent(state, createDamageEvent({ amount: 1080, school: 7 }), 'enc1', new Date(), 'damage', context);

    const percentAffect = VulnerabilitySpells[curseOfShadowRank1Id].percentAffect!;
    const expectedBase = 1080 / (1 + percentAffect / 100);
    const expectedBonus = 1080 - expectedBase;

    const bonus = state.EncounterVulnerabilityBonus.get('enc1')?.get('0x0000000000001234')?.get('0xF130000CE0000001') ?? 0;
    const base = state.EncounterVulnerabilityBase.get('enc1')?.get('0x0000000000001234')?.get('0xF130000CE0000001') ?? 0;

    expect(base).toBeCloseTo(expectedBase);
    expect(bonus).toBeCloseTo(expectedBonus);
  });

  it('uses rank 2 Curse of Shadow modifier when rank 2 aura is active', () => {
    const state = processor.createState();
    const context = createContext({ panelOption: curseOfShadowRank2Id.toString() });

    processor.processEvent(state, createVulnerabilityAuraEvent(curseOfShadowRank2Id), 'enc1', new Date(), 'aura', context);
    processor.processEvent(state, createDamageEvent({ amount: 1100, school: 7 }), 'enc1', new Date(), 'damage', context);

    const percentAffect = VulnerabilitySpells[curseOfShadowRank2Id].percentAffect!;
    const expectedBase = 1100 / (1 + percentAffect / 100);
    const expectedBonus = 1100 - expectedBase;

    const bonus = state.EncounterVulnerabilityBonus.get('enc1')?.get('0x0000000000001234')?.get('0xF130000CE0000001') ?? 0;
    const base = state.EncounterVulnerabilityBase.get('enc1')?.get('0x0000000000001234')?.get('0xF130000CE0000001') ?? 0;

    expect(base).toBeCloseTo(expectedBase);
    expect(bonus).toBeCloseTo(expectedBonus);
  });
  it('applies flat bonus for Gift of Arthas when aura is active and school matches', () => {
    const state = processor.createState();
    const context = createContext({ panelOption: giftOfArthasId.toString() });

    processor.processEvent(state, createVulnerabilityAuraEvent(giftOfArthasId), 'enc1', new Date(), 'aura', context);
    processor.processEvent(state, createDamageEvent({ amount: 1000, school: 2 }), 'enc1', new Date(), 'damage', context);

    const flatAffect = VulnerabilitySpells[giftOfArthasId].flatAffect!;
    const expectedBase = 1000 - flatAffect;
    const expectedBonus = flatAffect;

    const bonus = state.EncounterVulnerabilityBonus.get('enc1')?.get('0x0000000000001234')?.get('0xF130000CE0000001') ?? 0;
    const base = state.EncounterVulnerabilityBase.get('enc1')?.get('0x0000000000001234')?.get('0xF130000CE0000001') ?? 0;

    expect(base).toBeCloseTo(expectedBase);
    expect(bonus).toBeCloseTo(expectedBonus);
  });

  it('does not apply Gift of Arthas flat bonus when school does not match', () => {
    const state = processor.createState();
    const context = createContext({ panelOption: giftOfArthasId.toString() });

    processor.processEvent(state, createVulnerabilityAuraEvent(giftOfArthasId), 'enc1', new Date(), 'aura', context);
    processor.processEvent(state, createDamageEvent({ amount: 1000, school: 4 }), 'enc1', new Date(), 'damage', context);

    const bonus = state.EncounterVulnerabilityBonus.get('enc1')?.get('0x0000000000001234')?.get('0xF130000CE0000001') ?? 0;
    const base = state.EncounterVulnerabilityBase.get('enc1')?.get('0x0000000000001234')?.get('0xF130000CE0000001') ?? 0;

    expect(bonus).toBe(0);
    expect(base).toBe(1000);
  });

  it('does not apply Gift of Arthas flat bonus to DoT ticks', () => {
    const state = processor.createState();
    const context = createContext({ panelOption: giftOfArthasId.toString() });

    processor.processEvent(state, createVulnerabilityAuraEvent(giftOfArthasId), 'enc1', new Date(), 'aura', context);
    processor.processEvent(state, createDamageEvent({ amount: 100, school: 2, hitType: 0x00200000 }), 'enc1', new Date(), 'damage', context);

    const bonus = state.EncounterVulnerabilityBonus.get('enc1')?.get('0x0000000000001234')?.get('0xF130000CE0000001') ?? 0;
    const base = state.EncounterVulnerabilityBase.get('enc1')?.get('0x0000000000001234')?.get('0xF130000CE0000001') ?? 0;

    // Flat bonus should NOT apply to DoT ticks
    expect(bonus).toBe(0);
    expect(base).toBe(100);
  });

  it('does not track aura state or bonus when vulnerability is not selected', () => {
    const state = processor.createState();
    const context = createContext({ panelOption: null });

    processor.processEvent(state, createSpellVulnerabilityAuraEvent(), 'enc1', new Date(), 'aura', context);
    processor.processEvent(state, createDamageEvent({ amount: 900, school: 4 }), 'enc1', new Date(), 'damage', context);

    const bonus = state.EncounterVulnerabilityBonus.get('enc1')?.get('0x0000000000001234')?.get('0xF130000CE0000001') ?? 0;
    const base = state.EncounterVulnerabilityBase.get('enc1')?.get('0x0000000000001234')?.get('0xF130000CE0000001') ?? 0;

    expect(state.AuraState.activeByEncounter.size).toBe(0);
    expect(bonus).toBe(0);
    expect(base).toBe(900);
  });

  it('does not apply bonus for physical school', () => {
    const state = processor.createState();
    const context = createContext();

    processor.processEvent(state, createSpellVulnerabilityAuraEvent(), 'enc1', new Date(), 'aura', context);
    // Damage stream school is chronicleproto.School enum; Physical = 2.
    processor.processEvent(state, createDamageEvent({ amount: 1000, school: 2 }), 'enc1', new Date(), 'damage', context);

    const bonus = state.EncounterVulnerabilityBonus.get('enc1')?.get('0x0000000000001234')?.get('0xF130000CE0000001') ?? 0;
    const base = state.EncounterVulnerabilityBase.get('enc1')?.get('0x0000000000001234')?.get('0xF130000CE0000001') ?? 0;

    expect(bonus).toBe(0);
    expect(base).toBe(1000);
  });

  it('filters out unmatched schools when schoolMask panel context is enabled', () => {
    const state = processor.createState();
    const context = createContext({
      panelContext: {
        schoolMask: true,
      },
    });

    processor.processEvent(state, createSpellVulnerabilityAuraEvent(), 'enc1', new Date(), 'aura', context);
    // Physical school does not match Spell Vulnerability's school bitmask.
    processor.processEvent(state, createDamageEvent({ amount: 1000, school: 2 }), 'enc1', new Date(), 'damage', context);

    const bonus = state.EncounterVulnerabilityBonus.get('enc1')?.get('0x0000000000001234')?.get('0xF130000CE0000001') ?? 0;
    const base = state.EncounterVulnerabilityBase.get('enc1')?.get('0x0000000000001234')?.get('0xF130000CE0000001') ?? 0;

    expect(bonus).toBe(0);
    expect(base).toBe(0);
  });

  it('keeps matched schools when schoolMask panel context is enabled', () => {
    const state = processor.createState();
    const context = createContext({
      panelContext: {
        schoolMask: true,
      },
    });

    processor.processEvent(state, createSpellVulnerabilityAuraEvent(), 'enc1', new Date(), 'aura', context);
    // Fire school matches Spell Vulnerability's school bitmask.
    processor.processEvent(state, createDamageEvent({ amount: 1100, school: 4 }), 'enc1', new Date(), 'damage', context);

    const percentAffect = VulnerabilitySpells[spellVulnerabilityId].percentAffect!;
    const expectedBase = 1100 / (1 + percentAffect / 100);
    const expectedBonus = 1100 - expectedBase;

    const bonus = state.EncounterVulnerabilityBonus.get('enc1')?.get('0x0000000000001234')?.get('0xF130000CE0000001') ?? 0;
    const base = state.EncounterVulnerabilityBase.get('enc1')?.get('0x0000000000001234')?.get('0xF130000CE0000001') ?? 0;

    expect(base).toBeCloseTo(expectedBase);
    expect(bonus).toBeCloseTo(expectedBonus);
  });

  it('excludes DoT ticks from vulnerability totals when schoolMask is enabled for flat-only vulnerability', () => {
    const state = processor.createState();
    const context = createContext({
      panelOption: giftOfArthasId.toString(),
      panelContext: {
        schoolMask: true,
      },
    });

    processor.processEvent(state, createVulnerabilityAuraEvent(giftOfArthasId), 'enc1', new Date(), 'aura', context);
    // Physical DoT tick — school matches but flat bonus doesn't apply to DoTs
    processor.processEvent(state, createDamageEvent({ amount: 100, school: 2, hitType: 0x00200000 }), 'enc1', new Date(), 'damage', context);

    const bonus = state.EncounterVulnerabilityBonus.get('enc1')?.get('0x0000000000001234')?.get('0xF130000CE0000001') ?? 0;
    const base = state.EncounterVulnerabilityBase.get('enc1')?.get('0x0000000000001234')?.get('0xF130000CE0000001') ?? 0;

    // DoT ticks should be excluded entirely from vulnerability totals for flat-only vulns
    expect(bonus).toBe(0);
    expect(base).toBe(0);
  });

  it('does not apply bonus when aura is not active', () => {
    const state = processor.createState();
    const context = createContext();

    processor.processEvent(state, createDamageEvent({ amount: 1000, school: 4 }), 'enc1', new Date(), 'damage', context);

    const bonus = state.EncounterVulnerabilityBonus.get('enc1')?.get('0x0000000000001234')?.get('0xF130000CE0000001') ?? 0;
    const base = state.EncounterVulnerabilityBase.get('enc1')?.get('0x0000000000001234')?.get('0xF130000CE0000001') ?? 0;

    expect(bonus).toBe(0);
    expect(base).toBe(1000);
  });
});

describe('enemyDamageDoneProcessor', () => {
  const processor = createDamageDoneProcessor('enemies');

  function createContext(overrides: Partial<ProcessorContext> = {}): ProcessorContext {
    return {
      players: {
        '0x0000000000001234': { name: 'TestPlayer', class: 'WARRIOR' },
      },
      units: {
        '0xF130000CE0000001': { name: 'Boss', owner: null, entry: 12345 },
      },
      selectedEncounterIds: new Set(['enc1']),
      entitySelection: {
        enemyIds: new Set(),
        playerIds: new Set(),
      },
      ...overrides,
    };
  }

  it('tracks enemy damage to players', () => {
    const state = processor.createState();
    const context = createContext();
    const event: DamageProcessorEvent = {
      type: 'damage',
      index: 0,
      offsetMilli: 0,
      caster: '0xF130000CE0000001', // enemy
      sourceName: 'Cleave',
      target: '0x0000000000001234', // player
      hitType: 0,
      amount: 2000,
      school: 1,
      tailers: [],
      tailerCount: 0,
      activity: [],
      activityCount: 0,
      isSynthetic: false,
      spellId: null,
      spellAttackOutcome: null,
      overkill: 0,
    };

    processor.processEvent(state, event, 'enc1', new Date(), 'damage', context);

    const encDamage = state.EncounterDamage.get('enc1')!;
    expect(encDamage.has('0xF130000CE0000001')).toBe(true);

    const enemyData = encDamage.get('0xF130000CE0000001')!;
    expect(enemyData.playerName).toBe('Boss');
    expect(enemyData.className).toBe('ENEMY');
  });

  it('groups enemies by unit GUID by default', () => {
    const state = processor.createState();
    const context = createContext({
      units: {
        '0xF130000CE0000001': { name: 'Boss', owner: null, entry: 12345 },
        '0xF130000CE0000002': { name: 'Boss', owner: null, entry: 12345 },
      },
    });

    processor.processEvent(state, {
      type: 'damage',
      index: 0,
      offsetMilli: 0,
      caster: '0xF130000CE0000001',
      sourceName: 'Cleave',
      target: '0x0000000000001234',
      hitType: 0,
      amount: 1200,
      school: 1,
      tailers: [],
      tailerCount: 0,
      activity: [],
      activityCount: 0,
      isSynthetic: false,
      spellId: null,
      spellAttackOutcome: null,
      overkill: 0,
    }, 'enc1', new Date(), 'damage', context);

    processor.processEvent(state, {
      type: 'damage',
      index: 1,
      offsetMilli: 100,
      caster: '0xF130000CE0000002',
      sourceName: 'Cleave',
      target: '0x0000000000001234',
      hitType: 0,
      amount: 800,
      school: 1,
      tailers: [],
      tailerCount: 0,
      activity: [],
      activityCount: 0,
      isSynthetic: false,
      spellId: null,
      spellAttackOutcome: null,
      overkill: 0,
    }, 'enc1', new Date(), 'damage', context);

    const encDamage = state.EncounterDamage.get('enc1')!;
    expect(encDamage.size).toBe(2);
    expect(encDamage.get('0xF130000CE0000001')?.target.get('0x0000000000001234')).toBe(1200);
    expect(encDamage.get('0xF130000CE0000002')?.target.get('0x0000000000001234')).toBe(800);
  });

  it('groups enemies by name when enemyGrouping is name', () => {
    const state = processor.createState();
    const context = createContext({
      panelOption: 'g:name',
      units: {
        '0xF130000CE0000001': { name: 'Boss', owner: null, entry: 12345 },
        '0xF130000CE0000002': { name: 'Boss', owner: null, entry: 12345 },
      },
    });

    processor.processEvent(state, {
      type: 'damage',
      index: 0,
      offsetMilli: 0,
      caster: '0xF130000CE0000001',
      sourceName: 'Cleave',
      target: '0x0000000000001234',
      hitType: 0,
      amount: 1200,
      school: 1,
      tailers: [],
      tailerCount: 0,
      activity: [],
      activityCount: 0,
      isSynthetic: false,
      spellId: null,
      spellAttackOutcome: null,
      overkill: 0,
    }, 'enc1', new Date(), 'damage', context);

    processor.processEvent(state, {
      type: 'damage',
      index: 1,
      offsetMilli: 100,
      caster: '0xF130000CE0000002',
      sourceName: 'Cleave',
      target: '0x0000000000001234',
      hitType: 0,
      amount: 800,
      school: 1,
      tailers: [],
      tailerCount: 0,
      activity: [],
      activityCount: 0,
      isSynthetic: false,
      spellId: null,
      spellAttackOutcome: null,
      overkill: 0,
    }, 'enc1', new Date(), 'damage', context);

    const encDamage = state.EncounterDamage.get('enc1')!;
    expect(encDamage.size).toBe(1);

    const groupedEnemy = encDamage.get('enemy_name:boss');
    expect(groupedEnemy?.playerName).toBe('Boss');
    expect(groupedEnemy?.target.get('0x0000000000001234')).toBe(2000);
  });

  it('falls back to GUID grouping when enemy name is missing in name mode', () => {
    const state = processor.createState();
    const context = createContext({
      panelOption: 'g:name',
      units: {},
    });

    processor.processEvent(state, {
      type: 'damage',
      index: 0,
      offsetMilli: 0,
      caster: '0xF130000CE0000001',
      sourceName: 'Cleave',
      target: '0x0000000000001234',
      hitType: 0,
      amount: 700,
      school: 1,
      tailers: [],
      tailerCount: 0,
      activity: [],
      activityCount: 0,
      isSynthetic: false,
      spellId: null,
      spellAttackOutcome: null,
      overkill: 0,
    }, 'enc1', new Date(), 'damage', context);

    const encDamage = state.EncounterDamage.get('enc1')!;
    expect(encDamage.has('enemy_name:0xf130000ce0000001')).toBe(false);
    expect(encDamage.has('0xF130000CE0000001')).toBe(true);
  });

  it('records player damage (filtering done by fixedFilters)', () => {
    const state = processor.createState();
    const context = createContext();
    const event: DamageProcessorEvent = {
      type: 'damage',
      index: 0,
      offsetMilli: 0,
      caster: '0x0000000000001234', // player
      sourceName: 'Attack',
      target: '0xF130000CE0000001', // enemy
      hitType: 0,
      amount: 1000,
      school: 1,
      tailers: [],
      tailerCount: 0,
      activity: [],
      activityCount: 0,
      isSynthetic: false,
      spellId: null,
      spellAttackOutcome: null,
      overkill: 0,
    };

    processor.processEvent(state, event, 'enc1', new Date(), 'damage', context);

    // Processor records all damage; source type filtering is done by fixedFilters
    expect(state.EncounterDamage.get('enc1')?.size).toBe(1);
  });
});

describe('petDamageDoneProcessor', () => {
  const processor = createDamageDoneProcessor('pets');

  function createContext(overrides: Partial<ProcessorContext> = {}): ProcessorContext {
    return {
      players: {
        '0x0000000000001234': { name: 'TestPlayer', class: 'HUNTER' },
      },
      units: {
        '0xF130000CE0000001': { name: 'Boss', owner: null, entry: 12345 },
        '0xF140000CE0000002': { name: 'Wolf', owner: '0x0000000000001234', entry: 99 },
      },
      selectedEncounterIds: new Set(['enc1']),
      entitySelection: {
        enemyIds: new Set(),
        playerIds: new Set(),
      },
      ...overrides,
    };
  }

  function createPetDamageEvent(overrides: Partial<DamageProcessorEvent> = {}): DamageProcessorEvent {
    return {
      type: 'damage',
      index: 0,
      offsetMilli: 0,
      caster: '0xF140000CE0000002',
      sourceName: 'Bite',
      target: '0xF130000CE0000001',
      hitType: 0,
      amount: 500,
      school: 1,
      tailers: [],
      tailerCount: 0,
      activity: [],
      activityCount: 0,
      isSynthetic: false,
      spellId: null,
      spellAttackOutcome: null,
      overkill: 0,
      ...overrides,
    };
  }

  it('groups pet damage under owner by default', () => {
    const state = processor.createState();
    const context = createContext();

    processor.processEvent(state, createPetDamageEvent(), 'enc1', new Date(), 'damage', context);

    const encDamage = state.EncounterDamage.get('enc1')!;
    expect(encDamage.has('0x0000000000001234')).toBe(true);
    expect(encDamage.has('0xF140000CE0000002')).toBe(false);

    const ownerData = encDamage.get('0x0000000000001234')!;
    expect(ownerData.playerName).toBe("TestPlayer");
    expect(ownerData.className).toBe('HUNTER');
  });

  it('groups pet damage by pet when petGrouping is set to pet', () => {
    const state = processor.createState();
    const context = createContext({
      panelOption: 'p:individual',
    });

    processor.processEvent(state, createPetDamageEvent(), 'enc1', new Date(), 'damage', context);

    const encDamage = state.EncounterDamage.get('enc1')!;
    expect(encDamage.has('0xF140000CE0000002')).toBe(true);
    expect(encDamage.has('0x0000000000001234')).toBe(false);

    const petData = encDamage.get('0xF140000CE0000002')!;
    expect(petData.playerName).toBe('Wolf (TestPlayer)');
    expect(petData.className).toBe('HUNTER');
  });

  it('creates a unique row per pet when petGrouping is set to pet', () => {
    const state = processor.createState();
    const context = createContext({
      panelOption: 'p:individual',
      units: {
        '0xF130000CE0000001': { name: 'Boss', owner: null, entry: 12345 },
        '0xF140000CE0000002': { name: 'Wolf', owner: '0x0000000000001234', entry: 99 },
        '0xF140000CE0000003': { name: 'Cat', owner: '0x0000000000001234', entry: 100 },
      },
    });

    processor.processEvent(state, createPetDamageEvent({ amount: 500 }), 'enc1', new Date(), 'damage', context);
    processor.processEvent(
      state,
      createPetDamageEvent({
        caster: '0xF140000CE0000003',
        sourceName: 'Claw',
        amount: 300,
      }),
      'enc1',
      new Date(),
      'damage',
      context,
    );

    const encDamage = state.EncounterDamage.get('enc1')!;
    expect(encDamage.size).toBe(2);
    expect(encDamage.has('0xF140000CE0000002')).toBe(true);
    expect(encDamage.has('0xF140000CE0000003')).toBe(true);
    expect(encDamage.has('0x0000000000001234')).toBe(false);

    expect(encDamage.get('0xF140000CE0000002')?.playerName).toBe('Wolf (TestPlayer)');
    expect(encDamage.get('0xF140000CE0000003')?.playerName).toBe('Cat (TestPlayer)');
    expect(encDamage.get('0xF140000CE0000002')?.target.get('0xF130000CE0000001')).toBe(500);
    expect(encDamage.get('0xF140000CE0000003')?.target.get('0xF130000CE0000001')).toBe(300);
  });

  it('groups pets with the same name for the same owner when petGrouping is set to pet_name', () => {
    const state = processor.createState();
    const context = createContext({
      panelOption: 'p:name',
      units: {
        '0xF130000CE0000001': { name: 'Boss', owner: null, entry: 12345 },
        '0xF140000CE0000002': { name: 'Infernal', owner: '0x0000000000001234', entry: 89 },
        '0xF140000CE0000004': { name: 'Infernal', owner: '0x0000000000001234', entry: 89 },
      },
    });

    processor.processEvent(
      state,
      createPetDamageEvent({
        caster: '0xF140000CE0000002',
        amount: 500,
      }),
      'enc1',
      new Date(),
      'damage',
      context,
    );
    processor.processEvent(
      state,
      createPetDamageEvent({
        caster: '0xF140000CE0000004',
        amount: 300,
      }),
      'enc1',
      new Date(),
      'damage',
      context,
    );

    const encDamage = state.EncounterDamage.get('enc1')!;
    expect(encDamage.size).toBe(1);
    expect(encDamage.has('pet_name:infernal:0x0000000000001234')).toBe(true);

    const infernalData = encDamage.get('pet_name:infernal:0x0000000000001234')!;
    expect(infernalData.playerName).toBe('Infernal (TestPlayer)');
    expect(infernalData.target.get('0xF130000CE0000001')).toBe(800);
  });

  it('keeps same pet names separate per owner when petGrouping is set to pet_name', () => {
    const state = processor.createState();
    const context = createContext({
      players: {
        '0x0000000000001234': { name: 'TestPlayer', class: 'HUNTER' },
        '0x0000000000009999': { name: 'OtherPlayer', class: 'WARLOCK' },
      },
      panelOption: 'p:name',
      units: {
        '0xF130000CE0000001': { name: 'Boss', owner: null, entry: 12345 },
        '0xF140000CE0000002': { name: 'Infernal', owner: '0x0000000000001234', entry: 89 },
        '0xF140000CE0000003': { name: 'Infernal', owner: '0x0000000000009999', entry: 89 },
      },
    });

    processor.processEvent(
      state,
      createPetDamageEvent({
        caster: '0xF140000CE0000002',
        amount: 500,
      }),
      'enc1',
      new Date(),
      'damage',
      context,
    );
    processor.processEvent(
      state,
      createPetDamageEvent({
        caster: '0xF140000CE0000003',
        amount: 300,
      }),
      'enc1',
      new Date(),
      'damage',
      context,
    );

    const encDamage = state.EncounterDamage.get('enc1')!;
    expect(encDamage.size).toBe(2);

    const ownerOne = encDamage.get('pet_name:infernal:0x0000000000001234')!;
    const ownerTwo = encDamage.get('pet_name:infernal:0x0000000000009999')!;
    expect(ownerOne.playerName).toBe('Infernal (TestPlayer)');
    expect(ownerTwo.playerName).toBe('Infernal (OtherPlayer)');
    expect(ownerOne.target.get('0xF130000CE0000001')).toBe(500);
    expect(ownerTwo.target.get('0xF130000CE0000001')).toBe(300);
  });

  it('records direct player damage (filtering done by fixedFilters)', () => {
    const state = processor.createState();
    const context = createContext();
    const event: DamageProcessorEvent = {
      type: 'damage',
      index: 0,
      offsetMilli: 0,
      caster: '0x0000000000001234', // player directly
      sourceName: 'Auto Shot',
      target: '0xF130000CE0000001',
      hitType: 0,
      amount: 1000,
      school: 1,
      tailers: [],
      tailerCount: 0,
      activity: [],
      activityCount: 0,
      isSynthetic: false,
      spellId: null,
      spellAttackOutcome: null,
      overkill: 0,
    };

    processor.processEvent(state, event, 'enc1', new Date(), 'damage', context);

    // Processor records all damage; source type filtering is done by fixedFilters
    expect(state.EncounterDamage.get('enc1')?.size).toBe(1);
  });
});
