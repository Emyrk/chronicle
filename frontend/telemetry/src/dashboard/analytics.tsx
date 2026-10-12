import { Hono } from "hono";
import { html } from "hono/html";
import type { Env } from "../types";

const analyticsDashboard = new Hono<{ Bindings: Env }>();

analyticsDashboard.get("/internal/analytics", (c) => {
  c.header("Cache-Control", "private, no-cache");
  return c.html(
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Web Analytics · Chronicle Telemetry</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
        {html`<style>
          :root { --bg:#101516; --panel:#171d1e; --panel2:#1c2425; --line:#2d3a3c; --text:#edf3f3; --muted:#849396; --accent:#79c4d7; --accent2:#d0ad72; --good:#7dc69b; --bad:#df827b; }
          * { box-sizing:border-box; }
          body { margin:0; min-height:100vh; color:var(--text); background:radial-gradient(circle at 84% -10%,#254047 0,transparent 32rem),radial-gradient(circle at -8% 45%,#202f2b 0,transparent 28rem),var(--bg); font-family:'Manrope',sans-serif; }
          body::before { content:''; position:fixed; inset:0; pointer-events:none; opacity:.16; background-image:linear-gradient(#ffffff08 1px,transparent 1px),linear-gradient(90deg,#ffffff08 1px,transparent 1px); background-size:36px 36px; mask-image:linear-gradient(to bottom,#000,transparent 75%); }
          main { position:relative; width:min(1440px,calc(100% - 44px)); margin:0 auto; padding:30px 0 60px; }
          a { color:inherit; text-decoration:none; }
          .mono,.eyebrow,.meta,.chip,th { font-family:'IBM Plex Mono',monospace; }
          header { display:flex; align-items:flex-end; justify-content:space-between; gap:24px; margin-bottom:26px; }
          .eyebrow { color:var(--accent); font-size:10px; letter-spacing:.18em; text-transform:uppercase; }
          h1 { margin:7px 0 5px; font-size:clamp(30px,4vw,48px); line-height:1; letter-spacing:-.045em; }
          header p { margin:0; color:var(--muted); font-size:13px; }
          .actions { display:flex; align-items:center; gap:9px; flex-wrap:wrap; justify-content:flex-end; }
          .nav-link,select { border:1px solid var(--line); border-radius:6px; background:#172022; color:#cbd6d7; font:600 12px 'Manrope',sans-serif; }
          .nav-link { padding:9px 12px; }
          .nav-link:hover { border-color:#4b6265; color:#fff; }
          select { padding:9px 32px 9px 11px; outline:none; }
          .status-line { display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:14px; color:var(--muted); font-size:11px; }
          .status-left { display:flex; align-items:center; gap:9px; }
          .pulse { width:7px; height:7px; border-radius:50%; background:var(--accent); box-shadow:0 0 0 5px #79c4d714; }
          .chip { display:none; padding:4px 7px; border:1px solid #745f3e; border-radius:4px; color:#e4bf81; background:#342b1d; font-size:9px; letter-spacing:.09em; text-transform:uppercase; }
          .grid { display:grid; gap:14px; }
          .metrics { grid-template-columns:repeat(4,1fr); margin-bottom:14px; }
          .metric { position:relative; overflow:hidden; min-height:132px; padding:18px; border:1px solid var(--line); border-radius:9px; background:linear-gradient(145deg,#1b2324,#151a1b); box-shadow:0 18px 45px #0004; }
          .metric::after { content:''; position:absolute; right:-24px; bottom:-42px; width:120px; height:120px; border:1px solid #79c4d719; border-radius:50%; box-shadow:0 0 0 22px #79c4d70a,0 0 0 44px #79c4d707; }
          .metric-label { color:#91a0a2; font-size:11px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; }
          .metric-value { margin:14px 0 8px; font-size:clamp(27px,3vw,39px); font-weight:800; letter-spacing:-.04em; }
          .metric-foot { display:flex; align-items:center; gap:7px; color:var(--muted); font-size:11px; }
          .change { font-family:'IBM Plex Mono',monospace; font-weight:600; }
          .change.up { color:var(--good); } .change.down { color:var(--bad); }
          .primary { grid-template-columns:minmax(0,1.65fr) minmax(300px,.8fr); margin-bottom:14px; }
          .lower { grid-template-columns:1fr 1fr; }
          .panel { min-width:0; border:1px solid var(--line); border-radius:9px; background:linear-gradient(155deg,#192021f2,#14191af2); box-shadow:0 20px 55px #0003; }
          .panel-head { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; padding:17px 18px 13px; border-bottom:1px solid #273234; }
          .panel-title { font-size:13px; font-weight:800; letter-spacing:.015em; }
          .panel-subtitle { margin-top:4px; color:var(--muted); font-size:10px; }
          .meta { color:#667679; font-size:9px; letter-spacing:.08em; text-transform:uppercase; }
          .chart-wrap { position:relative; height:292px; padding:22px 18px 12px; }
          #trend-chart { width:100%; height:100%; overflow:visible; }
          .chart-grid { stroke:#526064; stroke-opacity:.2; stroke-width:1; }
          .chart-area { fill:url(#area-fill); }
          .chart-line { fill:none; stroke:var(--accent); stroke-width:2.4; stroke-linejoin:round; stroke-linecap:round; }
          .chart-dot { fill:#101516; stroke:var(--accent); stroke-width:2; }
          .axis-label { fill:#718083; font:9px 'IBM Plex Mono',monospace; }
          .host-list { padding:9px 18px 16px; }
          .host-row { padding:11px 0; border-bottom:1px solid #252f31; }
          .host-row:last-child { border-bottom:0; }
          .row-top { display:flex; justify-content:space-between; gap:12px; margin-bottom:7px; font-size:11px; }
          .host-name { overflow:hidden; color:#cbd7d8; font-family:'IBM Plex Mono',monospace; text-overflow:ellipsis; white-space:nowrap; }
          .row-value { color:#aab8ba; font-weight:700; }
          .bar { height:5px; overflow:hidden; border-radius:9px; background:#263033; }
          .bar > i { display:block; height:100%; border-radius:inherit; background:linear-gradient(90deg,#527f8a,var(--accent)); }
          .table-wrap { overflow:auto; padding:0 5px 6px; }
          table { width:100%; border-collapse:collapse; font-size:11px; }
          th { padding:11px 13px; color:#6f7e81; font-size:9px; font-weight:500; letter-spacing:.08em; text-align:left; text-transform:uppercase; }
          th.num,td.num { text-align:right; }
          td { padding:11px 13px; border-top:1px solid #252f31; color:#aab7b9; }
          td strong { color:#dce5e6; font-weight:700; }
          .medium { display:inline-block; margin-left:7px; padding:2px 5px; border-radius:3px; color:#87979a; background:#222c2e; font:9px 'IBM Plex Mono',monospace; }
          .country-list { padding:8px 18px 15px; }
          .country-row { display:grid; grid-template-columns:24px minmax(80px,130px) 1fr auto; align-items:center; gap:10px; min-height:34px; font-size:11px; }
          .rank { color:#5e6d70; font-family:'IBM Plex Mono',monospace; }
          .country-bar { height:4px; border-radius:5px; background:#273234; }
          .country-bar i { display:block; height:100%; border-radius:inherit; background:var(--accent2); }
          .insights { grid-template-columns:minmax(0,1.15fr) minmax(360px,.85fr); margin:14px 0; }
          .family-list { padding:9px 18px 16px; }
          .family-row { display:grid; grid-template-columns:minmax(150px,210px) 1fr 62px 48px; align-items:center; gap:11px; min-height:37px; border-bottom:1px solid #252f31; font-size:11px; }
          .family-row:last-child { border-bottom:0; }
          .family-name { color:#d4dede; font-weight:700; }
          .family-share { color:#738285; font-family:'IBM Plex Mono',monospace; text-align:right; }
          .family-value { color:#aebabc; font-family:'IBM Plex Mono',monospace; text-align:right; }
          .family-bar { height:6px; overflow:hidden; border-radius:8px; background:#263033; }
          .family-bar i { display:block; height:100%; border-radius:inherit; background:linear-gradient(90deg,#9c7b4e,var(--accent2)); }
          .leader-body { padding:16px 18px 18px; }
          .mode-grid { display:grid; grid-template-columns:1fr 1fr; gap:9px; margin-bottom:17px; }
          .mode-card { padding:12px; border:1px solid #2d393b; border-radius:6px; background:#151b1c; }
          .mode-card strong { display:block; margin-top:5px; font-size:20px; }
          .mode-card span { color:var(--muted); font-size:10px; }
          .coverage { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:12px; color:var(--muted); font-size:10px; }
          .coverage strong { color:var(--good); font-family:'IBM Plex Mono',monospace; }
          .raid-row { display:grid; grid-template-columns:minmax(135px,1fr) 90px 52px; align-items:center; gap:9px; min-height:32px; font-size:10px; }
          .raid-row .family-bar i { background:linear-gradient(90deg,#477884,var(--accent)); }
          .matrix { margin:14px 0; }
          .matrix .table-wrap { max-height:390px; padding:0 8px 8px; }
          .matrix table { min-width:900px; }
          .matrix th:first-child,.matrix td:first-child { position:sticky; left:0; z-index:2; background:#171d1e; }
          .matrix td { text-align:right; }
          .matrix td:first-child { text-align:left; }
          .heat { border-radius:3px; padding:5px 7px; background:rgba(121,196,215,var(--heat)); color:#dce7e8; font-family:'IBM Plex Mono',monospace; }
          .dive-link { color:#d9e5e6; text-decoration:none; }
          .dive-link:hover { color:var(--accent); }
          .explore-cta { display:inline-flex; margin-top:14px; padding:7px 10px; border:1px solid #355057; border-radius:5px; color:var(--accent); background:#172326; font-size:10px; font-weight:800; }
          .loading,.error { display:flex; align-items:center; justify-content:center; min-height:180px; padding:28px; color:var(--muted); text-align:center; }
          .loading::before { content:''; width:17px; height:17px; margin-right:10px; border:2px solid #344244; border-top-color:var(--accent); border-radius:50%; animation:spin .8s linear infinite; }
          .error { color:#efaaa4; }
          @keyframes spin { to { transform:rotate(360deg); } }
          @media (max-width:1000px) { .metrics { grid-template-columns:1fr 1fr; } .primary,.lower,.insights { grid-template-columns:1fr; } }
          @media (max-width:620px) { main { width:min(100% - 24px,1440px); padding-top:20px; } header { align-items:flex-start; flex-direction:column; } .actions { justify-content:flex-start; } .metrics { grid-template-columns:1fr; } .status-line { align-items:flex-start; flex-direction:column; } .metric { min-height:116px; } }
        </style>`}
      </head>
      <body>
        <main>
          <header>
            <div>
              <div class="eyebrow">Chronicle signal room</div>
              <h1>Web analytics</h1>
              <p>Audience, acquisition, and traffic across Chronicle Classic properties.</p>
            </div>
            <nav class="actions" aria-label="Analytics controls">
              <a class="nav-link" href="/internal/analytics/explore?focus=reports">Explore</a>
              <a class="nav-link" href="/internal">Deployment telemetry</a>
              <a class="nav-link" href="/internal/notices">Notices</a>
              <select id="period" aria-label="Report period">
                <option value="7">Last 7 days</option>
                <option value="30" selected>Last 30 days</option>
                <option value="90">Last 90 days</option>
              </select>
            </nav>
          </header>

          <div class="status-line">
            <div class="status-left"><span class="pulse"></span><span id="period-label">Loading completed-day report…</span><span class="chip" id="mock-chip">Preview data</span></div>
            <div class="mono" id="generated-label"></div>
          </div>

          <section class="grid metrics" id="metrics">
            <div class="loading" style="grid-column:1/-1">Reading Google Analytics</div>
          </section>

          <section class="grid primary">
            <article class="panel">
              <div class="panel-head"><div><div class="panel-title">Traffic pulse</div><div class="panel-subtitle">Daily page views across Chronicle hostnames</div></div><span class="meta">Completed days</span></div>
              <div class="chart-wrap" id="chart-wrap"><div class="loading">Preparing trend</div></div>
            </article>
            <article class="panel">
              <div class="panel-head"><div><div class="panel-title">Server properties</div><div class="panel-subtitle">Ranked by page views</div></div><span class="meta">Top hosts</span></div>
              <div id="hosts"><div class="loading">Loading hosts</div></div>
            </article>
          </section>

          <section class="grid insights">
            <article class="panel">
              <div class="panel-head"><div><div class="panel-title">What people use</div><div class="panel-subtitle">Privacy-safe route families across every server</div></div><span class="meta">Product mix</span></div>
              <div id="product-families"><div class="loading">Classifying routes</div></div>
            </article>
            <article class="panel">
              <div class="panel-head"><div><div class="panel-title">Leaderboard demand</div><div class="panel-subtitle">Modes and raid categories selected in leaderboard URLs</div></div><span class="meta">No player IDs</span></div>
              <div id="leaderboards"><div class="loading">Reading leaderboard mix</div></div>
            </article>
          </section>

          <section class="panel matrix">
            <div class="panel-head"><div><div class="panel-title">Server × product map</div><div class="panel-subtitle">The dominant Chronicle workflows on each meaningful server</div></div><span class="meta">Page views</span></div>
            <div id="server-products"><div class="loading">Building server matrix</div></div>
          </section>

          <section class="grid lower">
            <article class="panel">
              <div class="panel-head"><div><div class="panel-title">Acquisition</div><div class="panel-subtitle">How sessions reached Chronicle</div></div><span class="meta">Source / medium</span></div>
              <div id="acquisition"><div class="loading">Loading sources</div></div>
            </article>
            <article class="panel">
              <div class="panel-head"><div><div class="panel-title">Audience geography</div><div class="panel-subtitle">Top countries by page views</div></div><span class="meta">Aggregate only</span></div>
              <div id="countries"><div class="loading">Loading countries</div></div>
            </article>
          </section>
        </main>

        {html`<script>
          const number = new Intl.NumberFormat('en-US');
          const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
          const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
          const formatDate = (value) => new Date(value + 'T12:00:00Z').toLocaleDateString('en-US', { month:'short', day:'numeric', timeZone:'UTC' });

          function renderMetric(label, metric) {
            const change = metric.changePercent;
            const direction = change == null || change >= 0 ? 'up' : 'down';
            const changeText = change == null ? 'New' : (change >= 0 ? '+' : '') + change.toFixed(1) + '%';
            return '<article class="metric"><div class="metric-label">' + label + '</div><div class="metric-value">' + number.format(metric.value) + '</div><div class="metric-foot"><span class="change ' + direction + '">' + changeText + '</span><span>vs previous period</span></div></article>';
          }

          function renderChart(points) {
            if (!points.length) return '<div class="error">No trend data returned.</div>';
            const width = 900, height = 250, padX = 36, padY = 20;
            const max = Math.max(...points.map((point) => point.pageViews), 1);
            const x = (index) => padX + index * ((width - padX * 2) / Math.max(points.length - 1, 1));
            const y = (value) => height - padY - (value / max) * (height - padY * 2);
            const line = points.map((point, index) => (index ? 'L' : 'M') + x(index).toFixed(1) + ',' + y(point.pageViews).toFixed(1)).join(' ');
            const area = line + ' L' + x(points.length - 1).toFixed(1) + ',' + (height - padY) + ' L' + padX + ',' + (height - padY) + ' Z';
            const grid = [0,.25,.5,.75,1].map((step) => {
              const gy = padY + step * (height - padY * 2);
              const label = compact.format(max * (1 - step));
              return '<line class="chart-grid" x1="' + padX + '" y1="' + gy + '" x2="' + (width-padX) + '" y2="' + gy + '"></line><text class="axis-label" x="0" y="' + (gy+3) + '">' + label + '</text>';
            }).join('');
            const labels = [0, Math.floor((points.length-1)/2), points.length-1].map((index) => '<text class="axis-label" text-anchor="middle" x="' + x(index) + '" y="248">' + formatDate(points[index].date) + '</text>').join('');
            return '<svg id="trend-chart" viewBox="0 0 900 250" preserveAspectRatio="none"><defs><linearGradient id="area-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#79c4d7" stop-opacity=".28"></stop><stop offset="1" stop-color="#79c4d7" stop-opacity="0"></stop></linearGradient></defs>' + grid + '<path class="chart-area" d="' + area + '"></path><path class="chart-line" d="' + line + '"></path>' + labels + '</svg>';
          }

          function renderHosts(rows) {
            const max = Math.max(...rows.map((row) => row.pageViews), 1);
            return '<div class="host-list">' + rows.slice(0,7).map((row) => '<div class="host-row"><div class="row-top"><a class="host-name dive-link" href="/internal/analytics/explore?focus=server&host=' + encodeURIComponent(row.hostname) + '">' + escapeHtml(row.hostname.replace('.chronicleclassic.com','')) + '</a><span class="row-value">' + compact.format(row.pageViews) + '</span></div><div class="bar"><i style="width:' + Math.max(2,row.pageViews/max*100) + '%"></i></div></div>').join('') + '</div>';
          }

          function renderAcquisition(rows) {
            return '<div class="table-wrap"><table><thead><tr><th>Source</th><th class="num">Sessions</th><th class="num">Engaged</th></tr></thead><tbody>' + rows.slice(0,8).map((row) => '<tr><td><strong>' + escapeHtml(row.source) + '</strong><span class="medium">' + escapeHtml(row.medium) + '</span></td><td class="num">' + number.format(row.sessions) + '</td><td class="num">' + number.format(row.engagedSessions) + '</td></tr>').join('') + '</tbody></table></div>';
          }

          function renderCountries(rows) {
            const max = Math.max(...rows.map((row) => row.pageViews), 1);
            return '<div class="country-list">' + rows.slice(0,8).map((row,index) => '<div class="country-row"><span class="rank">' + String(index+1).padStart(2,'0') + '</span><strong>' + escapeHtml(row.country) + '</strong><span class="country-bar"><i style="width:' + Math.max(2,row.pageViews/max*100) + '%"></i></span><span class="mono">' + compact.format(row.pageViews) + '</span></div>').join('') + '</div>';
          }

          function renderProductFamilies(rows) {
            const visible = rows.filter((row) => row.pageViews > 0).slice(0,12);
            const max = Math.max(...visible.map((row) => row.pageViews), 1);
            const focusFor = (id) => id === 'leaderboards' ? 'leaderboards' : (id === 'armory_players' || id === 'armory_search' || id === 'guilds') ? 'armory' : (id === 'instance_reports' || id === 'instance_collection' || id === 'recent' || id === 'logs_collection' || id === 'log_detail' || id === 'upload') ? 'reports' : '';
            return '<div class="family-list">' + visible.map((row) => { const target=focusFor(row.id); const label=target ? '<a class="family-name dive-link" href="/internal/analytics/explore?focus=' + target + '">' + escapeHtml(row.label) + '</a>' : '<span class="family-name">' + escapeHtml(row.label) + '</span>'; return '<div class="family-row">' + label + '<span class="family-bar"><i style="width:' + Math.max(1,row.pageViews/max*100) + '%"></i></span><span class="family-value">' + compact.format(row.pageViews) + '</span><span class="family-share">' + (row.share*100).toFixed(1) + '%</span></div>'; }).join('') + '</div>';
          }

          function renderLeaderboards(data) {
            const modes = data.modes.map((row) => '<div class="mode-card"><span>' + escapeHtml(row.label) + '</span><strong>' + compact.format(row.pageViews) + '</strong><span>' + (row.share*100).toFixed(1) + '% of classified views</span></div>').join('');
            const raids = data.instances.slice(0,8);
            const max = Math.max(...raids.map((row) => row.pageViews),1);
            return '<div class="leader-body"><div class="coverage"><span>URL categorization coverage</span><strong>' + (data.coverage*100).toFixed(2) + '%</strong></div><div class="mode-grid">' + modes + '</div>' + raids.map((row) => '<div class="raid-row"><span>' + escapeHtml(row.label) + '</span><span class="family-bar"><i style="width:' + Math.max(1,row.pageViews/max*100) + '%"></i></span><span class="family-value">' + compact.format(row.pageViews) + '</span></div>').join('') + '<a class="explore-cta" href="/internal/analytics/explore?focus=leaderboards">Explore leaderboards →</a></div>';
          }

          function renderServerProducts(servers, families) {
            const columnIds = ['instance_reports','leaderboards','armory_players','guilds','armory_search','recent','upload','other'];
            const columns = columnIds.map((id) => families.find((family) => family.id === id)).filter(Boolean);
            const rows = servers.filter((server) => server.pageViews >= 1000).slice(0,10);
            const max = Math.max(...rows.flatMap((server) => columns.map((family) => server.families[family.id] || 0)),1);
            const head = '<tr><th>Server</th><th class="num">Total</th>' + columns.map((family) => '<th class="num">' + escapeHtml(family.label) + '</th>').join('') + '</tr>';
            const body = rows.map((server) => '<tr><td><a class="dive-link" href="/internal/analytics/explore?focus=server&host=' + encodeURIComponent(server.hostname) + '"><strong>' + escapeHtml(server.hostname.replace('.chronicleclassic.com','')) + '</strong></a></td><td class="num">' + compact.format(server.pageViews) + '</td>' + columns.map((family) => { const value=server.families[family.id]||0; const heat=(.05 + value/max*.32).toFixed(3); return '<td class="num"><span class="heat" style="--heat:' + heat + '">' + (value ? compact.format(value) : '—') + '</span></td>'; }).join('') + '</tr>').join('');
            return '<div class="table-wrap"><table><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>';
          }

          async function loadAnalytics() {
            const days = document.getElementById('period').value;
            try {
              const response = await fetch('/internal/api/v1/analytics/dashboard?days=' + days);
              const data = await response.json();
              if (!response.ok) throw new Error(data.detail || data.error || 'Request failed');
              document.getElementById('metrics').innerHTML = renderMetric('Page views', data.overview.pageViews) + renderMetric('Active users', data.overview.activeUsers) + renderMetric('Sessions', data.overview.sessions) + renderMetric('Engaged sessions', data.overview.engagedSessions);
              document.getElementById('chart-wrap').innerHTML = renderChart(data.timeseries);
              document.getElementById('hosts').innerHTML = renderHosts(data.hosts);
              document.getElementById('product-families').innerHTML = renderProductFamilies(data.productFamilies);
              document.getElementById('leaderboards').innerHTML = renderLeaderboards(data.leaderboards);
              document.getElementById('server-products').innerHTML = renderServerProducts(data.serverProducts, data.productFamilies);
              document.getElementById('acquisition').innerHTML = renderAcquisition(data.acquisition);
              document.getElementById('countries').innerHTML = renderCountries(data.countries);
              document.getElementById('period-label').textContent = formatDate(data.period.start) + ' – ' + formatDate(data.period.end) + ' · ' + data.timezone;
              document.getElementById('generated-label').textContent = 'UPDATED ' + new Date(data.generatedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
              document.getElementById('mock-chip').style.display = data.mock ? 'inline-block' : 'none';
            } catch (error) {
              const message = '<div class="error">' + escapeHtml(error.message || 'Unable to load analytics') + '</div>';
              document.getElementById('metrics').innerHTML = message;
              document.getElementById('chart-wrap').innerHTML = message;
              document.getElementById('hosts').innerHTML = message;
              document.getElementById('product-families').innerHTML = message;
              document.getElementById('leaderboards').innerHTML = message;
              document.getElementById('server-products').innerHTML = message;
              document.getElementById('acquisition').innerHTML = message;
              document.getElementById('countries').innerHTML = message;
              document.getElementById('period-label').textContent = 'Analytics unavailable';
            }
          }
          document.getElementById('period').addEventListener('change', loadAnalytics);
          loadAnalytics();
        </script>`}
      </body>
    </html>
  );
});

export default analyticsDashboard;
