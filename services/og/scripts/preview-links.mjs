#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_OUTPUT = resolve(dirname(fileURLToPath(import.meta.url)), '../.preview/index.html');
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
    } else if (arg === '--help' || arg === '-h') {
      return { help: true, output, urls };
    } else {
      urls.push(arg);
    }
  }
  return { help: false, output, urls };
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
  const { help, output, urls } = parseArgs(process.argv.slice(2));
  if (help || urls.length === 0) {
    console.log(`Usage: pnpm preview:links -- [--out FILE] URL [URL ...]\n\nFetches each page as Discordbot and writes an HTML gallery of its actual Open Graph metadata and image.\nDefault output: ${relative(process.cwd(), DEFAULT_OUTPUT)}`);
    process.exitCode = help ? 0 : 1;
    return;
  }

  const results = await Promise.all(urls.map(inspectUrl));
  await mkdir(dirname(output), { recursive: true });
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
