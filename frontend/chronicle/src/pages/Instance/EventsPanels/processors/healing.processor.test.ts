import { describe, it, expect } from 'vitest';
import { createUnifiedHealingProcessor, type UnifiedHealingResult } from './healing.processor';
import type { HealProcessorEvent, ProcessorContext } from '../processorTypes';

describe('healingProcessor pet/object caster support', () => {
  const processor = createUnifiedHealingProcessor();

  function createContext(overrides: Partial<ProcessorContext> = {}): ProcessorContext {
    return {
      players: {
        '0x0000000000001234': { name: 'TestPlayer', class: 'SHAMAN' },
        '0x0000000000005678': { name: 'TestTarget', class: 'WARRIOR' },
      },
      units: {
        '0xF130000CE0000001': { name: 'Boss', owner: null, entry: 12345 },
        '0xF140000CE0000002': { name: 'Healing Stream Totem', owner: '0x0000000000001234', entry: 99 },
      },
      selectedEncounterIds: new Set(['enc1']),
      entitySelection: {
        enemyIds: new Set(),
        playerIds: new Set(),
      },
      capabilities: ['overheal'],
      ...overrides,
    };
  }

  function createHealEvent(overrides: Partial<HealProcessorEvent> = {}): HealProcessorEvent {
    return {
      type: 'heal',
      index: 0,
      offsetMilli: 0,
      caster: '0x0000000000001234',
      sourceName: 'Healing Wave',
      target: '0x0000000000005678',
      hitType: 0,
      amount: 500,
      overheal: 0,
      absorbed: 0,
      school: 8,
      spellId: 331,
      spellAttackOutcome: null,
      activity: [],
      activityCount: 0,
      isSynthetic: false,
      ...overrides,
    };
  }

  function processEvents(
    events: HealProcessorEvent[],
    context: ProcessorContext,
  ): UnifiedHealingResult {
    const state = processor.createState();
    for (const event of events) {
      processor.processEvent(state, event, 'enc1', new Date(), 'heal', context);
    }
    return state;
  }

  it('merges pet healing into owner by default (merged grouping, owner petMode)', () => {
    const context = createContext({ panelOption: 'g:merged,p:owner' });
    const event = createHealEvent({
      caster: '0xF140000CE0000002', // pet
      sourceName: 'Healing Stream',
      amount: 300,
      overheal: 0,
    });

    const state = processEvents([event], context);
    const enc = state.EncounterHealingByHealer.get('enc1')!;

    // Should be keyed by owner GUID
    expect(enc.has('0x0000000000001234')).toBe(true);
    expect(enc.has('0xF140000CE0000002')).toBe(false);

    const healer = enc.get('0x0000000000001234')!;
    expect(healer.playerName).toBe('TestPlayer');
    expect(healer.className).toBe('SHAMAN');
    expect(healer.effectiveTotal).toBe(300);
  });

  it('keeps pet as individual row with individual petMode', () => {
    const context = createContext({ panelOption: 'g:default,p:individual' });
    const event = createHealEvent({
      caster: '0xF140000CE0000002',
      sourceName: 'Healing Stream',
      amount: 200,
      overheal: 0,
    });

    const state = processEvents([event], context);
    const enc = state.EncounterHealingByHealer.get('enc1')!;

    // Should be keyed by pet GUID
    expect(enc.has('0xF140000CE0000002')).toBe(true);
    expect(enc.has('0x0000000000001234')).toBe(false);

    const healer = enc.get('0xF140000CE0000002')!;
    expect(healer.playerName).toBe('Healing Stream Totem (TestPlayer)');
    expect(healer.effectiveTotal).toBe(200);
  });

  it('labels pet abilities as "<Ability> (by pet <PetName>)" in merged mode breakouts', () => {
    const context = createContext({ panelOption: 'g:merged,p:owner' });
    const event = createHealEvent({
      caster: '0xF140000CE0000002',
      sourceName: 'Healing Stream',
      amount: 400,
      overheal: 0,
    });

    const state = processEvents([event], context);
    const abilities = state.HealerByAbility.get('0x0000000000001234')!;

    expect(abilities.has('Healing Stream (by pet Healing Stream Totem)')).toBe(true);
  });

  it('allows enemy casters through (filters handle exclusion)', () => {
    const context = createContext({ panelOption: 'g:merged,p:owner' });
    const event = createHealEvent({
      caster: '0xF130000CE0000001', // Boss (enemy, no owner)
      sourceName: 'Shadow Bolt Volley',
      amount: 100,
      overheal: 0,
    });

    const state = processEvents([event], context);
    const enc = state.EncounterHealingByHealer.get('enc1')!;

    // Enemy caster should be present (filters handle exclusion, not the processor)
    expect(enc.has('0xF130000CE0000001')).toBe(true);
  });

  it('still works for direct player casters', () => {
    const context = createContext({ panelOption: 'g:merged,p:owner' });
    const event = createHealEvent({
      caster: '0x0000000000001234',
      sourceName: 'Healing Wave',
      amount: 1000,
      overheal: 200,
    });

    const state = processEvents([event], context);
    const enc = state.EncounterHealingByHealer.get('enc1')!;
    const healer = enc.get('0x0000000000001234')!;

    expect(healer.playerName).toBe('TestPlayer');
    expect(healer.effectiveTotal).toBe(800);
    expect(healer.overhealTotal).toBe(200);
  });
});
