import assert from "node:assert/strict";
import test from "node:test";
import { discoverServers } from "../src/hooks/useDiscovery.ts";

const baseline = [
  {
    id: "oldmanwarcraft",
    name: "Old Man Warcraft",
    tagline: "",
    description: "",
    logo: "",
    expansion: "wotlk",
    client: "3.3.5a",
    logging: "server",
    engine: "azerothcore",
    chronicleUrl: "https://logs.oldmanwarcraft.com",
  },
];

const entry = (host, name) => ({
  url: `https://${host}`,
  branding: name ? { display_name: name, tags: ["Vanilla"] } : undefined,
  instances_14d: 5,
});

/** Replaces fetch for one test; returns the recorded calls. */
function stubFetch(t, respond) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return respond(url, init);
  };
  t.after(() => {
    globalThis.fetch = original;
  });
  return calls;
}

const json = (body, init) => new Response(JSON.stringify(body), { status: 200, ...init });

test("lists every discovered server on top of the baseline, sending the landing origin", async (t) => {
  const calls = stubFetch(t, () =>
    json([entry("forever.example.com", "WoW Forever"), entry("kronos.example.com", "Kronos"), entry("logs.oldmanwarcraft.com", "OMW")]),
  );
  const servers = await discoverServers(baseline, ["https://legacy.example.com"]);
  assert.deepEqual(servers.map((server) => server.id), ["oldmanwarcraft", "forever", "kronos"]);
  assert.equal(servers[0].name, "OMW", "a baseline entry is enriched, not duplicated");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://legacy.example.com/api/v1/discovery");
  assert.equal(calls[0].init.headers.Origin, "https://chronicleclassic.com");
  assert.equal(calls[0].init.headers.Referer, "https://chronicleclassic.com/");
});

test("returns the baseline untouched when there is nothing to discover", async () => {
  assert.equal(await discoverServers(baseline, []), baseline);
});

test("fails the build on a 403 instead of falling back to the baseline", async (t) => {
  stubFetch(t, () => new Response("Forbidden, only browser requests from https://chronicleclassic.com are allowed", { status: 403, headers: { server: "cloudflare" } }));
  await assert.rejects(
    discoverServers(baseline, ["https://legacy.example.com"]),
    /returned HTTP 403 \(cloudflare\): Forbidden, only browser requests/,
  );
});

test("fails the build when the request itself fails", async (t) => {
  stubFetch(t, () => {
    throw new TypeError("fetch failed");
  });
  await assert.rejects(discoverServers(baseline, ["https://legacy.example.com"]), /request to https:\/\/legacy\.example\.com\/api\/v1\/discovery failed: TypeError: fetch failed/);
});

test("fails the build on invalid, non-array, or empty responses", async (t) => {
  for (const [body, message] of [
    ["<html>challenge</html>", /invalid JSON/],
    [JSON.stringify({ error: "nope" }), /expected an array/],
    [JSON.stringify([]), /returned no servers/],
  ]) {
    stubFetch(t, () => new Response(body, { status: 200 }));
    await assert.rejects(discoverServers(baseline, ["https://legacy.example.com"]), message);
  }
});

test("fails the build when any one discovery source fails", async (t) => {
  stubFetch(t, (url) => (String(url).includes("bad") ? new Response("no", { status: 502 }) : json([entry("forever.example.com", "WoW Forever")])));
  await assert.rejects(discoverServers(baseline, ["https://good.example.com", "https://bad.example.com"]), /HTTP 502/);
});

test("leaves a discovered server without a display name out, with a warning", async (t) => {
  stubFetch(t, () => json([entry("forever.example.com", "WoW Forever"), entry("nameless.example.com")]));
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (message) => warnings.push(message);
  t.after(() => {
    console.warn = originalWarn;
  });
  const servers = await discoverServers(baseline, ["https://legacy.example.com"]);
  assert.deepEqual(servers.map((server) => server.id), ["oldmanwarcraft", "forever"]);
  assert.match(warnings.join("\n"), /nameless\.example\.com/);
});
