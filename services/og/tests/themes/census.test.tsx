import { describe, expect, test } from 'vitest';
import { battle } from '../../app/api/og/themes/census';
import type { ThemeContext } from '../../app/api/og/themes/types';

const context = (query = ''): ThemeContext => ({ searchParams: new URLSearchParams(query) });

describe('census battle', () => {
  test('names the leader and margin', () => {
    expect(battle(context('horde=8955&alliance=14665'))).toEqual({
      horde: 8955,
      alliance: 14665,
      hordePct: 37.9,
      verdict: 'Alliance leads by 5,710',
    });
    expect(battle(context('horde=600&alliance=400')).verdict).toBe('Horde leads by 200');
  });

  test('calls a near tie a dead heat', () => {
    expect(battle(context('horde=1002&alliance=1000')).verdict).toBe('Dead heat · Horde by 2');
    expect(battle(context('horde=500&alliance=500')).verdict).toBe('Dead heat');
  });

  test('handles missing and invalid counts', () => {
    expect(battle(context())).toEqual({ horde: 0, alliance: 0, hordePct: 50, verdict: 'No battle yet' });
    expect(battle(context('horde=-5&alliance=abc')).hordePct).toBe(50);
  });
});
