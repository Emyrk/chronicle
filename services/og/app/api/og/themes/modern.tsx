import { publicImage } from './public-files';
import { Cover, FILL, fitFontSize, Img, loadFontsourceFamily } from './shared';
import type { ThemeProps, ThemeFont, ThemeDefinition, ThemeContext } from './types';

function loadFonts(_context: ThemeContext): Promise<ThemeFont[]> {
  return loadFontsourceFamily('geist', 'Geist', [{ weight: 400 }, { weight: 500 }, { weight: 600 }]);
}

// Set like a magazine cover: the headline sits straight on the photo at the top,
// the byline runs along the bottom edge. No panel, so the photo stays whole.
const MARGIN = 64;
const WHITE = '#ffffff';
const SOFT = 'rgba(255, 255, 255, 0.72)';

async function render(props: ThemeProps, _context: ThemeContext): Promise<React.ReactElement> {
  const { title, site, excerpt, author, date, readingTime, tag, imageSrc, iconSrc, avatarSrc } = props;
  const details = [date, readingTime].filter(Boolean);

  const titleSize = fitFontSize(title, [
    [14, 120],
    [24, 92],
    [40, 76],
    [64, 64],
    [Infinity, 54],
  ]);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        position: 'relative',
        fontFamily: '"Geist", sans-serif',
        color: WHITE,
        background: '#000000',
      }}
    >
      <Cover src={imageSrc ?? (await publicImage('default-bg.jpg'))} />
      {/* Darken only where text sits: a deep wash under the headline, a light one under the byline. */}
      <div
        style={{
          ...FILL,
          backgroundImage:
            'linear-gradient(180deg, rgba(0, 0, 0, 0.66) 0%, rgba(0, 0, 0, 0.3) 42%, rgba(0, 0, 0, 0) 64%, rgba(0, 0, 0, 0.5) 100%)',
        }}
      />

      <div
        style={{
          ...FILL,
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: `60px ${MARGIN}px 56px`,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              display: 'block',
              textWrap: 'pretty',
              lineClamp: 3,
              maxWidth: 1000,
              fontSize: titleSize,
              fontWeight: 600,
              lineHeight: 1.02,
              letterSpacing: '-0.045em',
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
                maxWidth: 820,
                marginTop: 24,
                fontSize: 28,
                lineHeight: 1.36,
                letterSpacing: '-0.01em',
                color: SOFT,
              }}
            >
              {excerpt}
            </div>
          ) : null}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {iconSrc ? <Img src={iconSrc} width={32} height={32} style={{ borderRadius: 8 }} /> : null}
            <span style={{ fontWeight: 500 }}>{site}</span>
            {tag ? <span style={{ color: 'rgba(255, 255, 255, 0.4)' }}>/</span> : null}
            {tag ? <span style={{ color: props.accent ?? SOFT }}>{tag}</span> : null}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            {author || avatarSrc ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {avatarSrc ? <Img src={avatarSrc} width={36} height={36} style={{ borderRadius: 999 }} /> : null}
                {author ? <span style={{ fontWeight: 500 }}>{author}</span> : null}
              </div>
            ) : null}
            {details.map(item => (
              <span key={item} style={{ color: SOFT }}>
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export const modernTheme: ThemeDefinition = {
  loadFonts,
  render,
  fontFamily: '"Geist", sans-serif',
};
