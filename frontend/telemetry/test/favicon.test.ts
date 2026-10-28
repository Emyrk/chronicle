import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { FAVICON_PNG_BASE64 } from "../src/favicon.ts";

test("defines the blue Chronicle C telemetry favicon", () => {
  const bytes = Buffer.from(FAVICON_PNG_BASE64, "base64");

  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.ok(bytes.length > 10_000);
});

test("serves and uses the telemetry favicon", async () => {
  const indexSource = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");

  assert.match(indexSource, /app\.get\("\/favicon\.png"/);
  assert.match(indexSource, /<link rel="icon" href="\/favicon\.png" type="image\/png" \/>/);
});
