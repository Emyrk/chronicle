import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const guidesDirectory = resolve(root, "public/guides");
const fixedTime = new Date("2020-01-01T00:00:00.000Z");
const guideDefinitions = [
  {
    source: resolve(root, "src/pages/Guides/examples/onyxia"),
    aliases: ["onyxia"],
  },
];

function requireMetadataString(manifest, field) {
  const value = manifest[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Guide manifest ${manifest.id ?? "<unknown>"} requires non-empty ${field} metadata`);
  }
  return value;
}

const catalog = { catalog_version: 1, guides: [] };
await mkdir(guidesDirectory, { recursive: true });

for (const definition of guideDefinitions) {
  const manifestBytes = await readFile(resolve(definition.source, "guide.json"));
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const id = requireMetadataString(manifest, "id");
  const name = requireMetadataString(manifest, "name");
  const description = requireMetadataString(manifest, "description");
  const author = requireMetadataString(manifest, "author");
  const version = requireMetadataString(manifest, "version");
  const game = requireMetadataString(manifest, "game");
  if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(id)) {
    throw new Error(`Guide manifest has unsafe id metadata: ${id}`);
  }
  const output = resolve(guidesDirectory, `${id}.zip`);
  const files = {
    "guide.json": [new Uint8Array(manifestBytes), { mtime: fixedTime, level: 9 }],
    "main.lua": [new Uint8Array(await readFile(resolve(definition.source, "main.lua"))), { mtime: fixedTime, level: 9 }],
  };
  const archive = zipSync(files, { mtime: fixedTime, level: 9 });
  await writeFile(output, archive);
  console.log(`Wrote ${archive.byteLength} bytes to ${output}`);

  catalog.guides.push({
    id,
    aliases: definition.aliases,
    package_url: `/guides/${id}.zip`,
    name,
    description,
    author,
    version,
    game,
    game_version: manifest.game_version,
    encounters: manifest.encounters ?? [],
  });
}

await writeFile(
  resolve(guidesDirectory, "catalog.json"),
  `${JSON.stringify(catalog, null, 2)}\n`,
);
