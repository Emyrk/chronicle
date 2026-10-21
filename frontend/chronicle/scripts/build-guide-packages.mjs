import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "src/pages/Guides/examples/onyxia");
const output = resolve(root, "public/guides/chronicle.onyxia.zip");
const fixedTime = new Date("2020-01-01T00:00:00.000Z");

const files = {};
for (const name of ["guide.json", "main.lua"]) {
  files[name] = [new Uint8Array(await readFile(resolve(source, name))), { mtime: fixedTime, level: 9 }];
}

const archive = zipSync(files, { mtime: fixedTime, level: 9 });
await mkdir(dirname(output), { recursive: true });
await writeFile(output, archive);
console.log(`Wrote ${archive.byteLength} bytes to ${output}`);
