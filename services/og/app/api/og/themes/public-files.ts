import { readFile } from 'node:fs/promises';
import path from 'node:path';

// Fonts and images that ship in public/. They are read from disk rather than
// fetched from our own origin, which a server behind a proxy or a Docker port
// mapping often can't reach. Next's file tracing follows the path.join below
// and ships public/ with the server build, on Vercel and in standalone output.
const cache = new Map<string, Promise<Buffer>>();

export function readPublicFile(file: string): Promise<Buffer> {
  let pending = cache.get(file);
  if (!pending) {
    pending = readFile(path.join(process.cwd(), 'public', file));
    cache.set(file, pending);
    pending.catch(() => cache.delete(file));
  }
  return pending;
}

// Inlined as a data URL, the same way caller-supplied images reach Satori.
export async function publicImage(file: string): Promise<string> {
  const type = file.endsWith('.png') ? 'image/png' : 'image/jpeg';
  return `data:${type};base64,${(await readPublicFile(file)).toString('base64')}`;
}
