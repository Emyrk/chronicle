#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const CASES_PATH = resolve(SCRIPT_DIR, '../app/lib/og-preview-cases.json');
const DEFAULT_OUTPUT = resolve(SCRIPT_DIR, '../.preview/index.html');
const USER_AGENT = 'Discordbot/2.0 (+https://discordapp.com) Chronicle-OG-preview';

function decodeHtml(value) {
  return value
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function attributes(tag) {
  const result = new Map();
  const pattern = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  for (const match of tag.matchAll(pattern)) {
    result.set(match[1].toLowerCase(), decodeHtml(match[2] ?? match[3] ?? match[4] ?? ''));
  }
  return result;
}

export function parseSocialMetadata(html, pageUrl) {
  const metadata = new Map();
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = attributes(match[0]);
    const key = (attrs.get('property') ?? attrs.get('name') ?? '').toLowerCase();
    if (key && !metadata.has(key)) metadata.set(key, attrs.get('content') ?? '');
  }

  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const pageTitle = titleMatch ? decodeHtml(titleMatch[1].replace(/\s+/g, ' ').trim()) : '';
  const resolveUrl = value => {
    if (!value) return '';
    try {
      return new URL(value, pageUrl).toString();
    } catch {
      return value;
    }
  };

  return {
    title: metadata.get('og:title') || metadata.get('twitter:title') || pageTitle,
    description: metadata.get('og:description') || metadata.get('twitter:description') || metadata.get('description') || '',
    image: resolveUrl(metadata.get('og:image') || metadata.get('twitter:image') || ''),
    canonicalUrl: resolveUrl(metadata.get('og:url') || pageUrl),
    type: metadata.get('og:type') || '',
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function parseArgs(argv) {
  const urls = [];
  let output = DEFAULT_OUTPUT;
  let renderer = 'http://localhost:3000';
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') {
      continue;
    }
    if (arg === '--out' || arg === '-o') {
      const next = argv[index + 1];
      if (!next) throw new Error(`${arg} requires a file path`);
      output = resolve(next);
      index += 1;
    } else if (arg === '--renderer') {
      const next = argv[index + 1];
      if (!next) throw new Error(`${arg} requires a base URL`);
      renderer = new URL(next).toString();
      index += 1;
    } else if (arg === '--help' || arg === '-h') {
      return { help: true, output, renderer, urls };
    } else {
      urls.push(arg);
    }
  }
  return { help: false, output, renderer, urls };
}

async function loadPreviewCases() {
  return JSON.parse(await readFile(CASES_PATH, 'utf8'));
}

