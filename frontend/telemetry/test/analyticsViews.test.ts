import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { transform } from "esbuild";
import { createMockAnalyticsDashboard } from "../src/analytics/mock.ts";

async function loadViews() {
  const source = await readFile(
    new URL("../src/dashboard/analyticsViews.ts", import.meta.url),
    "utf8",
  );
  const code = ts
    .transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ES2022,
      },
    })
    .outputText.replace('"hono"', JSON.stringify(import.meta.resolve("hono")))
    .replace(
      '"../analytics/comparison"',
      JSON.stringify(
        new URL("../src/analytics/comparison.ts", import.meta.url).href,
      ),
    );
  return (
    await import(
      "data:text/javascript;base64," + Buffer.from(code).toString("base64")
    )
  ).default;
}
test("fixed views are private and not mounted on public paths, inline script compiles", async () => {
  const views = await loadViews();
  for (const path of ["", "/pages", "/growth"]) {
    const response = await views.request(
      "https://test/internal/analytics" + path,
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    const html = await response.text();
    const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
    assert.doesNotThrow(() => new Function(script));
    assert.match(html, /Exact domains/);
    assert.match(html, /\/internal\/api\/v1\/analytics\/dashboard/);
    assert.equal(
      (await views.request("https://test/analytics" + path)).status,
      404,
    );
  }
  assert.equal(
    (await views.request("https://test/dashboard-v2:any")).status,
    404,
  );
});
test("comparison serialized by Wrangler's name-preserving bundler is executable", async () => {
  const source = await readFile(
    new URL("../src/analytics/comparison.ts", import.meta.url),
    "utf8",
  );
  const built = await transform(source, {
    loader: "ts",
    format: "esm",
    keepNames: true,
  });
  const module = await import(
    "data:text/javascript;base64," + Buffer.from(built.code).toString("base64")
  );
  const compare = new Function(
    "const __name = target => target; return (" +
      module.compareDashboard.toString() +
      ");",
  )();
  const data = createMockAnalyticsDashboard(7);
  assert.equal(
    compare(
      data,
      data.hosts.map((h) => h.hostname),
    ).series.length,
    data.hosts.length,
  );
});
test("existing API and device use the same loader behind Access-protected namespaces", async () => {
  const index = await readFile(
    new URL("../src/index.ts", import.meta.url),
    "utf8",
  );
  assert.match(index, /app.route\("\/", analyticsViews\)/);
  for (const route of ["analytics", "device"]) {
    const source = await readFile(
      new URL("../src/routes/" + route + ".ts", import.meta.url),
      "utf8",
    );
    assert.match(source, /fetchAnalyticsDashboard\(c.env, requestedDays\)/);
    assert.match(
      source,
      route === "analytics"
        ? /\/internal\/api\/v1\/analytics\/dashboard/
        : /\/device\/api\/v1\/analytics\/dashboard/,
    );
  }
});

test("All domains stays implicit across period loads, explicit selections remain explicit", async () => {
  const views = await loadViews();
  const html = await (
    await views.request("https://test/internal/analytics")
  ).text();
  const script = html
    .match(/<script>([\s\S]*?)<\/script>/)![1]
    .replace(/load\(\);\s*$/, "");
  for (const search of [
    "?days=7",
    "?days=7&domain=octo.chronicleclassic.com",
  ]) {
    const elements = new Map<string, any>();
    const element = (id: string) => {
      if (!elements.has(id))
        elements.set(id, {
          value: "7",
          innerHTML: "",
          textContent: "",
          addEventListener() {},
        });
      return elements.get(id);
    };
    const document = { getElementById: element, querySelectorAll: () => [] };
    let url = "";
    let data = createMockAnalyticsDashboard(7);
    const browser = new Function(
      "document",
      "location",
      "history",
      "fetch",
      script +
        "; return { load, selection: () => selected, explicit: () => explicit };",
    )(
      document,
      { search, pathname: "/internal/analytics" },
      {
        replaceState: (_a: unknown, _b: unknown, value: string) => {
          url = value;
        },
      },
      async () => Response.json(data),
    );
    await browser.load();
    assert.equal(
      new URL(url, "https://test").searchParams.has("domain"),
      search.includes("domain"),
    );
    data.hosts.push({ ...data.hosts[0], hostname: "new.chronicleclassic.com" });
    element("days").value = "30";
    await browser.load();
    assert.equal(
      browser.selection().includes("new.chronicleclassic.com"),
      !search.includes("domain"),
    );
    element("all").onclick();
    assert.equal(browser.explicit(), false);
    assert.equal(
      new URL(url, "https://test").searchParams.has("domain"),
      false,
    );
    element("none").onclick();
    assert.equal(new URL(url, "https://test").searchParams.get("domain"), "");
    assert.equal(browser.explicit(), true);
  }
});
