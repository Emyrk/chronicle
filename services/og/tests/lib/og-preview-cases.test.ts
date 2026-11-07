import { describe, expect, it } from 'vitest';
import previewCases from '../../app/lib/og-preview-cases.json';
import { OG_THEMES } from '../../app/lib/og-themes';

describe('OG preview cases', () => {
  it('covers every registered renderer theme', () => {
    const covered = new Set(previewCases.map(item => item.params.template));
    expect(OG_THEMES.map(theme => theme.key).filter(key => !covered.has(key))).toEqual([]);
  });

  it('uses unique IDs and identifies the Chronicle route for every case', () => {
    expect(new Set(previewCases.map(item => item.id)).size).toBe(previewCases.length);
    for (const item of previewCases) {
      expect(item.pageExample).not.toBe('');
      expect(item.description).not.toBe('');
    }
  });
});
