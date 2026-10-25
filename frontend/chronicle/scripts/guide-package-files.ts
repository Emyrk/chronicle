import { readFile, readdir } from "node:fs/promises";
import { join, posix } from "node:path";
import { normalizePackagePath } from "../src/pages/Guides/package/paths";

// Keep the build's source files and the runtime's package-local paths aligned.
// Source-only entrance.json is converted to a protobuf stream by the builder.
export async function collectGuidePackageFiles(source: string, entrypoint: string, assets: readonly string[]): Promise<Record<string, Uint8Array>> {
  const assetPaths = new Set(assets.map((asset) => normalizePackagePath(asset)));
  const collected: Record<string, Uint8Array> = Object.create(null);
  async function visit(relative: string): Promise<void> {
    const entries = await readdir(join(source, relative), { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const path = relative ? posix.join(relative, entry.name) : entry.name;
      if (entry.isDirectory()) { await visit(path); continue; }
      if (!entry.isFile()) throw new Error(`Unsupported guide source entry: ${path}`);
      if (path.endsWith(".lua") || assetPaths.has(path)) {
        const normalized = normalizePackagePath(path);
        if (normalized !== path) throw new Error(`Guide source path is not normalized: ${path}`);
        collected[path] = new Uint8Array(await readFile(join(source, path)));
      }
    }
  }
  await visit("");
  for (const path of [entrypoint, ...assetPaths]) {
    if (!Object.hasOwn(collected, path)) throw new Error(`Missing guide package source: ${path}`);
  }
  return collected;
}
