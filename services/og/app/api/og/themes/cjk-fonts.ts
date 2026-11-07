import type { ThemeFont } from './types';

// Han, kana, hangul, CJK punctuation and full-width forms.
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}　-〿＀-￯]/gu;
const TIMEOUT_MS = 3000;
// The CSS API serves TTF, which Satori needs, only to old browsers.
const TTF_USER_AGENT =
  'Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8; de-at) AppleWebKit/533.21.1 (KHTML, like Gecko) Version/5.0.5 Safari/533.21.1';

function notoFamily(chars: string): string {
  if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(chars)) return 'Noto Sans JP';
  if (/\p{Script=Hangul}/u.test(chars)) return 'Noto Sans KR';
  return 'Noto Sans SC';
}

// The theme fonts are latin only. For CJK, next/og would fetch Noto from
// fonts.googleapis.com, which mainland China blocks, and at weight 400 only.
// This fetches the same subset first from Google's China domain, which is
// reachable everywhere, at 400 and 700 so bold titles stay bold. On failure it
// returns nothing and next/og's own fallback still runs.
export async function loadCjkFonts(text: string): Promise<ThemeFont[]> {
  const chars = [...new Set(text.match(CJK))].join('');
  if (!chars) return [];

  const family = notoFamily(chars);
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  try {
    const query = `family=${family.replaceAll(' ', '+')}:wght@400;700&text=${encodeURIComponent(chars)}`;
    const css = await fetch(`https://fonts.googleapis.cn/css2?${query}`, {
      headers: { 'user-agent': TTF_USER_AGENT },
      signal,
    });
    if (!css.ok) return [];

    const faces = (await css.text()).matchAll(/font-weight: (\d+);\s*src: url\((.+?)\) format\('(?:truetype|opentype)'\)/g);
    return await Promise.all(
      [...faces].map(async ([, weight, url]) => {
        const response = await fetch(url, { signal });
        if (!response.ok) throw new Error(`${url} answered ${response.status}`);
        return {
          name: family,
          data: await response.arrayBuffer(),
          weight: Number(weight) as ThemeFont['weight'],
          style: 'normal' as const,
        };
      })
    );
  } catch {
    return [];
  }
}
