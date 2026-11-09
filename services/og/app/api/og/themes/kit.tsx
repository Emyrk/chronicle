// The Chronicle card kit: everything a share card needs besides its layout.
// Cards render from query params only (no database, no API, no fetch to
// Chronicle); api/og.go writes every value into the signed image URL.
import { capText, sanitizeText } from '@/app/lib/og-text';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { loadCjkFonts } from './cjk-fonts';
import { publicImage, readPublicFile } from './public-files';
import { loadFontsourceFamily } from './shared';
import type { ThemeContext, ThemeFont } from './types';

// ---------------------------------------------------------------- params

// A text param, cleaned like the handler's own fields and capped by code
// point at `max`. Missing → ''.
export function param(context: ThemeContext, key: string, max: number): string {
  return capText(sanitizeText(context.searchParams.get(key) ?? ''), max);
}

// A base-10 integer param clamped to [min, max]. Missing or not an integer → null.
export function intParam(
  context: ThemeContext,
  key: string,
  { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER }: { min?: number; max?: number } = {}
): number | null {
  const raw = (context.searchParams.get(key) ?? '').trim();
  if (!/^-?\d{1,15}$/.test(raw)) return null;
  return Math.min(max, Math.max(min, Number(raw)));
}

// A comma-separated param: at most `maxItems` non-empty items, each capped at
// `maxLength`. Items with their own fields (`name:class:dps`) split further
// on ':' in the card.
export function listParam(
  context: ThemeContext,
  key: string,
  { maxItems, maxLength }: { maxItems: number; maxLength: number }
): string[] {
  return (context.searchParams.get(key) ?? '')
    .split(',')
    .map(item => capText(sanitizeText(item), maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

// `host` is the tenant host the footer prints (e.g. forever.chronicleclassic.com);
// `product` is the tenant flavour (e.g. WoW Forever).
export function chromeParams(context: ThemeContext): { host: string; product: string } {
  return {
    host: param(context, 'host', 80) || 'chronicleclassic.com',
    product: param(context, 'product', 40),
  };
}

// ---------------------------------------------------------------- tokens

// Chronicle's dark palette (frontend/chronicle/src/index.css), as hex for Satori.
export const COLORS = {
  background: '#202020',
  card: '#262626',
  border: '#383838',
  foreground: '#e6e8ea',
  muted: '#b4b0ac',
  gold: '#89744d',
  goldHi: '#c4a66e',
  rule: 'rgba(255, 255, 255, 0.08)',
} as const;

export const SANS = '"Inter", sans-serif';
export const SERIF = '"Libre Baskerville", serif';

// The fonts every kit card draws with.
export async function loadKitFonts(_context?: ThemeContext): Promise<ThemeFont[]> {
  const [serif, sans] = await Promise.all([
    loadFontsourceFamily('libre-baskerville', 'Libre Baskerville', [{ weight: 400 }, { weight: 700 }]),
    loadFontsourceFamily('inter', 'Inter', [{ weight: 400 }, { weight: 600 }, { weight: 700 }]),
  ]);
  return [...serif, ...sans];
}

const CYRILLIC = /\p{Script=Cyrillic}/u;
const INTER_WEIGHTS = [400, 600, 700] as const;

// The kit fonts are latin only, and next/og fetches any missing glyph from
// Google's main font domains. For player, guild and realm names: Cyrillic adds
// the bundled Inter Cyrillic cuts, CJK a subset from the China domain at 400
// and 700. Latin-only text adds nothing.
export async function loadNameFonts(text: string): Promise<ThemeFont[]> {
  const [cyrillic, cjk] = await Promise.all([
    CYRILLIC.test(text)
      ? Promise.all(
          INTER_WEIGHTS.map(async weight => ({
            name: 'Inter Cyrillic', // Satori keys fonts by name + weight, so it can't share Inter's name
            data: await readPublicFile(`fonts/inter/cyrillic-${weight}-normal.ttf`),
            weight,
            style: 'normal' as const,
          }))
        )
      : [],
    loadCjkFonts(text),
  ]);
  return [...cyrillic, ...cjk];
}

export const UNKNOWN_CLASS_COLOR = '#9d9d9d';

export const CLASS_COLORS: Readonly<Record<string, string>> = {
  warrior: '#C79C6E',
  mage: '#69CCF0',
  rogue: '#FFF569',
  priest: '#FFFFFF',
  warlock: '#9482C9',
  hunter: '#ABD473',
  shaman: '#0070DE',
  paladin: '#F58CBA',
  druid: '#FF7D0A',
};

export function classColor(className: string | null | undefined): string {
  const key = (className ?? '').trim().toLowerCase();
  return Object.hasOwn(CLASS_COLORS, key) ? CLASS_COLORS[key] : UNKNOWN_CLASS_COLOR;
}

// Same tiers and hexes as the web app (frontend/chronicle/src/pages/Instance/parseColors.ts).
export function parseColor(score: number): string {
  if (score >= 100) return '#fbbf24'; // amber
  if (score >= 99) return '#f472b6'; // pink
  if (score >= 95) return '#fb923c'; // orange
  if (score >= 75) return '#c084fc'; // purple
  if (score >= 50) return '#60a5fa'; // blue
  if (score >= 25) return '#4ade80'; // green
  return '#a1a1aa'; // grey
}

// Whole seconds as `h:mm:ss` from an hour up, else `m:ss`. Invalid → ''.
export function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '';
  const total = Math.floor(totalSeconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`;
}

// ---------------------------------------------------------------- bundled art

export const MARK = { file: 'chronicle/mark.png', width: 137, height: 156 } as const;
export const WORDMARK = { file: 'chronicle/wordmark.png', width: 419, height: 156 } as const;

export const HEADER_LOGO = { file: 'chronicle/logo-center.png', width: 440, height: 180 } as const;

export function headerLogoImage(): Promise<string> {
  return publicImage(HEADER_LOGO.file);
}

export function markImage(): Promise<string> {
  return publicImage(MARK.file);
}

export function wordmarkImage(): Promise<string> {
  return publicImage(WORDMARK.file);
}

const LOADING_SCREEN_PREFIX = '/c/images/loadingscreens/';

type InstanceConfig = Record<string, { background?: unknown }>;

let raidArtPromise: Promise<ReadonlyMap<string, string>> | undefined;
const raidArtImageCache = new Map<string, Promise<string>>();

export function artSlug(instanceName: string): string {
  return instanceName
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function frontendDir(): string {
  return process.env.CHRONICLE_FRONTEND_DIR ?? path.resolve(process.cwd(), '../../frontend');
}

async function loadRaidArt(): Promise<ReadonlyMap<string, string>> {
  const root = frontendDir();
  const raw = await readFile(path.join(root, 'instance-config.json'), 'utf8');
  const configs = JSON.parse(raw) as InstanceConfig;
  const art = new Map<string, string>();

  for (const [instanceName, config] of Object.entries(configs)) {
    const background = config.background;
    if (typeof background !== 'string' || !background.startsWith(LOADING_SCREEN_PREFIX) || !background.endsWith('.webp')) continue;

    const filename = background.slice(LOADING_SCREEN_PREFIX.length);
    if (!filename || filename.includes('/')) continue;

    art.set(artSlug(instanceName), path.join(root, 'chronicle/public', background.slice(1)));
  }

  return art;
}

function raidArt(): Promise<ReadonlyMap<string, string>> {
  raidArtPromise ??= loadRaidArt();
  return raidArtPromise;
}

export async function artSlugs(): Promise<string[]> {
  return [...(await raidArt()).keys()];
}

async function encodeRaidArt(file: string): Promise<string> {
  const { width, height } = await sharp(file).metadata();
  if (!width || !height) throw new Error(`loading screen has no dimensions: ${file}`);

  let cropWidth = width;
  let cropHeight = height;
  if (width * 2 > height * 3) cropWidth = Math.floor(height * 3 / 2);
  else cropHeight = Math.floor(width * 2 / 3);

  const encoded = await sharp(file)
    .extract({
      left: Math.floor((width - cropWidth) / 2),
      top: Math.floor((height - cropHeight) / 2),
      width: cropWidth,
      height: cropHeight,
    })
    .jpeg({ quality: 90 })
    .toBuffer();
  return `data:image/jpeg;base64,${encoded.toString('base64')}`;
}

function raidArtImage(file: string): Promise<string> {
  let pending = raidArtImageCache.get(file);
  if (!pending) {
    pending = encodeRaidArt(file);
    raidArtImageCache.set(file, pending);
    pending.catch(() => raidArtImageCache.delete(file));
  }
  return pending;
}

// The loading screen configured for `art=<slug>` as a 3:2 center-cropped JPEG,
// using the same frontend config, source WebP and framing as chronicled. Unknown
// slugs return null and rendering never makes a network request.
export async function artImage(context: ThemeContext): Promise<string | null> {
  const slug = context.searchParams.get('art') ?? '';
  const file = (await raidArt()).get(slug);
  return file ? raidArtImage(file) : null;
}

// Class, spec and race icons: 64×64 PNGs in public/icons. Class and spec are
// the web app's bundled /c/icons files; race icons come from the icon CDN, the
// same picks as the Armory header (getRaceIconUrl). Unknown or missing → null;
// never a network request.
const ICON_SLUG = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '');

// Race slug → icon base name. Goblin has no female icon, so it always uses the male one.
const RACE_ICONS: Readonly<Record<string, { base: string; female: boolean }>> = {
  human: { base: 'human', female: true },
  dwarf: { base: 'dwarf', female: true },
  gnome: { base: 'gnome', female: true },
  nightelf: { base: 'night_elf', female: true },
  orc: { base: 'orc', female: true },
  troll: { base: 'troll', female: true },
  tauren: { base: 'tauren', female: true },
  undead: { base: 'forsaken', female: true },
  scourge: { base: 'forsaken', female: true },
  forsaken: { base: 'forsaken', female: true },
  goblin: { base: 'goblin', female: false },
  bloodelf: { base: 'blood_elf', female: true },
};

const SPECS_BY_CLASS: Readonly<Record<string, readonly string[]>> = {
  druid: ['balance', 'feral', 'feralcombat', 'restoration'],
  hunter: ['beastmastery', 'marksmanship', 'survival'],
  mage: ['arcane', 'fire', 'frost'],
  paladin: ['holy', 'protection', 'retribution'],
  priest: ['discipline', 'holy', 'shadow'],
  rogue: ['assassination', 'combat', 'subtlety'],
  shaman: ['elemental', 'enhancement', 'restoration'],
  warlock: ['affliction', 'demonology', 'destruction'],
  warrior: ['arms', 'fury', 'protection'],
};

export function classIconFile(className: string): string | null {
  const key = ICON_SLUG(className);
  return Object.hasOwn(SPECS_BY_CLASS, key) ? `icons/class_${key}.png` : null;
}

export function specIconFile(className: string, spec: string): string | null {
  const key = ICON_SLUG(className);
  const specKey = ICON_SLUG(spec);
  return Object.hasOwn(SPECS_BY_CLASS, key) && SPECS_BY_CLASS[key].includes(specKey) ? `icons/spec_${key}_${specKey}.png` : null;
}

// `gender` is the card's gender param; anything but "female" draws the male icon.
export function raceIconFile(race: string, gender = ''): string | null {
  const key = ICON_SLUG(race);
  if (!Object.hasOwn(RACE_ICONS, key)) return null;
  const { base, female } = RACE_ICONS[key];
  return female && gender.trim().toLowerCase() === 'female' ? `icons/race_${base}_female.png` : `icons/race_${base}.png`;
}

// ---------------------------------------------------------------- chrome

// Combined <C>hronicle logo on the left, an optional chip on the right.
export function Header({ logoSrc, chip, chipStyle }: { logoSrc: string; chip?: string; chipStyle?: React.CSSProperties }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
      <img src={logoSrc} width={147} height={60} style={{ width: 147, height: 60 }} />
      {chip ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '8px 16px',
            border: '2px solid #4a4235',
            background: 'rgba(20, 20, 20, 0.55)',
            borderRadius: 4,
            fontSize: 21,
            fontWeight: 600,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: '#d9cdb5',
            ...chipStyle,
          }}
        >
          {chip}
        </div>
      ) : null}
    </div>
  );
}

// The latin font cuts have no U+2192, and a missing glyph makes next/og fetch
// a font, so the CTA arrow is drawn.
function Arrow({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M4 12h15M13 6l6 6-6 6" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// `host` on the left, a gold call to action with an arrow on the right.
export function Footer({ host, cta }: { host: string; cta?: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 20,
        borderTop: `2px solid ${COLORS.rule}`,
        fontSize: 22,
        color: COLORS.muted,
      }}
    >
      <span>{host}</span>
      {cta ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: COLORS.goldHi, fontWeight: 600 }}>
          <span>{cta}</span>
          <Arrow color={COLORS.goldHi} />
        </div>
      ) : null}
    </div>
  );
}
