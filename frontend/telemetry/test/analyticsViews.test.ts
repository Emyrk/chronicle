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

test("shared chart tooltip tracks plot-wide pointer and keyboard input through SVG transforms", async () => {
  const views = await loadViews();
  const html = await (
    await views.request("https://test/internal/analytics")
  ).text();
  const script = html
    .match(/<script>([\s\S]*?)<\/script>/)![1]
    .replace(/load\(\);\s*$/, "");
  const elements = new Map<string, any>();
  const document = {
    getElementById(id: string) {
      if (!elements.has(id))
        elements.set(id, { value: "7", addEventListener() {} });
      return elements.get(id);
    },
  };
  const { bindChart, chart } = new Function(
    "document",
    "location",
    script + "; return { bindChart, chart };",
  )(document, { search: "", pathname: "/internal/analytics" });
  const state = {
    dates: ["2025-01-01", "2025-01-02", "2025-01-03"],
    series: [
      { hostname: "<domain>", values: [0, 125, 250] },
      { hostname: "new.example", values: [null, null, null] },
    ],
    normalizedScale: false,
  };
  const markup = chart(state.series, state.dates);
  assert.match(markup, /tabindex="0"/);
  assert.match(markup, /class="chart-highlight"/);
  const listeners = new Map<string, (event?: any) => void>();
  const tooltip = {
    hidden: true,
    textContent: "",
    offsetWidth: 180,
    style: { left: "" },
  };
  const highlight = { innerHTML: "", style: { display: "none" } };
  // 0.5x responsive scale and a vertical letterbox offset, not raw client bounds.
  let transform = { scale: 0.5, x: 100, y: 225 };
  const svg = {
    parentElement: {
      querySelector: () => tooltip,
      getBoundingClientRect: () => ({ left: 100, width: 500 }),
    },
    querySelector: () => highlight,
    addEventListener: (name: string, callback: (event?: any) => void) =>
      listeners.set(name, callback),
    getScreenCTM: () => ({
      ...transform,
      inverse: () => ({
        scale: 1 / transform.scale,
        x: -transform.x / transform.scale,
        y: -transform.y / transform.scale,
      }),
    }),
    createSVGPoint: () => ({
      x: 0,
      y: 0,
      matrixTransform(matrix: typeof transform) {
        return {
          x: this.x * matrix.scale + matrix.x,
          y: this.y * matrix.scale + matrix.y,
        };
      },
    }),
  };
  bindChart(svg, state);
  listeners.get("pointermove")!({ clientX: 362.5, clientY: 300 });
  assert.equal(tooltip.hidden, false);
  assert.equal(
    tooltip.textContent,
    "2025-01-02\n<domain>: 125 page views\nnew.example: No baseline",
  );
  assert.match(highlight.innerHTML, /x1="525"/);
  assert.match(highlight.innerHTML, /r="5"/);
  assert.equal(tooltip.style.left, "274.5px");
  assert.equal(highlight.style.display, "");
  listeners.get("pointerleave")!();
  assert.equal(tooltip.hidden, true);
  assert.equal(highlight.style.display, "none");
  // Recompute the CTM on every event, including after a responsive resize.
  transform = { scale: 0.25, x: 200, y: 100 };
  state.normalizedScale = true;
  bindChart(svg, state);
  listeners.get("pointermove")!({ clientX: 446.25, clientY: 140 });
  assert.match(
    tooltip.textContent,
    /2025-01-03\n<domain>: 250% of previous daily average/,
  );
  assert.equal(tooltip.style.left, "320px");
  listeners.get("pointermove")!({ clientX: 200, clientY: 100 });
  assert.equal(tooltip.hidden, true); // viewBox margin, outside plotting area
  listeners.get("focus")!();
  assert.equal(tooltip.hidden, false);
  let prevented = 0;
  const key = (key: string) =>
    listeners.get("keydown")!({
      key,
      preventDefault() {
        prevented++;
      },
    });
  key("Home");
  assert.match(tooltip.textContent, /2025-01-01\n<domain>: 0%/);
  key("ArrowLeft"); // clamp at first date
  assert.match(tooltip.textContent, /^2025-01-01/);
  key("ArrowRight");
  assert.match(tooltip.textContent, /^2025-01-02/);
  key("End");
  key("ArrowRight"); // clamp at last date
  assert.match(tooltip.textContent, /^2025-01-03/);
  assert.equal(prevented, 5);
  key("Escape");
  assert.equal(tooltip.hidden, true);
  listeners.get("focus")!();
  listeners.get("blur")!();
  assert.equal(tooltip.hidden, true);
});

