import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const stubPath = `${root}/src/pages/LuaProjects/lua-panel-api.d.lua`;
const docsPath = `${root}/src/pages/LuaProjects/lua-panel-api.md`;
// Prose and generated signatures live together in explicit topic blocks.
// New API owners or Chronicle functions need an intentional topic assignment.
const ownerTopics = {
  globals: "ui-foundations",
  ChronicleRegion: "ui-foundations",
  ChronicleFrame: "ui-foundations",
  ChronicleFontString: "text-textures-interaction",
  ChronicleTexture: "text-textures-interaction",
  ChronicleButton: "text-textures-interaction",
  ChronicleBreakout: "breakout-panels",
  ChroniclePlayerMetricChart: "player-metric-charts",
  ChronicleLineChart: "line-charts",
  ChronicleCanvas: "canvas",
  Panel: "events",
};
const functionTopics = {
  "Chronicle.GetUnit": "units",
  "Chronicle.GetPlayers": "units",
  "Chronicle.Filter": "project-configuration",
  "Chronicle.GetSpell": "text-textures-interaction",
  "Chronicle.SetTimeRange": "time-replay",
  "Chronicle.ClearTimeRange": "time-replay",
  "Chronicle.OnTimeRangeChanged": "time-replay",
  "Chronicle.GetTimeRange": "time-replay",
  "Chronicle.GetReplayTime": "time-replay",
  "Chronicle.OnReplayTime": "time-replay",
  "Chronicle.SetReplayTime": "time-replay",
};

export function generateLuaAPIDocs(stub, docs) {
  const classes = new Map();
  const functions = [];
  let description = [];
  let params = [];
  let returns = [];

  function resetAnnotations() {
    description = [];
    params = [];
    returns = [];
  }

  for (const line of stub.split("\n")) {
    const classMatch = line.match(/^---@class\s+(\w+)(?::\s*(\w+))?/);
    if (classMatch) {
      const className = classMatch[1];
      classes.set(className, { name: className, parent: classMatch[2] ?? null });
      resetAnnotations();
      continue;
    }
    const descriptionMatch = line.match(/^---(?!@)(.*)$/);
    if (descriptionMatch) {
      description.push(descriptionMatch[1].trim());
      continue;
    }
    // fun(...) types contain spaces, so match them up to their closing parenthesis.
    const paramMatch = line.match(/^---@param\s+(\w+\??)\s+(fun\([^)]*\)|\S+)(?:\s+(.*))?$/);
    if (paramMatch) {
      params.push({ name: paramMatch[1], type: paramMatch[2], description: paramMatch[3] ?? "" });
      continue;
    }
    const returnMatch = line.match(/^---@return\s+(\S+)(?:\s+(.*))?$/);
    if (returnMatch) {
      returns.push({ type: returnMatch[1], description: returnMatch[2] ?? "" });
      continue;
    }
    const functionMatch = line.match(/^function\s+(?:(\w+)(:|\.))?(\w+)\((.*)\)\s+end$/);
    if (functionMatch) {
      const owner = functionMatch[1] ?? null;
      const separator = functionMatch[2] ?? "";
      const name = functionMatch[3];
      // LuaLS-style signature: optional parameters end in "?", and annotated types follow a colon.
      const annotated = new Map(params.map((param) => [param.name.replace(/\?$/, ""), param]));
      const args = functionMatch[4].split(",").map((arg) => arg.trim()).filter(Boolean).map((arg) => {
        const param = annotated.get(arg);
        return param ? `${param.name}: ${param.type}` : arg;
      });
      const fn = {
        owner,
        key: `${owner ? `${owner}${separator}` : ""}${name}`,
        signature: `${owner ? `${owner}${separator}` : ""}${name}(${args.join(", ")})`,
        description: description.join(" "),
        params,
        returns,
      };
      functions.push(fn);
      resetAnnotations();
      continue;
    }
    if (line.trim() && !line.startsWith("local ") && !line.startsWith("---@") && !line.startsWith("--")) resetAnnotations();
  }

  const renderFunction = (fn) => {
    const lines = [`#### \`${fn.signature}\``, "", fn.description || "No description.", ""];
    // Types are in the signature; list only the parameters that say more than their type.
    const described = fn.params.filter((param) => param.description);
    if (described.length) {
      lines.push(...described.map((param) => `- \`${param.name.replace(/\?$/, "")}\`: ${param.description}`), "");
    }
    if (fn.returns.length) {
      // Outside a table "|" needs no escaping; escaping it would show the backslash.
      lines.push("**Returns:** " + fn.returns.map((value) => `\`${value.type}\`${value.description ? ` ${value.description}` : ""}`).join("; "), "");
    }
    return lines.join("\n");
  };

  const byTopic = new Map();
  for (const fn of functions) {
    const topic = functionTopics[fn.key] ?? ownerTopics[fn.owner ?? "globals"];
    if (!topic) throw new Error(`No Lua API topic assigned for ${fn.key}`);
    if (!byTopic.has(topic)) byTopic.set(topic, []);
    byTopic.get(topic).push(fn);
  }
  const rendered = new Set();
  const block = /^<!-- BEGIN GENERATED LUA API REFERENCE: ([a-z0-9-]+) -->\n[\s\S]*?^<!-- END GENERATED LUA API REFERENCE: \1 -->/gm;
  const next = docs.replace(block, (_, topic) => {
    if (rendered.has(topic)) throw new Error(`Duplicate generated Lua API topic: ${topic}`);
    const selected = byTopic.get(topic);
    if (!selected) throw new Error(`Unknown generated Lua API topic: ${topic}`);
    rendered.add(topic);
    const output = [
      `<!-- BEGIN GENERATED LUA API REFERENCE: ${topic} -->`,
      "<!-- Do not edit this block by hand. Edit lua-panel-api.d.lua and run pnpm generate:lua-api. -->",
      "",
    ];
    const globals = selected.filter((fn) => !fn.owner);
    if (globals.length) output.push("### Globals", "", ...globals.map(renderFunction));
    for (const value of classes.values()) {
      const methods = selected.filter((fn) => fn.owner === value.name);
      if (!methods.length) continue;
      output.push(`### \`${value.name}\`${value.parent ? ` extends \`${value.parent}\`` : ""}`, "", ...methods.map(renderFunction));
    }
    // A declaration with an unknown class must not silently disappear.
    for (const fn of selected) {
      if (fn.owner && !classes.has(fn.owner)) throw new Error(`Missing Lua API class: ${fn.owner}`);
    }
    output.push(`<!-- END GENERATED LUA API REFERENCE: ${topic} -->`);
    return output.join("\n").replace(/\n{3,}/g, "\n\n");
  });
  for (const topic of byTopic.keys()) {
    if (!rendered.has(topic)) throw new Error(`Missing generated Lua API topic block: ${topic}`);
  }
  // Reject malformed/unpaired markers too, rather than silently leaving stale docs.
  if ((docs.match(/^<!-- (?:BEGIN|END) GENERATED LUA API REFERENCE/gm) ?? []).length !== rendered.size * 2) {
    throw new Error("Invalid generated Lua API topic markers");
  }
  return next;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const docs = await readFile(docsPath, "utf8");
  const next = generateLuaAPIDocs(await readFile(stubPath, "utf8"), docs);
  if (process.argv.includes("--check")) {
    if (next !== docs) {
      console.error("Lua API documentation is stale. Run pnpm generate:lua-api.");
      process.exit(1);
    }
  } else {
    await writeFile(docsPath, next);
  }
}
