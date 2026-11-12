import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const telemetryRoot = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));

async function transpile(source: string, destination: string): Promise<void> {
  const input = await readFile(join(telemetryRoot, source), "utf8");
  const output = ts.transpileModule(input, {
    compilerOptions: {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.ReactJSX,
      jsxImportSource: "hono/jsx",
    },
  }).outputText.replace('"./mapBundle"', '"./mapBundle.mjs"');
  await writeFile(destination, output);
}

test("Map Foundry renders a syntactically valid browser script", async () => {
  const directory = await mkdtemp(join(telemetryRoot, ".maps-dashboard-test-"));
  try {
    await transpile("src/dashboard/mapBundle.ts", join(directory, "mapBundle.mjs"));
    await transpile("src/dashboard/maps.tsx", join(directory, "maps.mjs"));

    const { default: mapsDashboard } = await import(pathToFileURL(join(directory, "maps.mjs")).href);
    const response = await mapsDashboard.request("http://example.test/internal/maps");
    const page = await response.text();
    const scripts = [...page.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
    const browserScript = scripts.at(-1)?.[1];

    assert.ok(browserScript);
    assert.doesNotThrow(() => new Function(browserScript));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
