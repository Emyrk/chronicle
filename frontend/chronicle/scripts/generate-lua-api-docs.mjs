import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const stubPath = `${root}/src/pages/LuaProjects/lua-panel-api.d.lua`;
const docsPath = `${root}/src/pages/LuaProjects/lua-panel-api.md`;
const begin = "<!-- BEGIN GENERATED LUA API REFERENCE -->";
const end = "<!-- END GENERATED LUA API REFERENCE -->";

const stub = await readFile(stubPath, "utf8");
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
    classes.set(className, { name: className, parent: classMatch[2] ?? null, functions: [] });
    resetAnnotations();
    continue;
  }
  const descriptionMatch = line.match(/^---(?!@)(.*)$/);
  if (descriptionMatch) {
    description.push(descriptionMatch[1].trim());
    continue;
  }
  const paramMatch = line.match(/^---@param\s+(\w+\??)\s+(\S+)(?:\s+(.*))?$/);
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
      signature: `${owner ? `${owner}${separator}` : ""}${name}(${args.join(", ")})`,
      description: description.join(" "),
      params,
      returns,
    };
    functions.push(fn);
    if (owner && classes.has(owner)) classes.get(owner).functions.push(fn);
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

const output = [
  begin,
  "<!-- Do not edit this section by hand. Edit lua-panel-api.d.lua and run pnpm generate:lua-api. -->",
  "## Generated Lua API reference",
  "",
  "Every global and method below comes from `lua-panel-api.d.lua`, the [EmmyLua/LuaLS](https://luals.github.io/wiki/annotations/) definition file behind the **LuaLS definitions** button. Signatures use LuaLS notation: `name: type`, and a parameter ending in `?` is optional.",
  "",
];
const globals = functions.filter((fn) => !fn.owner);
if (globals.length) {
  output.push("### Globals", "", ...globals.map(renderFunction));
}
for (const value of classes.values()) {
  if (!value.functions.length) continue;
  output.push(`### \`${value.name}\`${value.parent ? ` extends \`${value.parent}\`` : ""}`, "", ...value.functions.map(renderFunction));
}
output.push(end);
const generated = output.join("\n").replace(/\n{3,}/g, "\n\n");

const docs = await readFile(docsPath, "utf8");
const start = docs.indexOf(begin);
const finish = docs.indexOf(end);
if (start < 0 || finish < start) throw new Error(`Missing generated documentation markers in ${docsPath}`);
const next = `${docs.slice(0, start)}${generated}${docs.slice(finish + end.length)}`;
if (process.argv.includes("--check")) {
  if (next !== docs) {
    console.error("Lua API documentation is stale. Run pnpm generate:lua-api.");
    process.exit(1);
  }
} else {
  await writeFile(docsPath, next);
}
