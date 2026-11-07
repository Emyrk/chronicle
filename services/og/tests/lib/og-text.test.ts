import { describe, expect, test } from 'vitest';
import { capText, sanitizeText } from '../../app/lib/og-text';

// Every card param goes through these (kit.tsx param() and listParam()).
describe('sanitizeText', () => {
  test('normalizes typographic quotes, dashes, ellipses and odd spaces', () => {
    expect(sanitizeText('“Hello”—World…')).toBe('"Hello" — World...');
    expect(sanitizeText('‘My Site’')).toBe("'My Site'");
    expect(sanitizeText('Line\u2009Break')).toBe('Line Break');
  });

  test('keeps single hyphens intact', () => {
    expect(sanitizeText('state-of-the-art')).toBe('state-of-the-art');
    expect(sanitizeText('Pause — resume')).toBe('Pause — resume');
  });
});

describe('capText', () => {
  test('caps by code point without splitting emoji', () => {
    const capped = capText('🚀'.repeat(300), 200);
    expect(Array.from(capped)).toHaveLength(200);
    expect(capped.endsWith('🚀')).toBe(true);
    expect(capText('x'.repeat(100), 40)).toHaveLength(40);
  });
});
