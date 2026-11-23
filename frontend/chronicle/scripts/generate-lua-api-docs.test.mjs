import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { generateLuaAPIDocs } from "./generate-lua-api-docs.mjs";

const stub = await readFile(new URL("../src/pages/LuaProjects/lua-panel-api.d.lua", import.meta.url), "utf8");
const docs = await readFile(new URL("../src/pages/LuaProjects/lua-panel-api.md", import.meta.url), "utf8");
const block = (topic) => `<!-- BEGIN GENERATED LUA API REFERENCE: ${topic} -->\nstale\n<!-- END GENERATED LUA API REFERENCE: ${topic} -->`;

test("canonical topics are current, deterministic, and contain every signature exactly once", () => {
  const generated = generateLuaAPIDocs(stub, docs);
  assert.equal(generated, docs);
  assert.equal(generateLuaAPIDocs(stub, generated), generated);
  const declared = [...stub.matchAll(/^function\s+([^ (]+)\(/gm)].map((m) => m[1]).sort();
  const documented = [...generated.matchAll(/^#### `([^ (]+)\(/gm)].map((m) => m[1]).sort();
  assert.deepEqual(documented, declared);
  assert.equal(new Set(documented).size, documented.length);
  // No source prose is rewritten by generation, and every generated block
  // belongs to the canonical topic that contains it.
  const topics = generated.split(/^<!-- LUA API TOPIC: /m).slice(1);
  assert.equal(topics.length, 12);
  for (const topic of topics) {
    const id = topic.split(" | ")[0];
    for (const match of topic.matchAll(/^<!-- BEGIN GENERATED LUA API REFERENCE: ([a-z0-9-]+) -->/gm)) {
      assert.equal(match[1], id);
    }
  }
});

test("generation replaces only signature blocks and preserves prose and examples", () => {
  const source = `# Intro\n\nExample:\n\n\`\`\`lua\nprint('hello')\n\`\`\`\n\n${block("ui-foundations")}\n\nKeep this suffix.\n`;
  const result = generateLuaAPIDocs("--- Create a frame.\nfunction CreateFrame() end\n", source);
  assert.equal(result.slice(0, result.indexOf("<!-- BEGIN")), source.slice(0, source.indexOf("<!-- BEGIN")));
  assert.ok(result.endsWith("\n\nKeep this suffix.\n"));
  assert.ok(result.includes("#### `CreateFrame()`\n\nCreate a frame."));
});

test("generation refuses incomplete, duplicated, or unknown assignments", () => {
  const global = "function CreateFrame() end\n";
  assert.throws(() => generateLuaAPIDocs(global, "missing"), /Missing generated/);
  assert.throws(() => generateLuaAPIDocs(global, block("ui-foundations") + "\n" + block("ui-foundations")), /Duplicate/);
  assert.throws(() => generateLuaAPIDocs(global, block("unknown")), /Unknown generated/);
  assert.throws(() => generateLuaAPIDocs("---@class Unknown\nfunction Unknown:method() end\n", ""), /No Lua API topic assigned/);
  assert.throws(() => generateLuaAPIDocs("---@class Chronicle\nfunction Chronicle.NewAPI() end\n", ""), /No Lua API topic assigned/);
  assert.throws(() => generateLuaAPIDocs(global, block("ui-foundations") + "\n<!-- BEGIN GENERATED LUA API REFERENCE: stray -->"), /Invalid generated/);
});
