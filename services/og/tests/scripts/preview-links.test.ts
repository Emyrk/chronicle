import { describe, expect, it } from 'vitest';
import { parseSocialMetadata } from '../../scripts/preview-links.mjs';

describe('parseSocialMetadata', () => {
  it('reads Open Graph tags regardless of attribute order and resolves relative URLs', () => {
    const result = parseSocialMetadata(
      `<!doctype html>
      <html><head>
        <title>Fallback title</title>
        <meta content="Raid &amp; Parse" property="og:title">
        <meta property='og:description' content='A &quot;great&quot; run'>
        <meta content="/api/og?template=raid&amp;raid=Naxxramas" property="og:image">
        <meta property="og:url" content="/instances/example">
        <meta property="og:type" content="website">
      </head></html>`,
      'https://chronicleclassic.com/instances/example'
    );

    expect(result).toEqual({
      title: 'Raid & Parse',
      description: 'A "great" run',
      image: 'https://chronicleclassic.com/api/og?template=raid&raid=Naxxramas',
      canonicalUrl: 'https://chronicleclassic.com/instances/example',
      type: 'website',
    });
  });

  it('falls back to Twitter metadata and the document title', () => {
    expect(
      parseSocialMetadata(
        '<title>Character &amp; Guild</title><meta name="twitter:image" content="https://img.example/card.png">',
        'https://chronicleclassic.com/armory/turtle/player'
      )
    ).toEqual({
      title: 'Character & Guild',
      description: '',
      image: 'https://img.example/card.png',
      canonicalUrl: 'https://chronicleclassic.com/armory/turtle/player',
      type: '',
    });
  });
});
