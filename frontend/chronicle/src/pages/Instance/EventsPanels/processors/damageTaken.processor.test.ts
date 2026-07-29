import { describe, expect, it } from 'vitest';
import { createDamageTakenProcessor } from '../DamageTaken/damageTaken.processor';
import type { DamageProcessorEvent, ProcessorContext } from '../processorTypes';

describe('enemyDamageTakenProcessor', () => {
  const processor = createDamageTakenProcessor('enemies');

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

  function createDamageEvent(overrides: Partial<DamageProcessorEvent> = {}): DamageProcessorEvent {
    return {
      type: 'damage',
      index: 0,
      offsetMilli: 0,
      caster: '0x0000000000001234',
      sourceName: 'Attack',
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
      ...overrides,
    };
  }

  it('groups enemies by unit GUID by default', () => {
    const state = processor.createState();
    const context = createContext({
      units: {
        '0xF130000CE0000001': { name: 'Boss', owner: null, entry: 12345 },
        '0xF130000CE0000002': { name: 'Boss', owner: null, entry: 12345 },
      },
    });

    processor.processEvent(state, createDamageEvent({ target: '0xF130000CE0000001', amount: 500 }), 'enc1', new Date(), 'damage', context);
    processor.processEvent(state, createDamageEvent({ target: '0xF130000CE0000002', amount: 300 }), 'enc1', new Date(), 'damage', context);

    const encDamage = state.EncounterDamage.get('enc1')!;
    expect(encDamage.size).toBe(2);
    expect(encDamage.get('0xF130000CE0000001')?.source.get('0x0000000000001234')).toBe(500);
    expect(encDamage.get('0xF130000CE0000002')?.source.get('0x0000000000001234')).toBe(300);
  });

  it('falls back to GUID grouping when enemy name is missing in name mode', () => {
    const state = processor.createState();
    const context = createContext({
      panelOption: 'g:name',
      units: {},
    });

    processor.processEvent(state, createDamageEvent({ target: '0xF130000CE0000001', amount: 500 }), 'enc1', new Date(), 'damage', context);

    const encDamage = state.EncounterDamage.get('enc1')!;
    expect(encDamage.has('enemy_name:0xf130000ce0000001')).toBe(false);
    expect(encDamage.has('0xF130000CE0000001')).toBe(true);
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

    processor.processEvent(state, createDamageEvent({ target: '0xF130000CE0000001', amount: 500 }), 'enc1', new Date(), 'damage', context);
    processor.processEvent(state, createDamageEvent({ target: '0xF130000CE0000002', amount: 300 }), 'enc1', new Date(), 'damage', context);

    const encDamage = state.EncounterDamage.get('enc1')!;
    expect(encDamage.size).toBe(1);

    const groupedEnemy = encDamage.get('enemy_name:boss');
    expect(groupedEnemy?.unitName).toBe('Boss');
    expect(groupedEnemy?.source.get('0x0000000000001234')).toBe(800);
  });
});
