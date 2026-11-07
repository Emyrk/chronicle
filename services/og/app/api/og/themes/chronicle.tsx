import { Cover, FILL, fitFontSize, Img, loadFontsourceFamily, metaItems } from './shared';
import type { ThemeProps, ThemeFont, ThemeDefinition, ThemeContext } from './types';

// The OFL fonts the Chronicle web app already uses. Friz Quadrata, the WoW
// display face, is commercial and must not be bundled here.
async function loadFonts(_context: ThemeContext): Promise<ThemeFont[]> {
  const [serif, sans] = await Promise.all([
    loadFontsourceFamily('libre-baskerville', 'Libre Baskerville', [{ weight: 400 }, { weight: 700 }]),
    loadFontsourceFamily('inter', 'Inter', [{ weight: 400 }, { weight: 600 }, { weight: 700 }]),
  ]);
  return [...serif, ...sans];
}

// Chronicle's dark palette (frontend/chronicle/src/index.css), as hex for Satori.
const BACKGROUND = '#2b2b2b';
const CARD = '#262626';
const BORDER = '#383838';
const FOREGROUND = '#e6e8ea';
const MUTED = '#b4b0ac';
const GOLD = '#89744d';

const MARGIN = 72;

function render(props: ThemeProps, _context: ThemeContext): React.ReactElement {
  const { title, site, excerpt, tag, imageSrc, iconSrc, avatarSrc } = props;
  const accent = props.accent ?? GOLD;
  const meta = metaItems(props);

  const titleSize = fitFontSize(title, [
    [16, 96],
    [28, 76],
    [48, 62],
    [72, 52],
    [Infinity, 44],
  ]);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        position: 'relative',
        fontFamily: '"Inter", sans-serif',
        color: FOREGROUND,
        background: BACKGROUND,
      }}
    >
      {/* A cover, when given, sits behind a heavy wash so the type keeps its contrast. */}
      {imageSrc ? <Cover src={imageSrc} /> : null}
      {imageSrc ? (
        <div
          style={{
            ...FILL,
            backgroundImage: `linear-gradient(90deg, ${BACKGROUND} 0%, rgba(43, 43, 43, 0.92) 55%, rgba(43, 43, 43, 0.6) 100%)`,
          }}
        />
      ) : null}

      <div
        style={{
          ...FILL,
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: `64px ${MARGIN}px 56px`,
          borderTop: `8px solid ${accent}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 24, fontWeight: 600 }}>
          {iconSrc ? <Img src={iconSrc} width={40} height={40} style={{ borderRadius: 4 }} /> : null}
          <span style={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}>{site}</span>
          {tag ? (
            <span
              style={{
                padding: '4px 12px',
                border: `2px solid ${accent}`,
                borderRadius: 4,
                fontSize: 20,
                color: FOREGROUND,
                background: CARD,
              }}
            >
              {tag}
            </span>
          ) : null}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 1000 }}>
          <div
            style={{
              display: 'block',
              textWrap: 'pretty',
              lineClamp: 3,
              fontFamily: '"Libre Baskerville", serif',
              fontSize: titleSize,
              fontWeight: 700,
              lineHeight: 1.15,
            }}
          >
            {title}
          </div>
          {excerpt ? (
            <div
              style={{
                display: 'block',
                textWrap: 'pretty',
                lineClamp: 2,
                marginTop: 24,
                fontSize: 28,
                lineHeight: 1.4,
                color: MUTED,
              }}
            >
              {excerpt}
            </div>
          ) : null}
        </div>

        {meta.length > 0 || avatarSrc ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 24,
              paddingTop: 24,
              borderTop: `2px solid ${BORDER}`,
              fontSize: 22,
              color: MUTED,
            }}
          >
            {avatarSrc ? <Img src={avatarSrc} width={36} height={36} style={{ borderRadius: 999 }} /> : null}
            {meta.map((item, index) => (
              <span key={item} style={index === 0 && props.author ? { color: FOREGROUND, fontWeight: 600 } : {}}>
                {item}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export const chronicleTheme: ThemeDefinition = {
  loadFonts,
  render,
  fontFamily: '"Inter", sans-serif',
};