async function inspectVariant(renderer, variant) {
  const imageUrl = new URL('/api/og', renderer);
  imageUrl.search = new URLSearchParams(variant.params).toString();
  try {
    const response = await fetch(imageUrl, { signal: AbortSignal.timeout(30_000) });
    const contentType = response.headers.get('content-type') ?? '';
    if (!response.ok || !contentType.startsWith('image/')) {
      throw new Error(`renderer returned HTTP ${response.status} ${contentType || 'without a content type'}`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    return {
      ...variant,
      image: `data:${contentType};base64,${bytes.toString('base64')}`,
      imageUrl: imageUrl.toString(),
      error: '',
    };
  } catch (error) {
    return { ...variant, image: '', imageUrl: imageUrl.toString(), error: error.message };
  }
}

function renderVariantPage(variants, renderer) {
  const groups = [...new Set(variants.map(item => item.group))];
  const sections = groups
    .map(group => {
      const cards = variants
        .filter(item => item.group === group)
        .map(item => `<article>
          <a class="image ${item.error ? 'missing' : ''}" href="${escapeHtml(item.imageUrl)}">
            ${item.image ? `<img src="${item.image}" alt="${escapeHtml(item.label)} Open Graph card" />` : escapeHtml(item.error)}
          </a>
          <div class="copy">
            <div class="label"><h2>${escapeHtml(item.label)}</h2><span class="tags">${item.status ? `<strong>${escapeHtml(item.status)}</strong>` : ''}<code>${escapeHtml(item.params.template)}</code></span></div>
            <p>${escapeHtml(item.description)}</p>
            <code class="route">${escapeHtml(item.pageExample)}</code>
            ${item.note ? `<p class="note">${escapeHtml(item.note)}</p>` : ''}
          </div>
        </article>`)
        .join('\n');
      return `<section><div class="group"><h3>${escapeHtml(group)}</h3><span></span></div><div class="grid">${cards}</div></section>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="en"><head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Chronicle OG card approval</title>
  <style>
    :root { color-scheme: dark; font-family: Georgia, Cambria, serif; background: #090b10; color: #ece7dc; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 64px 28px 96px; }
    main { max-width: 1440px; margin: 0 auto; }
    .eyebrow, h3, code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .eyebrow, h3 { color: #c4a96a; font-size: 12px; letter-spacing: .18em; text-transform: uppercase; }
    h1 { max-width: 850px; margin: 10px 0 14px; font-size: clamp(40px, 7vw, 84px); font-weight: 400; line-height: .98; }
    .intro { max-width: 800px; color: #aaa69d; font: 17px/1.7 ui-sans-serif, system-ui, sans-serif; }
    section { margin-top: 72px; }
    .group { display: flex; align-items: center; gap: 16px; margin-bottom: 22px; }
    .group h3 { margin: 0; }
    .group span { height: 1px; flex: 1; background: #302d28; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 520px), 1fr)); gap: 26px; }
    article { overflow: hidden; border: 1px solid #292721; border-radius: 5px; background: #101218; box-shadow: 0 24px 70px #0008; }
    .image { display: grid; place-items: center; width: 100%; aspect-ratio: 1200/630; background: #06070a; color: #d98d8d; font: 14px ui-monospace, monospace; text-decoration: none; }
    .image img { display: block; width: 100%; height: 100%; object-fit: contain; }
    .copy { padding: 22px 24px 25px; }
    .label { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; }
    .tags { display: flex; align-items: center; gap: 8px; }
    .tags strong { border: 1px solid #7a3f3f; border-radius: 999px; padding: 4px 8px; color: #e9a6a6; background: #2a1517; font: 10px ui-monospace, monospace; letter-spacing: .08em; text-transform: uppercase; }
    h2 { margin: 0; font-size: 24px; font-weight: 400; }
    .label code { color: #77736b; font-size: 11px; }
    .copy > p { min-height: 48px; margin: 9px 0 17px; color: #aaa69d; font: 15px/1.5 ui-sans-serif, system-ui, sans-serif; }
    .route { display: inline-block; max-width: 100%; overflow-wrap: anywhere; border: 1px solid #343027; border-radius: 999px; padding: 6px 10px; color: #d2b875; background: #17150f; font-size: 12px; }
    .copy > .note { min-height: 0; margin: 13px 0 0; color: #77736b; font-size: 13px; }
  </style>
</head><body><main>
  <p class="eyebrow">Chronicle · social card review</p>
  <h1>Every card, captured from the renderer.</h1>
  <p class="intro">${variants.length} curated outcomes rendered by ${escapeHtml(renderer)}. Each card identifies the Chronicle route and selection condition it represents. Images are embedded, so this file can be shared for approval.</p>
  ${sections}
</main></body></html>`;
}

function renderPage(results) {
  const generatedAt = new Date().toISOString();
  const cards = results
    .map(result => {
      const status = result.error ? `<span class="status error">${escapeHtml(result.error)}</span>` : `<span class="status">HTTP ${result.status}</span>`;
      const image = result.metadata?.image
        ? `<a class="image" href="${escapeHtml(result.metadata.image)}"><img src="${escapeHtml(result.metadata.image)}" alt="" /></a>`
        : '<div class="image missing">No og:image found</div>';
      return `<article>
        <header><a href="${escapeHtml(result.url)}">${escapeHtml(result.url)}</a>${status}</header>
        ${image}
        <div class="copy">
          <h2>${escapeHtml(result.metadata?.title || 'No title')}</h2>
          <p>${escapeHtml(result.metadata?.description || 'No description')}</p>
          <dl>
            <dt>og:url</dt><dd>${escapeHtml(result.metadata?.canonicalUrl || '')}</dd>
            <dt>og:type</dt><dd>${escapeHtml(result.metadata?.type || '')}</dd>
            <dt>og:image</dt><dd>${escapeHtml(result.metadata?.image || '')}</dd>
          </dl>
        </div>
      </article>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Chronicle OG link preview</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; background: #0d1017; color: #eef0f4; }
    body { margin: 0; padding: 40px 24px 80px; }
    main { max-width: 1120px; margin: 0 auto; }
    h1 { margin-bottom: 4px; }
    .intro { color: #aeb5c2; margin-top: 0; }
    article { overflow: hidden; margin-top: 32px; border: 1px solid #2b313d; border-radius: 14px; background: #151923; box-shadow: 0 16px 45px #0006; }
    header { display: flex; gap: 16px; align-items: center; justify-content: space-between; padding: 14px 18px; }
    header a { overflow-wrap: anywhere; color: #d5b66f; }
    .status { flex: none; border-radius: 999px; padding: 3px 9px; background: #1f4937; color: #9be3bd; font-size: 12px; }
    .status.error { max-width: 50%; border-radius: 6px; background: #552a30; color: #ffbac2; }
    .image { display: block; background: #090b10; aspect-ratio: 1200 / 630; }
    .image img { display: block; width: 100%; height: 100%; object-fit: contain; }
    .image.missing { display: grid; place-items: center; color: #747d8c; }
    .copy { padding: 18px; }
    h2 { margin: 0 0 8px; }
    p { color: #c7ccd5; }
    dl { display: grid; grid-template-columns: 80px 1fr; gap: 6px 12px; margin: 18px 0 0; font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
    dt { color: #8e97a6; }
    dd { margin: 0; overflow-wrap: anywhere; }
  </style>
</head>
<body><main>
  <h1>Chronicle OG link preview</h1>
  <p class="intro">Fetched as Discordbot at ${escapeHtml(generatedAt)}. Open the source link or image to inspect it directly.</p>
  ${cards}
</main></body>
</html>`;
}

async function inspectUrl(input) {
  let url;
  try {
    url = new URL(input);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('only http(s) URLs are supported');
  } catch (error) {
    return { url: input, error: `Invalid URL: ${error.message}` };
  }

  try {
    const response = await fetch(url, {
      headers: { Accept: 'text/html,application/xhtml+xml', 'User-Agent': USER_AGENT },
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    });
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
      throw new Error(`expected HTML, got ${contentType || 'an unknown content type'}`);
    }
    const html = await response.text();
    return {
      url: url.toString(),
      status: response.status,
      finalUrl: response.url,
      metadata: parseSocialMetadata(html, response.url),
      error: response.ok ? '' : `Page returned HTTP ${response.status}`,
    };
  } catch (error) {
    return { url: url.toString(), error: error.message };
  }
}

async function main() {
  const { help, output, renderer, urls } = parseArgs(process.argv.slice(2));
  if (help) {
    console.log(`Usage:
  pnpm preview:links
  pnpm preview:links -- [--renderer URL] [--out FILE]
  pnpm preview:links -- [--out FILE] URL [URL ...]

With no page URLs, renders every curated OG variant from the local renderer and embeds the PNGs in an approval gallery.
With page URLs, fetches each page as Discordbot and previews its actual Open Graph metadata.
Default renderer: http://localhost:3000
Default output: ${relative(process.cwd(), DEFAULT_OUTPUT)}`);
    return;
  }

  await mkdir(dirname(output), { recursive: true });
  if (urls.length === 0) {
    const cases = await loadPreviewCases();
    const variants = await Promise.all(cases.map(item => inspectVariant(renderer, item)));
    await writeFile(output, renderVariantPage(variants, renderer));
    const failures = variants.filter(item => item.error);
    console.log(`Rendered ${variants.length - failures.length}/${variants.length} curated OG variants from ${renderer}`);
    for (const failure of failures) console.log(`  ${failure.label}: ${failure.error}`);
    console.log(`\nApproval gallery written to ${output}`);
    if (failures.length > 0) process.exitCode = 1;
    return;
  }

  const results = await Promise.all(urls.map(inspectUrl));
  await writeFile(output, renderPage(results));

  for (const result of results) {
    const outcome = result.error || result.metadata?.image || 'no og:image';
    console.log(`${result.url}\n  ${outcome}`);
  }
  console.log(`\nPreview written to ${output}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