test("domain headers sort underlying metrics, toggle direction and retain nulls last", async () => {
  const views = await loadViews();
  const html = await (
    await views.request("https://test/internal/analytics")
  ).text();
  const script = html
    .match(/<script>([\s\S]*?)<\/script>/)![1]
    .replace(/load\(\);\s*$/, "");
  const elements = new Map<string, any>();
  const document = {
    getElementById(id: string) {
      if (!elements.has(id))
        elements.set(id, { value: "7", addEventListener() {} });
      return elements.get(id);
    },
  };
  const browser = new Function(
    "document",
    "location",
    script +
      "; return { sortDomains, toggleDomainSort, growthPercent, metricCell, table, domainColumns };",
  )(document, { search: "", pathname: "/internal/analytics" });
  const metric = (value: number, previous: number) => ({
    value,
    previous,
    changePercent: ((value - previous) / previous) * 100,
  });
  const hosts = [
    {
      hostname: "z.example",
      pageViews: 1000,
      previousPageViews: 20,
      share: 0.8,
      delta: 980,
      percent: 4900,
      metrics: {
        activeUsers: metric(20, 9999),
        sessions: metric(4, 9999),
        engagedSessions: metric(2, 99),
      },
    },
    {
      hostname: "a.example",
      pageViews: 90,
      previousPageViews: 100,
      share: 0.2,
      delta: -10,
      percent: -10,
      metrics: {
        activeUsers: metric(100, 1),
        sessions: metric(30, 1),
        engagedSessions: metric(10, 1),
      },
    },
    {
      hostname: "empty.example",
      pageViews: 0,
      previousPageViews: 0,
      share: 0,
      delta: 0,
      percent: null,
      metrics: { activeUsers: null, sessions: null, engagedSessions: null },
    },
  ];
  const names = () => browser.sortDomains(hosts).map((h: any) => h.hostname);
  assert.deepEqual(names(), ["z.example", "a.example", "empty.example"]);
  // Every arbitrary column toggles both ways. Metric sort uses current value,
  // not formatted number text, previous counts, or percentage changes.
  for (let column = 0; column < 9; column++) {
    browser.toggleDomainSort(column);
    const ascending = names();
    browser.toggleDomainSort(column);
    const descending = names();
    if (column >= 5) {
      assert.equal(ascending.at(-1), "empty.example");
      assert.equal(descending.at(-1), "empty.example");
      assert.deepEqual(ascending.slice(0, 2), descending.slice(0, 2).reverse());
    } else assert.deepEqual(ascending, [...descending].reverse());
    if (column === 0)
      assert.deepEqual(ascending, ["a.example", "empty.example", "z.example"]);
    if (column >= 6)
      assert.deepEqual(ascending, ["z.example", "a.example", "empty.example"]);
    assert.deepEqual(
      hosts.map((h) => h.hostname),
      ["z.example", "a.example", "empty.example"],
    ); // never mutate input
  }
  const headers = browser.table(browser.domainColumns, [], true);
  assert.match(headers, /aria-sort="descending".*data-domain-sort="8"/);
  assert.match(headers, /aria-hidden="true">↓/);
  assert.equal((headers.match(/data-domain-sort=/g) ?? []).length, 9);
  // Filtering and regenerating table markup don't reset the retained sort.
  assert.equal(browser.sortDomains(hosts.slice(0, 2))[0].hostname, "a.example");
  for (const [value, style] of [
    [null, "neutral"],
    [0, "neutral"],
    [-10, "negative"],
    [1, "positive"],
    [24.9, "positive"],
    [25, "strong"],
    [99.9, "strong"],
    [100, "high"],
    [200, "high"],
  ]) {
    assert.match(
      browser.growthPercent(value),
      new RegExp('class="growth-' + style + '"'),
    );
  }
  assert.match(browser.metricCell(metric(24247, 16847)), /growth-strong/);
  assert.match(browser.metricCell(metric(5, 10)), /growth-negative/);
  assert.match(
    browser.metricCell({ value: 10, previous: 0, changePercent: null }),
    /growth-neutral">No baseline/,
  );
});
