// Text clean-up shared by the handler's fixed params and the card kit's param().

// Built from a string: SWC emits the line/paragraph separators of a regex
// literal as raw characters, which webpack then fails to parse.
const UNICODE_SPACES = new RegExp('[\\u2000-\\u200F\\u2028-\\u202F]', 'g');

// Sanitize text - replace unsupported characters with safe alternatives
export function sanitizeText(text: string): string {
  return text
    .replace(/[⸺⸻—–]+|-{2,}/g, ' — ')
    .replace(/[""“”]/g, '"')
    .replace(/[''‘’]/g, "'")
    .replace(/…/g, '...')
    .replace(UNICODE_SPACES, ' ')
    .replace(/ {2,}/g, ' ')
    .trim();
}

// Slice by code point so a cap never splits an emoji or surrogate pair.
export function capText(text: string, max: number): string {
  return Array.from(text).slice(0, max).join('');
}
