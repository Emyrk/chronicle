import { Hono } from "hono";
import type { Env } from "../types";
import { compareDashboard } from "../analytics/comparison";

const views = new Hono<{ Bindings: Env }>();
for (const [path, title] of [
  ["", "Overview"],
  ["/pages", "Popular pages"],
  ["/growth", "Growth"],
]) {
  views.get(`/internal/analytics${path}`, (c) => {
    c.header("Cache-Control", "private, no-store");
    return c.html(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${title} · Chronicle Analytics</title>
    <link
      href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Manrope:wght@400;600;800&display=swap"
      rel="stylesheet"
    />
    <style>
      :root {
        color-scheme: dark;
        --bg: #101516;
        --panel: #192123;
        --line: #314044;
        --ink: #e8f1f0;
        --muted: #9dafb1;
        --accent: #79c4d7;
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        background:
          radial-gradient(at 90% 0, #263f45, transparent 50%), var(--bg);
        color: var(--ink);
        font:
          14px Manrope,
          sans-serif;
      }
      main {
        max-width: 1480px;
        margin: auto;
        padding: 32px;
      }
      a {
        color: var(--accent);
      }
      nav {
        display: flex;
        gap: 20px;
        flex-wrap: wrap;
        border-bottom: 1px solid var(--line);
        padding-bottom: 20px;
      }
      nav a {
        color: var(--muted);
        text-decoration: none;
      }
      nav a[aria-current="page"] {
        color: var(--accent);
        border-bottom: 2px solid var(--accent);
      }
      h1 {
        font-size: clamp(36px, 5vw, 60px);
        letter-spacing: -0.05em;
        margin: 24px 0 8px;
      }
      h2 {
        font-size: 18px;
      }
      p,
      .muted {
        color: var(--muted);
      }
      .eyebrow {
        font:
          11px "IBM Plex Mono",
          monospace;
        letter-spacing: 0.18em;
        color: var(--accent);
        margin-top: 30px;
      }
      .controls {
        display: flex;
        gap: 20px;
        align-items: start;
        flex-wrap: wrap;
        margin: 24px 0;
      }
      select,
      button {
        background: var(--panel);
        color: var(--ink);
        border: 1px solid var(--line);
        padding: 8px;
        border-radius: 4px;
        font: inherit;
      }
      button {
        cursor: pointer;
      }
      button:hover {
        border-color: var(--accent);
      }
      fieldset {
        border: 1px solid var(--line);
        border-radius: 5px;
        flex: 1;
        min-width: 260px;
      }
      #domains {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
        padding: 8px;
      }
      label {
        cursor: pointer;
      }
      input {
        accent-color: var(--accent);
      }
      .cards {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
        gap: 14px;
      }
      .card,
      section {
        background: var(--panel);
        border: 1px solid var(--line);
        padding: 20px;
        border-radius: 8px;
        margin-bottom: 20px;
      }
      .card strong {
        display: block;
        font-size: 32px;
        margin: 12px 0;
        font-weight: 800;
      }
      .card small {
        color: var(--muted);
      }
      .styled-scrollbar {
        overflow: auto;
        scrollbar-width: thin;
        scrollbar-color: #52676d transparent;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        white-space: nowrap;
        font-size: 12px;
      }
      th {
        text-align: left;
        color: var(--muted);
        font:
          11px "IBM Plex Mono",
          monospace;
      }
      td,
      th {
        padding: 12px;
        border-bottom: 1px solid var(--line);
      }
      td:not(:first-child) {
        font-variant-numeric: tabular-nums;
      }
      .positive {
        color: #8fd8ac;
      }
      .negative {
        color: #f19d94;
      }
      /* Growth emphasis: positive <25% regular, 25–99.9% semibold,
         >=100% bold. Negative is red; zero/missing baseline stay neutral. */
      .growth-positive { color: #8fd8ac; font-weight: 400; }
      .growth-strong { color: #a6e9be; font-weight: 600; }
      .growth-high { color: #c0f7d2; font-weight: 800; }
      .growth-negative { color: #f19d94; }
      .growth-neutral { color: var(--muted); }
      th button { border: 0; padding: 0; background: transparent; font: inherit; color: inherit; }
      th[aria-sort="ascending"], th[aria-sort="descending"] { color: var(--accent); }
      .chart-container {
        position: relative;
      }
      .chart-tooltip {
        position: absolute;
        z-index: 2;
        top: 10px;
        max-width: min(360px, 100%);
        padding: 12px;
        border: 1px solid var(--accent);
        border-radius: 6px;
        background: #101516f5;
        box-shadow: 0 6px 24px #0008;
        white-space: pre-line;
        overflow-wrap: anywhere;
        pointer-events: none;
        font: 12px/1.6 "IBM Plex Mono", monospace;
      }
      .chart {
        width: 100%;
        height: 300px;
      }
      .legend {
        display: flex;
        gap: 18px;
        flex-wrap: wrap;
        font:
          11px "IBM Plex Mono",
          monospace;
      }
      .legend span {
        border-left: 4px solid;
        padding-left: 8px;
      }
      .error {
        color: #f19d94;
      }
      .axis {
        display: flex;
        justify-content: space-between;
        font:
          11px "IBM Plex Mono",
          monospace;
        color: var(--muted);
      }
      :focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 4px;
      }
      @media (max-width: 600px) {
        main {
          padding: 18px;
        }
        td,
        th {
          padding: 9px;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <nav>
        <a href="/internal">Telemetry</a
        ><a data-nav href="/internal/analytics">Overview</a
        ><a data-nav href="/internal/analytics/pages">Popular pages</a
        ><a data-nav href="/internal/analytics/growth">Growth</a
        ><a data-nav href="/internal/analytics/explore">Explore</a
        ><a data-nav href="/internal/analytics/details">Detailed reports</a>
      </nav>
      <div class="eyebrow">CHRONICLE / WEB ANALYTICS</div>
      <h1>${title}</h1>
      <p>${path === "/pages" ? "Find the pages and product families people return to." : path === "/growth" ? "Separate traffic scale from momentum across every domain." : "Traffic, audience, and momentum at a glance."}</p>
      <div class="controls">
        <label
          >Completed days
          <select id="days">
            <option>7</option>
            <option selected>30</option>
            <option>90</option>
          </select></label
        >
        <fieldset>
          <legend>Exact domains</legend>
          <button id="all" type="button">All domains</button>
          <button id="none" type="button">Clear</button>
          <div id="domains"></div>
        </fieldset>
      </div>
      <p id="status" role="status">Loading analytics…</p>
      <div id="content"></div>
      <script>
        // Wrangler keepNames instrumentation can appear in serialized function bodies.
        const __name = (target) => target;
        const compare = ${compareDashboard.toString()};
        const page = ${JSON.stringify(path)};
        const params = new URLSearchParams(location.search);
        let loadVersion = 0;
        let data,
          selected = params.getAll("domain"),
          explicit = params.has("domain"),
          normalized = params.get("mode") === "normalized";
        const days = document.getElementById("days");
        days.value = ["7", "30", "90"].includes(params.get("days"))
          ? params.get("days")
          : "30";
        const esc = (value) =>
          String(value).replace(
            /[&<>"']/g,
            (c) =>
              ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;",
              })[c],
          );
        const number = (value) =>
          Number(value).toLocaleString(undefined, { maximumFractionDigits: 1 });
        const percent = (value) =>
          value === null ? "No baseline" : (value > 0 ? "+" : "") + number(value) + "%";
        const delta = (value) =>
          '<span class="' +
          (value < 0 ? "negative" : "positive") +
          '">' +
          (value > 0 ? "+" : "") +
          number(value) +
          "</span>";
        function persist() {
          const q = new URLSearchParams();
          q.set("days", days.value);
          if (explicit) {
            selected.forEach((h) => q.append("domain", h));
            if (!selected.length) q.append("domain", "");
          }
          if (normalized) q.set("mode", "normalized");
          history.replaceState(null, "", location.pathname + "?" + q);
          document.querySelectorAll("[data-nav]").forEach((a) => {
            a.search = q.toString();
            if (a.pathname === location.pathname)
              a.setAttribute("aria-current", "page");
          });
        }
        function table(headers, rows, sortable = false) {
          return (
            '<div class="styled-scrollbar"><table><thead><tr>' +
            headers
              .map((h, i) =>
                sortable
                  ? '<th aria-sort="' +
                    (domainSort.column === i ? domainSort.direction : "none") +
                    '"><button type="button" data-domain-sort="' +
                    i +
                    '">' +
                    esc(h) +
                    ' <span aria-hidden="true">' +
                    (domainSort.column === i
                      ? domainSort.direction === "ascending"
                        ? "↑"
                        : "↓"
                      : "↕") +
                    "</span></button></th>"
                  : "<th>" + esc(h) + "</th>",
              )
              .join("") +
            "</tr></thead><tbody>" +
            rows
              .map(
                (r) => "<tr>" + r.map((c) => "<td>" + c + "</td>").join("") + "</tr>",
              )
              .join("") +
            "</tbody></table></div>"
          );
        }
        let chartState;
        function chart(series, dates, normalizedScale = false) {
          chartState = { series, dates, normalizedScale };
          const values = series.flatMap((s) => s.values).filter((v) => v !== null);
          const max = values.reduce((m, v) => Math.max(m, v), 1);
          const colors = series.map(
            (_, i) => "hsl(" + ((i * 137.508) % 360) + " 55% 68%)",
          );
          let svg =
            '<div class="chart-container"><svg class="chart" viewBox="0 0 1000 300" tabindex="0" role="group" aria-label="Daily traffic. Use left and right arrows to inspect dates." aria-describedby="chart-tooltip">';
          for (let i = 0; i < 4; i++) {
            const y = 20 + i * 80;
            svg +=
              '<line x1="65" x2="985" y1="' +
              y +
              '" y2="' +
              y +
              '" stroke="#314044"/><text x="0" y="' +
              (y + 4) +
              '" fill="#9dafb1" font-size="12">' +
              number(max * (1 - i / 3)) +
              "</text>";
          }
          series.forEach((s, i) => {
            const points = s.values.map((v, j) =>
              v === null
                ? null
                : [
                    65 + (j * 920) / Math.max(1, dates.length - 1),
                    260 - (v / max) * 240,
                  ],
            );
            svg +=
              '<polyline fill="none" stroke="' +
              colors[i] +
              '" stroke-width="2" points="' +
              points
                .filter(Boolean)
                .map((p) => p.join(","))
                .join(" ") +
              '"/>';
            points.forEach((p, j) => {
              if (p)
                svg +=
                  '<circle cx="' +
                  p[0] +
                  '" cy="' +
                  p[1] +
                  '" r="3" fill="' +
                  colors[i] +
                  '"><title>' +
                  esc(s.hostname) +
                  " " +
                  dates[j] +
                  ": " +
                  number(s.values[j]) +
                  "</title></circle>";
            });
          });
          return (
            svg +
            '<g class="chart-highlight" style="display:none" pointer-events="none"></g>' +
            '<rect x="65" y="20" width="920" height="240" fill="transparent"/>' +
            '</svg><div id="chart-tooltip" class="chart-tooltip" role="status" aria-live="polite" hidden></div></div><div class="axis"><span>' +
            dates[0] +
            "</span><span>" +
            dates[dates.length - 1] +
            '</span></div><div class="legend">' +
            series
              .map(
                (s, i) =>
                  '<span style="border-color:' +
                  colors[i] +
                  '">' +
                  esc(s.hostname) +
                  (s.values.every((v) => v === null) ? " · No baseline" : "") +
                  "</span>",
              )
              .join("") +
            "</div>"
          );
        }
        function bindChart(svg, state) {
          const { series, dates, normalizedScale } = state;
          const tooltip = svg.parentElement.querySelector(".chart-tooltip");
          const highlight = svg.querySelector(".chart-highlight");
          const max = series
            .flatMap((s) => s.values)
            .reduce((m, v) => Math.max(m, v ?? 0), 1);
          let index = 0;
          function hide() {
            tooltip.hidden = true;
            highlight.style.display = "none";
          }
          function show(next) {
            if (!dates.length) return;
            index = Math.max(0, Math.min(dates.length - 1, next));
            const x = 65 + (index * 920) / Math.max(1, dates.length - 1);
            tooltip.textContent =
              dates[index] +
              "\\n" +
              series
                .map((s) => {
                  const value = s.values[index];
                  const label =
                    value === null
                      ? "No baseline"
                      : number(value) +
                        (normalizedScale
                          ? "% of previous daily average"
                          : " page views");
                  return s.hostname + ": " + label;
                })
                .join("\\n");
            tooltip.hidden = false;
            highlight.innerHTML =
              '<line x1="' +
              x +
              '" x2="' +
              x +
              '" y1="20" y2="260" stroke="#e8f1f0" stroke-dasharray="4 4"/>' +
              series
                .map((s, i) => {
                  const value = s.values[index];
                  if (value === null) return "";
                  return (
                    '<circle cx="' +
                    x +
                    '" cy="' +
                    (260 - (value / max) * 240) +
                    '" r="5" fill="hsl(' +
                    ((i * 137.508) % 360) +
                    ' 55% 68%)" stroke="#101516" stroke-width="2"/>'
                  );
                })
                .join("");
            highlight.style.display = "";
            // CTM includes viewBox letterboxing, CSS scaling and page position.
            const matrix = svg.getScreenCTM();
            if (matrix) {
              const point = svg.createSVGPoint();
              point.x = x;
              point.y = 20;
              const screen = point.matrixTransform(matrix);
              const bounds = svg.parentElement.getBoundingClientRect();
              const left = screen.x - bounds.left + 12;
              tooltip.style.left =
                Math.max(0, Math.min(left, bounds.width - tooltip.offsetWidth)) + "px";
            }
          }
          svg.addEventListener("pointermove", (event) => {
            const matrix = svg.getScreenCTM();
            if (!matrix) {
              hide();
              return;
            }
            const point = svg.createSVGPoint();
            point.x = event.clientX;
            point.y = event.clientY;
            const local = point.matrixTransform(matrix.inverse());
            if (local.x < 65 || local.x > 985 || local.y < 20 || local.y > 260) {
              hide();
              return;
            }
            show(Math.round(((local.x - 65) / 920) * Math.max(1, dates.length - 1)));
          });
          svg.addEventListener("pointerleave", hide);
          svg.addEventListener("focus", () => show(index));
          svg.addEventListener("blur", hide);
          svg.addEventListener("keydown", (event) => {
            const next = {
              ArrowLeft: index - 1,
              ArrowRight: index + 1,
              Home: 0,
              End: dates.length - 1,
            }[event.key];
            if (event.key === "Escape") {
              hide();
              return;
            }
            if (next !== undefined) {
              event.preventDefault();
              show(next);
            }
          });
        }
        const domainSort = { column: 1, direction: "descending" };
        const domainColumns = [
          "Domain",
          "Views",
          "Previous",
          "Share",
          "Change",
          "Growth",
          "Active users",
          "Sessions",
          "Engaged sessions",
        ];
        function toggleDomainSort(column) {
          domainSort.direction =
            domainSort.column === column && domainSort.direction === "ascending"
              ? "descending"
              : "ascending";
          domainSort.column = column;
        }
        function sortDomains(hosts) {
          const value = (h) =>
            [
              h.hostname,
              h.pageViews,
              h.previousPageViews,
              h.share,
              h.delta,
              h.percent,
              h.metrics.activeUsers?.value,
              h.metrics.sessions?.value,
              h.metrics.engagedSessions?.value,
            ][domainSort.column];
          return [...hosts].sort((a, b) => {
            const left = value(a),
              right = value(b);
            // Missing baselines/metrics stay last in either direction.
            if (left == null || right == null)
              return left == null
                ? right == null
                  ? a.hostname.localeCompare(b.hostname)
                  : 1
                : -1;
            const order =
              typeof left === "string" ? left.localeCompare(right) : left - right;
            return (
              (domainSort.direction === "ascending" ? order : -order) ||
              a.hostname.localeCompare(b.hostname)
            );
          });
        }
        function growthPercent(value) {
          const style =
            value === null || value === 0
              ? "neutral"
              : value < 0
                ? "negative"
                : value >= 100
                  ? "high"
                  : value >= 25
                    ? "strong"
                    : "positive";
          return '<span class="growth-' + style + '">' + percent(value) + "</span>";
        }
        function metricCell(metric) {
          return metric
            ? number(metric.value) +
                (metric.previous === null
                  ? " · Previous unavailable"
                  : ' <span class="muted">(was ' +
                    number(metric.previous) +
                    ", " +
                    growthPercent(metric.changePercent) +
                    ")</span>")
            : "Unavailable";
        }
        function render() {
          persist();
          const model = compare(data, selected, page === "/growth" && normalized);
          let output = "";
          if (!selected.length) {
            document.getElementById("content").innerHTML =
              "<section>Select at least one domain.</section>";
            return;
          }
          if (page === "") {
            const card = (label, value, detail) =>
              '<div class="card">' +
              label +
              "<strong>" +
              value +
              "</strong><small>" +
              detail +
              "</small></div>";
            const metricCard = (label, metric) =>
              card(
                label,
                metric ? number(metric.value) : "Not additive",
                metric
                  ? metric.previous === null
                    ? "Previous period unavailable"
                    : delta(metric.value - metric.previous) +
                      " · " +
                      percent(metric.changePercent) +
                      " vs previous period"
                  : "See per-domain values below. Overlapping audiences and sessions cannot be summed.",
              );
            output +=
              '<div class="cards">' +
              card(
                "Page views",
                number(model.current),
                delta(model.delta) +
                  " · " +
                  percent(model.percent) +
                  " vs previous period",
              ) +
              metricCard("Active users", model.activeUsers) +
              metricCard("Sessions", model.sessions) +
              metricCard("Engaged sessions", model.engagedSessions) +
              "</div>";
            const totals = model.dates.map((_, i) =>
              model.series.reduce((sum, s) => sum + (s.values[i] || 0), 0),
            );
            output +=
              "<section><h2>Daily page views</h2>" +
              chart([{ hostname: "Selected domains", values: totals }], model.dates) +
              "</section>";
          }
          if (page === "/growth") {
            output +=
              '<section><h2>Daily domain comparison</h2><label>Scale <select id="scale"><option value="absolute" ' +
              (!normalized ? "selected" : "") +
              '>Absolute page views</option><option value="normalized" ' +
              (normalized ? "selected" : "") +
              ">Normalized to previous daily average</option></select></label><p>Normalized: 100 = the domain’s previous-period daily average. Domains without a baseline are not plotted.</p>" +
              chart(model.series, model.dates, normalized) +
              "</section>";
          }
          if (page !== "/pages")
            output +=
              "<section><h2>Domain comparison</h2><p>Share is of selected domains. Users and sessions are reported per domain and must not be summed across domains. Parentheses show previous values and period changes.</p>" +
              table(
                domainColumns,
                sortDomains(model.hosts).map((h) => [
                  '<a href="/internal/analytics/growth?days=' +
                    days.value +
                    "&domain=" +
                    encodeURIComponent(h.hostname) +
                    '">' +
                    esc(h.hostname) +
                    "</a>",
                  number(h.pageViews),
                  number(h.previousPageViews),
                  number(h.share * 100) + "%",
                  delta(h.delta),
                  growthPercent(h.percent),
                  metricCell(h.metrics.activeUsers),
                  metricCell(h.metrics.sessions),
                  metricCell(h.metrics.engagedSessions),
                ]),
                true,
              ) +
              "</section>";
          if (page === "/pages") {
            const rows = (items) =>
              items.map((r) => [
                esc(r.hostname),
                esc(r.path),
                number(r.pageViews),
                number(r.previousPageViews),
                number(r.share * 100) + "%",
                number(r.previousShare * 100) + "%",
                delta(r.delta),
                percent(r.percent),
              ]);
            const headers = [
              "Domain",
              "Page / family",
              "Views",
              "Previous",
              "Share",
              "Previous share",
              "Change",
              "Growth",
            ];
            output +=
              "<section><h2>Route families by domain</h2><p>Compare the same page type across domains. Shares use all selected traffic, not just the visible rows.</p>" +
              table(headers, rows(model.families)) +
              "</section><section><h2>Hostname + path ranking</h2><p>Query strings are excluded. All returned paths are included.</p>" +
              table(headers, rows(model.pages)) +
              "</section>";
          }
          document.getElementById("content").innerHTML = output;
          document
            .querySelectorAll(".chart")
            .forEach((svg) => bindChart(svg, chartState));
          document.querySelectorAll("[data-domain-sort]").forEach((button) => {
            button.addEventListener("click", () => {
              const column = Number(button.dataset.domainSort);
              toggleDomainSort(column);
              render();
              document.querySelector('[data-domain-sort="' + column + '"]')?.focus();
            });
          });
          document.getElementById("scale")?.addEventListener("change", (e) => {
            normalized = e.target.value === "normalized";
            render();
          });
        }
        function controls() {
          document.getElementById("domains").innerHTML = data.hosts
            .map(
              (h) =>
                '<label><input type="checkbox" value="' +
                esc(h.hostname) +
                '" ' +
                (selected.includes(h.hostname) ? "checked" : "") +
                ">" +
                esc(h.hostname) +
                "</label>",
            )
            .join("");
          document.querySelectorAll("#domains input").forEach((el) =>
            el.addEventListener("change", () => {
              explicit = true;
              selected = [...document.querySelectorAll("#domains input:checked")].map(
                (e) => e.value,
              );
              render();
            }),
          );
        }
        async function load() {
          const version = ++loadVersion;
          document.getElementById("status").textContent = "Loading analytics…";
          document.getElementById("content").innerHTML = "";
          try {
            const response = await fetch(
              "/internal/api/v1/analytics/dashboard?days=" + days.value,
            );
            if (!response.ok) throw Error("Analytics unavailable. Try again shortly.");
            const loaded = await response.json();
            if (version !== loadVersion) return;
            data = loaded;
            if (!explicit) selected = data.hosts.map((h) => h.hostname);
            else
              selected = selected.filter((h) =>
                data.hosts.some((row) => row.hostname === h),
              );
            controls();
            document.getElementById("status").textContent =
              (data.mock ? "DEMO · " : "") +
              data.period.start +
              " to " +
              data.period.end +
              " · Previous " +
              data.period.previousStart +
              " to " +
              data.period.previousEnd +
              " · " +
              data.timezone +
              " · Generated " +
              new Date(data.generatedAt).toLocaleString() +
              " · Server cache up to one hour";
            render();
          } catch (e) {
            if (version !== loadVersion) return;
            document.getElementById("status").textContent = e.message;
            document.getElementById("content").innerHTML =
              '<button id="retry">Retry</button>';
            document.getElementById("retry").onclick = load;
          }
        }
        days.addEventListener("change", () => {
          load();
        });
        document.getElementById("all").onclick = () => {
          if (!data) return;
          explicit = false;
          selected = data.hosts.map((h) => h.hostname);
          controls();
          render();
        };
        document.getElementById("none").onclick = () => {
          explicit = true;
          selected = [];
          controls();
          render();
        };
        load();
      </script>
    </main>
  </body>
</html>
`);
  });
}
export default views;
