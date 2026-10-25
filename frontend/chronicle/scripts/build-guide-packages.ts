import { create, toBinary } from "@bufbuild/protobuf";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync, type Zippable } from "fflate";
import { EventMetaSchema, UnitPositionSchema } from "../src/api/proto/chronicle_pb";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const guidesDirectory = resolve(root, "public/guides");
const fixedTime = new Date("2020-01-01T00:00:00.000Z");
const guideDefinitions = [{ source: resolve(root, "src/pages/Guides/examples/onyxia"), aliases: ["onyxia"] }];
const zipOptions = { mtime: fixedTime, level: 9 } as const;

interface EntranceTrackSource {
  format: "chronicle-guide-entrance-v1";
  encounter_id: string;
  map_id: number;
  tracks: {
    id: string;
    samples: { t_ms: number; x: number; y: number; z?: number; facing?: number }[];
  }[];
}

interface GuideManifestSource {
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  game: string;
  game_version?: string;
  encounters?: string[];
  event_streams?: { type: string; path: string }[];
}

function requireMetadataString(manifest: Record<string, unknown>, field: string): string {
  const value = manifest[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Guide manifest ${String(manifest.id ?? "<unknown>")} requires non-empty ${field} metadata`);
  }
  return value;
}

function encodeVarint(value: number | bigint): Uint8Array {
  let remaining = BigInt(value);
  const bytes: number[] = [];
  while (remaining >= 0x80n) {
    bytes.push(Number(remaining & 0x7fn) | 0x80);
    remaining >>= 7n;
  }
  bytes.push(Number(remaining));
  return Uint8Array.from(bytes);
}

function concatenate(chunks: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}

function encodePayload(encounterId: string, messages: readonly Uint8Array[]): Uint8Array {
  const encounter = new TextEncoder().encode(encounterId);
  const messageData = concatenate(messages.flatMap((message) => [encodeVarint(message.byteLength), message]));
  return concatenate([
    encodeVarint(encounter.byteLength), encounter,
    encodeVarint(0),
    encodeVarint(messages.length),
    encodeVarint(messageData.byteLength),
    messageData,
  ]);
}

async function buildUnitPositionStream(sourceDirectory: string): Promise<Uint8Array> {
  const source = JSON.parse(await readFile(resolve(sourceDirectory, "entrance.json"), "utf8")) as EntranceTrackSource;
  if (source.format !== "chronicle-guide-entrance-v1") throw new Error(`Unsupported entrance source format: ${source.format}`);
  const samples = source.tracks.flatMap((track) => track.samples.map((sample) => ({ track, sample })))
    .sort((left, right) => left.sample.t_ms - right.sample.t_ms || left.track.id.localeCompare(right.track.id));
  const messages = samples.map(({ track, sample }, index) => toBinary(UnitPositionSchema, create(UnitPositionSchema, {
    meta: create(EventMetaSchema, { index, offsetMilli: BigInt(sample.t_ms), isSynthetic: true }),
    unit: track.id,
    x: sample.x,
    y: sample.y,
    mapId: source.map_id,
    ...(sample.z === undefined ? {} : { z: sample.z }),
    ...(sample.facing === undefined ? {} : { facing: sample.facing }),
  })));
  return encodePayload(source.encounter_id, messages);
}

const catalog: { catalog_version: 1; guides: Record<string, unknown>[] } = { catalog_version: 1, guides: [] };
await mkdir(guidesDirectory, { recursive: true });

for (const definition of guideDefinitions) {
  const manifestBytes = await readFile(resolve(definition.source, "guide.json"));
  const manifest = JSON.parse(manifestBytes.toString("utf8")) as GuideManifestSource;
  const id = requireMetadataString(manifest as unknown as Record<string, unknown>, "id");
  const name = requireMetadataString(manifest as unknown as Record<string, unknown>, "name");
  const description = requireMetadataString(manifest as unknown as Record<string, unknown>, "description");
  const author = requireMetadataString(manifest as unknown as Record<string, unknown>, "author");
  const version = requireMetadataString(manifest as unknown as Record<string, unknown>, "version");
  const game = requireMetadataString(manifest as unknown as Record<string, unknown>, "game");
  if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(id)) throw new Error(`Guide manifest has unsafe id metadata: ${id}`);

  const files: Zippable = {
    "guide.json": [new Uint8Array(manifestBytes), zipOptions],
    "main.lua": [new Uint8Array(await readFile(resolve(definition.source, "main.lua"))), zipOptions],
  };
  for (const stream of manifest.event_streams ?? []) {
    if (stream.type !== "unit_position") throw new Error(`Guide builder does not support stream ${stream.type}`);
    files[stream.path] = [await buildUnitPositionStream(definition.source), zipOptions];
  }
  const archive = zipSync(files, zipOptions);
  const output = resolve(guidesDirectory, `${id}.zip`);
  await writeFile(output, archive);
  console.log(`Wrote ${archive.byteLength} bytes to ${output}`);

  catalog.guides.push({ id, aliases: definition.aliases, package_url: `/guides/${id}.zip`, name, description, author, version, game,
    game_version: manifest.game_version, encounters: manifest.encounters ?? [] });
}

await writeFile(resolve(guidesDirectory, "catalog.json"), `${JSON.stringify(catalog, null, 2)}\n`);
