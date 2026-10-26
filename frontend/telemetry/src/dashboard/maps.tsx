import { Hono } from "hono";
import { html, raw } from "hono/html";
import type { Env } from "../types";
import { createMapBundleTools } from "./mapBundle";

const mapsDashboard = new Hono<{ Bindings: Env }>();

mapsDashboard.get("/internal/maps", (c) => c.html(
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Map foundry · Chronicle Telemetry</title>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
      <script type="module" src="https://ajax.googleapis.com/ajax/libs/model-viewer/4.1.0/model-viewer.min.js"></script>
      {html`<style>
        :root { --bg:#111413; --panel:#191e1c; --panel2:#202622; --line:#36413b; --text:#e6eadf; --muted:#89958d; --moss:#a8c46a; --amber:#e1b25d; --blue:#75aeba; --danger:#df756d; }
        * { box-sizing:border-box; }
        body { margin:0; min-height:100vh; color:var(--text); background:radial-gradient(circle at 90% -10%,#314032 0,transparent 34rem),linear-gradient(120deg,#111413,#151918); font-family:'DM Sans',sans-serif; }
        body::before { content:''; position:fixed; inset:0; pointer-events:none; opacity:.16; background-image:linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px); background-size:48px 48px; mask-image:linear-gradient(to bottom,#000,transparent 72%); }
        main { position:relative; width:min(1540px,calc(100% - 36px)); margin:0 auto; padding:26px 0 54px; }
        header { display:flex; align-items:flex-end; justify-content:space-between; gap:24px; margin-bottom:22px; }
        .eyebrow,.mono { font-family:'JetBrains Mono',monospace; }
        .eyebrow { color:var(--moss); font-size:10px; letter-spacing:.18em; text-transform:uppercase; }
        h1 { margin:6px 0 3px; font-size:clamp(27px,4vw,43px); letter-spacing:-.045em; line-height:1; }
        header p { margin:8px 0 0; color:var(--muted); font-size:13px; }
        a { color:var(--blue); text-decoration:none; }
        button,select,input { font:inherit; }
        button { border:1px solid var(--line); border-radius:6px; padding:9px 12px; color:var(--text); background:#242b27; cursor:pointer; font-size:12px; font-weight:700; }
        button:hover:not(:disabled) { border-color:#66766b; background:#2c352f; }
        button:disabled { cursor:not-allowed; opacity:.42; }
        button.primary { color:#151811; background:var(--moss); border-color:var(--moss); }
        button.publish { color:#1b160c; background:var(--amber); border-color:var(--amber); }
        button.danger { color:#ffaaa4; }
        .header-actions { display:flex; gap:8px; align-items:center; }
        .back { padding:9px 12px; border:1px solid var(--line); border-radius:6px; background:#171c1a; font-size:12px; }
        .toolbar { display:grid; grid-template-columns:minmax(180px,260px) minmax(240px,1fr) auto; gap:10px; margin-bottom:14px; padding:12px; border:1px solid var(--line); border-radius:9px; background:#171c1acc; box-shadow:0 14px 40px #0004; }
        select,input[type='search'],input[type='text'],input[type='number'] { width:100%; color:var(--text); background:#101412; border:1px solid var(--line); border-radius:5px; padding:9px 10px; outline:none; }
        select:focus,input:focus { border-color:var(--moss); box-shadow:0 0 0 2px #a8c46a18; }
        .toolbar-actions { display:flex; gap:8px; }
        .statusline { min-height:38px; display:flex; align-items:center; gap:9px; margin-bottom:14px; padding:8px 11px; color:var(--muted); background:#151a18; border:1px solid #29322d; border-radius:7px; font:11px 'JetBrains Mono',monospace; }
        .statusline.error { color:#ffc0bb; border-color:#633b37; background:#291b19; }
        .dot { width:7px; height:7px; border-radius:50%; background:var(--blue); box-shadow:0 0 12px var(--blue); }
        .dot.draft { background:var(--amber); box-shadow:0 0 12px var(--amber); }
        .workspace { display:grid; grid-template-columns:minmax(300px,390px) minmax(0,1fr); gap:14px; align-items:start; }
        .panel { overflow:hidden; background:#181d1bcc; border:1px solid var(--line); border-radius:9px; box-shadow:0 18px 50px #0004; }
        .panel-head { display:flex; align-items:center; justify-content:space-between; gap:12px; min-height:52px; padding:12px 15px; border-bottom:1px solid var(--line); background:#1d231f; }
        .panel-head h2 { margin:0; font-size:12px; letter-spacing:.08em; text-transform:uppercase; }
        .count { color:var(--muted); font:10px 'JetBrains Mono',monospace; }
        .map-list { max-height:calc(100vh - 245px); min-height:480px; overflow-y:auto; scrollbar-color:#4a574f #171c19; }
        .map-row { width:100%; display:grid; grid-template-columns:54px minmax(0,1fr) auto; align-items:center; gap:10px; padding:11px 13px; color:var(--text); background:transparent; border:0; border-bottom:1px solid #29312d; border-radius:0; text-align:left; }
        .map-row:hover,.map-row.active { background:#242d27; }
        .map-row.active { box-shadow:inset 3px 0 var(--moss); }
        .map-id { color:var(--muted); font:10px 'JetBrains Mono',monospace; }
        .map-name { overflow:hidden; font-size:13px; font-weight:700; text-overflow:ellipsis; white-space:nowrap; }
        .badges { display:flex; gap:4px; }
        .badge { min-width:25px; padding:3px 5px; border:1px solid #435048; border-radius:4px; color:#77847c; font:9px 'JetBrains Mono',monospace; text-align:center; }
        .badge.on.original { color:var(--moss); border-color:#5a6d3b; background:#202819; }
        .badge.on.render { color:var(--amber); border-color:#725d35; background:#2c261a; }
        .badge.on.model { color:var(--blue); border-color:#3b646c; background:#19282b; }
        .editor { min-height:620px; }
        .editor-body { padding:18px; }
        .map-title { display:flex; justify-content:space-between; gap:18px; align-items:flex-start; padding-bottom:16px; margin-bottom:17px; border-bottom:1px solid var(--line); }
        .map-title h2 { margin:0; font-size:22px; letter-spacing:-.025em; }
        .map-title p { margin:5px 0 0; color:var(--muted); font:11px 'JetBrains Mono',monospace; }
        .layer-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
        .layer-card { min-width:0; padding:15px; border:1px solid #354039; border-radius:8px; background:#151a17; }
        .layer-card h3 { display:flex; justify-content:space-between; align-items:center; margin:0 0 4px; font-size:14px; }
        .layer-card > p { margin:0 0 14px; color:var(--muted); font-size:11px; line-height:1.45; }
        .layer-tag { color:var(--muted); font:9px 'JetBrains Mono',monospace; text-transform:uppercase; }
        label { display:block; margin:11px 0; color:#aab4ad; font-size:10px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; }
        label input { margin-top:6px; text-transform:none; }
        .path { padding:9px 10px; overflow-wrap:anywhere; color:#b7c3bb; background:#0f1311; border:1px solid #2e3832; border-radius:5px; font:10px/1.5 'JetBrains Mono',monospace; }
        .empty-path { color:#68736c; font-style:italic; }
        .upload { position:relative; display:block; margin-top:11px; padding:12px; color:var(--muted); border:1px dashed #526057; border-radius:6px; text-align:center; cursor:pointer; font-size:11px; }
        .upload:hover { color:var(--text); border-color:var(--moss); background:#20271f; }
        .upload input { position:absolute; inset:0; opacity:0; cursor:pointer; }
        .dimensions { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:10px; }
        .bounds-toggle { display:flex; align-items:center; gap:7px; margin-top:12px; color:var(--muted); font-size:11px; }
        .bounds-toggle input { accent-color:var(--moss); }
        .bounds { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
        .card-actions { display:flex; justify-content:flex-end; gap:7px; margin-top:13px; }
        .json-panel { margin-top:14px; }
        details { border:1px solid var(--line); border-radius:8px; background:#151a18; }
        summary { padding:12px 14px; cursor:pointer; color:#aeb8b1; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; }
        pre { max-height:330px; overflow:auto; margin:0; padding:14px; color:#aebfb5; background:#0d100f; border-top:1px solid var(--line); font:10px/1.55 'JetBrains Mono',monospace; }
        .empty-editor { display:grid; place-items:center; min-height:570px; color:var(--muted); text-align:center; }
        .empty-editor strong { display:block; margin-bottom:6px; color:#c7cec9; }
        .manual-name { max-width:320px; margin-top:12px; }
        .preview-workbench { margin-top:16px; border:1px solid var(--line); border-radius:9px; overflow:hidden; background:#111513; }
        .preview-head { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:11px 13px; border-bottom:1px solid var(--line); background:#1d231f; }
        .preview-head h3 { margin:0; font-size:12px; letter-spacing:.08em; text-transform:uppercase; }
        .preview-tabs,.preview-options { display:flex; flex-wrap:wrap; gap:6px; }
        .preview-tab,.preview-option { padding:6px 9px; border-radius:5px; color:var(--muted); background:#171c19; font:10px 'JetBrains Mono',monospace; }
        .preview-tab.active,.preview-option.active { color:#11160f; background:var(--moss); border-color:var(--moss); }
        .preview-stage { min-height:420px; display:grid; place-items:center; padding:16px; background:radial-gradient(circle at 50% 40%,#27302a 0,transparent 55%),#0c0f0e; }
        .preview-loading,.preview-empty { max-width:430px; color:var(--muted); font-size:12px; line-height:1.6; text-align:center; }
        .preview-empty strong { display:block; margin-bottom:5px; color:#c6cec8; }
        .tile-preview { position:relative; width:min(100%,900px); overflow:hidden; background:#050706; box-shadow:0 18px 55px #0009; }
        .tile-preview img { position:absolute; display:block; background:#151a17; }
        .image-preview { max-width:100%; max-height:70vh; display:block; object-fit:contain; box-shadow:0 18px 55px #0009; }
        model-viewer { width:100%; min-height:520px; height:65vh; max-height:760px; background:radial-gradient(circle at 50% 38%,#35423a 0,#141916 64%,#0a0c0b 100%); --poster-color:transparent; }
        .preview-meta { display:flex; justify-content:space-between; gap:12px; align-items:center; padding:10px 13px; color:var(--muted); border-top:1px solid var(--line); font:10px 'JetBrains Mono',monospace; }
        .preview-meta a { font-weight:600; }
        .preview-error { color:#ffaaa4; }
        @media (max-width:920px) { .workspace { grid-template-columns:1fr; } .map-list { max-height:340px; min-height:0; } .layer-grid { grid-template-columns:1fr; } }
        @media (max-width:620px) { main { width:min(100% - 20px,1540px); } header { align-items:flex-start; flex-direction:column; } .header-actions,.toolbar-actions { width:100%; } .toolbar { grid-template-columns:1fr; } .toolbar-actions button { flex:1; } }
      </style>`}
    </head>
    <body>
      <main>
        <header>
          <div>
            <div class="eyebrow">R2 asset registry</div>
            <h1>Map foundry</h1>
            <p>Stage manual PNG or WebP renders and calibrated GLB meshes, inspect the manifests, then publish the reader manifest last.</p>
          </div>
          <div class="header-actions"><a class="back" href="/internal">← Telemetry</a><a class="back" href="/internal/miniatures">Miniature foundry →</a></div>
        </header>

        <section class="toolbar">
          <select id="namespace" aria-label="Map namespace">
            <option>forever</option><option>kronos</option><option>epoch</option><option>turtle</option>
            <option>tbc</option><option>vanillaplus</option><option>warmane</option><option>ascension</option><option>azerothcore</option>
          </select>
          <input id="search" type="search" aria-label="Search maps" placeholder="Search maps by name, ID, or directory" />
          <div class="toolbar-actions">
            <button id="add-map">Add map ID</button>
            <button id="import-bundle">Import bundle</button>
            <input id="bundle-file" type="file" accept="application/zip,.zip" hidden />
            <button id="discard" class="danger" disabled>Discard draft</button>
            <button id="save" class="primary" disabled>Save draft</button>
            <button id="publish" class="publish" disabled>Publish</button>
          </div>
        </section>
        <div class="statusline" id="status" role="status" aria-live="polite"><span class="dot"></span><span>Choose a namespace to load its source manifests.</span></div>

        <div class="workspace">
          <section class="panel">
            <div class="panel-head"><h2>Instance inventory</h2><span class="count" id="count">0 maps</span></div>
            <div class="map-list" id="map-list"></div>
          </section>
          <section class="panel editor" id="editor" aria-live="polite"><div class="empty-editor"><div><strong>No map selected</strong>Select a map from the inventory.</div></div></section>
        </div>
      </main>

      {html`<script>
        const bundleTools = (${raw(createMapBundleTools.toString())})();
        const els = Object.fromEntries(['namespace','search','add-map','import-bundle','bundle-file','discard','save','publish','status','count','map-list','editor'].map(id => [id, document.getElementById(id)]));
        let state = null;
        let selectedID = null;
        let selectedFloor = null;
        let dirty = false;
        let busy = false;
        let previewData = null;
        let previewMode = 'original';
        let previewChoice = 0;
        let previewRequest = 0;
        let loadRequest = 0;
        let addedMaps = new Map();

        function escapeHTML(value) { return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
        function setStatus(message, error = false) {
          els.status.className = 'statusline' + (error ? ' error' : '');
          els.status.innerHTML = '<span class="dot ' + (!error && state?.has_draft ? 'draft' : '') + '"></span><span>' + escapeHTML(message) + '</span>';
        }
        function setBusy(value) { busy = value; els.namespace.disabled = value; els.search.disabled = value; els['bundle-file'].disabled = value; updateButtons(); }
        function updateButtons() {
          els.save.disabled = busy || !state || !dirty;
          els.publish.disabled = busy || !state?.has_draft || dirty;
          els.discard.disabled = busy || !state?.has_draft;
          els['add-map'].disabled = busy || !state;
          els['import-bundle'].disabled = busy || !state;
        }
        function layerEntry(kind, mapID) { return state?.draft?.[kind]?.instances?.find(item => item.mapID === mapID); }
        function layerFloor(kind, mapID, floor) { return layerEntry(kind, mapID)?.floors?.find(item => item.floor === floor); }
        function baseInstance(mapID) { return state?.instances?.find(item => item.mapID === mapID && item.original); }
        function selectMap(mapID) {
          selectedID = mapID;
          selectedFloor = baseInstance(mapID)?.floors?.[0]?.floor ?? null;
        }
        function selectedPreferred2D() { return selectedFloor === null ? 'renders' : (layerFloor('renders', selectedID, selectedFloor)?.preferred2D || 'renders'); }
        function selectedArtwork(kind) {
          const entry = layerEntry(kind, selectedID);
          if (selectedFloor === null) return kind === 'renders' ? entry?.renders : entry?.mesh;
          const floor = layerFloor(kind, selectedID, selectedFloor);
          return kind === 'renders' ? floor?.renders : floor?.mesh;
        }
        function allInstances() {
          if (!state) return [];
          const byID = new Map(state.instances.filter(item => item.original).map(item => [item.mapID, item]));
          for (const [mapID,item] of addedMaps) byID.set(mapID,item);
          for (const kind of ['renders','meshes']) for (const entry of state.draft[kind].instances) {
            if (!byID.has(entry.mapID)) byID.set(entry.mapID, { mapID:entry.mapID, name:entry.name || 'Unnamed map', directory:'', floor_count:0 });
          }
          return [...byID.values()].sort((a,b) => a.name.localeCompare(b.name) || a.mapID - b.mapID);
        }
        function markDirty() { dirty = true; updateButtons(); renderJSON(); }
        function renderList() {
          const query = els.search.value.trim().toLowerCase();
          const rows = allInstances().filter(item => (item.name + ' ' + item.mapID + ' ' + (item.directory || '')).toLowerCase().includes(query));
          els.count.textContent = rows.length + ' maps';
          els['map-list'].innerHTML = rows.map(item => {
            const renderEntry = layerEntry('renders', item.mapID);
            const modelEntry = layerEntry('meshes', item.mapID);
            const render = renderEntry?.renders || renderEntry?.floors?.some(floor => floor.renders) || item.renders || item.floors?.some(floor => floor.renders) || item.styled;
            const model = modelEntry?.mesh || modelEntry?.floors?.some(floor => floor.mesh) || item.mesh || item.floors?.some(floor => floor.mesh);
            return '<button class="map-row ' + (item.mapID === selectedID ? 'active' : '') + '" data-map-id="' + item.mapID + '">' +
              '<span class="map-id">#' + item.mapID + '</span><span class="map-name">' + escapeHTML(item.name) + '</span>' +
              '<span class="badges"><span class="badge original ' + (item.floor_count ? 'on' : '') + '">ORG</span><span class="badge render ' + (render ? 'on' : '') + '">PNG</span><span class="badge model ' + (model ? 'on' : '') + '">GLB</span></span></button>';
          }).join('') || '<div class="empty-editor">No matching maps.</div>';
          document.querySelectorAll('.map-row').forEach(row => row.addEventListener('click', () => { if (busy) return; selectMap(Number(row.dataset.mapId)); renderList(); renderEditor(); }));
        }
        function ensureEntry(kind, mapID) {
          let entry = layerEntry(kind, mapID);
          if (!entry) {
            const base = baseInstance(mapID);
            entry = { mapID, name: base?.name || '' };
            state.draft[kind].instances.push(entry);
          }
          return entry;
        }
        function ensureFloorEntry(kind, mapID, floor) {
          const entry = ensureEntry(kind, mapID);
          entry.floors ||= [];
          let floorEntry = entry.floors.find(item => item.floor === floor);
          if (!floorEntry) { floorEntry = { floor }; entry.floors.push(floorEntry); entry.floors.sort((a,b) => a.floor - b.floor); }
          return floorEntry;
        }
        function selectedName() { return baseInstance(selectedID)?.name || addedMaps.get(selectedID)?.name || layerEntry('renders', selectedID)?.name || layerEntry('meshes', selectedID)?.name || ''; }
        function fieldNumber(id) { const raw = document.getElementById(id)?.value; return raw === '' ? null : Number(raw); }
        function syncEditor() {
          if (!state || !selectedID || !document.getElementById('map-name')) return;
          const name = document.getElementById('map-name').value.trim();
          const renderEntry = layerEntry('renders', selectedID);
          const modelEntry = layerEntry('meshes', selectedID);
          const render = selectedArtwork('renders');
          const model = selectedArtwork('meshes');
          if (renderEntry) renderEntry.name = name;
          if (render) {
            render.width = fieldNumber('render-width');
            render.height = fieldNumber('render-height');
            if (document.getElementById('has-bounds').checked) render.bounds = { minX:fieldNumber('min-x'), maxX:fieldNumber('max-x'), minY:fieldNumber('min-y'), maxY:fieldNumber('max-y') };
            else delete render.bounds;
          }
          const preferred = document.getElementById('preferred-2d');
          if (preferred && (preferred.value !== 'renders' || layerFloor('renders', selectedID, selectedFloor)?.preferred2D !== undefined)) {
            ensureFloorEntry('renders', selectedID, selectedFloor).preferred2D = preferred.value;
          }
          if (modelEntry) modelEntry.name = name;
          if (model) {
            model.bounds = { minX:fieldNumber('mesh-min-x'), maxX:fieldNumber('mesh-max-x'), minY:fieldNumber('mesh-min-y'), maxY:fieldNumber('mesh-max-y') };
            model.zMin = fieldNumber('mesh-z-min');
            model.zMax = fieldNumber('mesh-z-max');
            model.frame = document.getElementById('mesh-frame').value.trim();
            if (document.getElementById('mesh-liquid').checked) model.liquid = { color:document.getElementById('liquid-color').value, opacity:fieldNumber('liquid-opacity') };
            else delete model.liquid;
          }
        }
        function assetURL(path) { return '/internal/api/v1/maps/' + encodeURIComponent(state.namespace) + '/preview-assets/' + path.split('/').map(encodeURIComponent).join('/'); }
        function previewSources() {
          if (!previewData) return { floors:[], images:[], models:[] };
          const previewFloor = selectedFloor === null ? null : previewData.floors?.find(item => item.floor === selectedFloor);
          const draftRender = state.has_draft || dirty ? selectedArtwork('renders') : null;
          const draftModel = state.has_draft || dirty ? selectedArtwork('meshes') : null;
          const publishedRender = selectedFloor === null
            ? previewData.published_renders || (!state.has_draft ? previewData.renders : null)
            : previewData.published_render_floors?.find(item => item.floor === selectedFloor)?.renders || (!state.has_draft ? previewFloor?.renders : null);
          const publishedModel = selectedFloor === null
            ? previewData.published_mesh || (!state.has_draft ? previewData.mesh : null)
            : previewData.published_mesh_floors?.find(item => item.floor === selectedFloor)?.mesh || (!state.has_draft ? previewFloor?.mesh : null);
          return {
            floors:selectedFloor === null ? (previewData.floors || []) : (previewFloor ? [previewFloor] : []),
            images:[
              draftRender ? { label:'Draft manual', artwork:draftRender } : null,
              publishedRender && publishedRender.path !== draftRender?.path ? { label:'Published manual', artwork:publishedRender } : null,
              selectedFloor === null && previewData.styled ? { label:'Styled', artwork:previewData.styled } : null,
            ].filter(Boolean),
            models:[
              draftModel ? { label:'Draft model', asset:draftModel } : null,
              publishedModel && publishedModel.path !== draftModel?.path ? { label:'Published model', asset:publishedModel } : null,
            ].filter(Boolean),
          };
        }
        function renderPreview() {
          const stage = document.getElementById('preview-stage');
          const options = document.getElementById('preview-options');
          const meta = document.getElementById('preview-meta');
          if (!stage || !options || !meta) return;
          document.querySelectorAll('.preview-tab').forEach(button => button.classList.toggle('active', button.dataset.mode === previewMode));
          if (!previewData) { options.innerHTML = ''; stage.innerHTML = '<div class="preview-loading">Loading original tiles and artwork metadata…</div>'; meta.innerHTML = ''; return; }
          const sources = previewSources();
          let choices = previewMode === 'original' ? sources.floors.map((floor,index) => ({label:'Floor ' + floor.floor, value:index})) : previewMode === 'rendered' ? sources.images.map((image,index) => ({label:image.label,value:index})) : sources.models.map((model,index) => ({label:model.label,value:index}));
          if (previewChoice >= choices.length) previewChoice = 0;
          options.innerHTML = choices.map((choice,index) => '<button class="preview-option ' + (index === previewChoice ? 'active' : '') + '" data-preview-choice="' + index + '">' + escapeHTML(choice.label) + '</button>').join('');
          document.querySelectorAll('.preview-option').forEach(button => button.addEventListener('click', () => { previewChoice = Number(button.dataset.previewChoice); renderPreview(); }));
          if (previewMode === 'original') {
            const floor = sources.floors[previewChoice];
            if (!floor) { stage.innerHTML = '<div class="preview-empty"><strong>No original instance art</strong>This map has no native floor tile set in manifest.original.json.</div>'; meta.innerHTML = 'Original art is the native client floor tile layer.'; return; }
            const columns = Math.max(1, ...floor.tiles.map(tile => tile.column + 1));
            const rows = Math.max(1, ...floor.tiles.map(tile => tile.row + 1));
            const images = floor.tiles.map(tile => {
              const left = tile.column * floor.tileWidth / floor.width * 100;
              const top = tile.row * floor.tileHeight / floor.height * 100;
              const width = floor.tileWidth / floor.width * 100;
              const height = floor.tileHeight / floor.height * 100;
              return '<img src="' + assetURL(tile.path) + '" alt="" loading="lazy" style="left:' + left + '%;top:' + top + '%;width:' + width + '%;height:' + height + '%" />';
            }).join('');
            stage.innerHTML = '<div class="tile-preview" style="aspect-ratio:' + floor.width + '/' + floor.height + '">' + images + '</div>';
            meta.innerHTML = '<span>Original · ' + floor.width + '×' + floor.height + ' · ' + columns + '×' + rows + ' tiles</span><span>' + escapeHTML(floor.bounds ? 'calibrated bounds' : 'no world bounds') + '</span>';
          } else if (previewMode === 'rendered') {
            const image = sources.images[previewChoice];
            if (!image) { stage.innerHTML = '<div class="preview-empty"><strong>No rendered artwork</strong>Upload a manual PNG or WebP image, or publish styled artwork.</div>'; meta.innerHTML = ''; return; }
            const url = assetURL(image.artwork.path);
            stage.innerHTML = '<img class="image-preview" src="' + url + '" alt="' + escapeHTML(image.label + ' preview') + '" />';
            meta.innerHTML = '<span>' + escapeHTML(image.label) + ' · ' + image.artwork.width + '×' + image.artwork.height + '</span><a href="' + url + '" target="_blank" rel="noreferrer">Open asset ↗</a>';
          } else {
            const model = sources.models[previewChoice];
            if (!model) { stage.innerHTML = '<div class="preview-empty"><strong>No 3D model</strong>Upload a GLB to orbit, zoom, and inspect it here.</div>'; meta.innerHTML = ''; return; }
            const url = assetURL(model.asset.path);
            stage.innerHTML = '<model-viewer src="' + url + '" alt="3D model preview" camera-controls auto-rotate shadow-intensity="1" environment-image="neutral" interaction-prompt="auto"><div slot="progress-bar"></div></model-viewer>';
            meta.innerHTML = '<span>' + escapeHTML(model.label) + ' · GLB · drag to orbit · scroll to zoom</span><a href="' + url + '" target="_blank" rel="noreferrer">Open asset ↗</a>';
          }
        }
        async function loadPreview() {
          if (!state || !selectedID) return;
          const request = ++previewRequest;
          const namespace = state.namespace;
          const mapID = selectedID;
          previewData = null; previewChoice = 0; renderPreview();
          try {
            const response = await fetch('/internal/api/v1/maps/' + namespace + '/instances/' + mapID + '/preview');
            const result = await response.json();
            if (!response.ok && response.status !== 404) throw new Error(result.error || 'Preview failed');
            if (request !== previewRequest || !state || state.namespace !== namespace || selectedID !== mapID) return;
            previewData = response.ok ? result : { mapID, name:selectedName(), floors:[] };
            renderPreview();
          } catch (error) {
            if (request !== previewRequest || !state || state.namespace !== namespace || selectedID !== mapID) return;
            previewData = { mapID, name:selectedName(), floors:[] };
            renderPreview();
            const stage = document.getElementById('preview-stage');
            if (stage && !previewSources().images.length && !previewSources().models.length) stage.innerHTML = '<div class="preview-empty preview-error"><strong>Preview unavailable</strong>' + escapeHTML(error.message) + '</div>';
          }
        }
        function renderEditor() {
          if (!state || !selectedID) { els.editor.innerHTML = '<div class="empty-editor"><div><strong>No map selected</strong>Select a map from the inventory.</div></div>'; return; }
          const base = baseInstance(selectedID);
          const render = selectedArtwork('renders');
          const model = selectedArtwork('meshes');
          const bounds = render?.bounds;
          const floorOptions = base?.floors?.length
            ? '<label>Artwork scope<select id="floor-select"><option value="map" ' + (selectedFloor === null ? 'selected' : '') + '>Map-level (legacy)</option>' + base.floors.map(item => '<option value="' + item.floor + '" ' + (item.floor === selectedFloor ? 'selected' : '') + '>Native floor ' + item.floor + '</option>').join('') + '</select></label>' +
              (selectedFloor === null ? '' : '<label>Default 2D source<select id="preferred-2d"><option value="renders" ' + (selectedPreferred2D() === 'renders' ? 'selected' : '') + '>Manual render</option><option value="art" ' + (selectedPreferred2D() === 'art' ? 'selected' : '') + '>Native art</option></select></label>')
            : '<p class="count">Map-level artwork. Floor assets require a native floor.</p>';
          els.editor.innerHTML = '<div class="panel-head"><h2>Map asset editor</h2><span class="count">' + escapeHTML(state.namespace) + '/maps</span></div><div class="editor-body">' +
            '<div class="map-title"><div><h2>' + escapeHTML(selectedName() || 'Manual map') + '</h2><p>mapID ' + selectedID + (base?.directory ? ' · ' + escapeHTML(base.directory) : ' · manual-only instance') + '</p>' +
            (!base ? '<input class="manual-name" id="map-name" type="text" value="' + escapeHTML(selectedName()) + '" placeholder="Required map name" />' : '<input id="map-name" type="hidden" value="' + escapeHTML(selectedName()) + '" />') + '</div><div>' + floorOptions + '</div></div>' +
            '<div class="layer-grid">' +
              '<article class="layer-card"><h3>Rendered map <span class="layer-tag">PNG / WebP</span></h3><p>Manual 2D artwork. Image dimensions and format are read from the uploaded file.</p>' +
                '<div class="path ' + (!render ? 'empty-path' : '') + '">' + escapeHTML(render?.path || 'No render registered') + '</div>' +
                '<label class="upload">Upload or replace image<input id="render-file" type="file" accept="image/png,image/webp,.png,.webp" /></label>' +
                '<div class="dimensions"><label>Width<input id="render-width" type="number" min="1" value="' + (render?.width || '') + '" /></label><label>Height<input id="render-height" type="number" min="1" value="' + (render?.height || '') + '" /></label></div>' +
                '<label class="bounds-toggle"><input id="has-bounds" type="checkbox" ' + (bounds ? 'checked' : '') + ' /> Calibrated world bounds</label>' +
                '<div class="bounds" id="bounds" ' + (!bounds ? 'hidden' : '') + '><label>Min X<input id="min-x" type="number" step="any" value="' + (bounds?.minX ?? 0) + '" /></label><label>Max X<input id="max-x" type="number" step="any" value="' + (bounds?.maxX ?? 0) + '" /></label><label>Min Y<input id="min-y" type="number" step="any" value="' + (bounds?.minY ?? 0) + '" /></label><label>Max Y<input id="max-y" type="number" step="any" value="' + (bounds?.maxY ?? 0) + '" /></label></div>' +
                '<div class="card-actions"><button id="remove-render" class="danger" ' + (!render ? 'disabled' : '') + '>Remove render</button></div></article>' +
              '<article class="layer-card"><h3>Placeable mesh <span class="layer-tag">GLB 2.0</span></h3><p>Binary glTF scene. Enter measured world bounds and vertical extent before saving. No coordinates are inferred from the file.</p>' +
                '<div class="path ' + (!model ? 'empty-path' : '') + '">' + escapeHTML(model?.path || 'No mesh registered') + '</div>' +
                '<label class="upload">Upload or replace GLB<input id="model-file" type="file" accept="model/gltf-binary,.glb" /></label>' +
                '<div class="bounds"><label>Min X<input id="mesh-min-x" type="number" step="any" value="' + (model?.bounds?.minX ?? '') + '" /></label><label>Max X<input id="mesh-max-x" type="number" step="any" value="' + (model?.bounds?.maxX ?? '') + '" /></label><label>Min Y<input id="mesh-min-y" type="number" step="any" value="' + (model?.bounds?.minY ?? '') + '" /></label><label>Max Y<input id="mesh-max-y" type="number" step="any" value="' + (model?.bounds?.maxY ?? '') + '" /></label></div>' +
                '<div class="dimensions"><label>Z min<input id="mesh-z-min" type="number" step="any" value="' + (model?.zMin ?? '') + '" /></label><label>Z max<input id="mesh-z-max" type="number" step="any" value="' + (model?.zMax ?? '') + '" /></label></div>' +
                '<label>Coordinate frame<input id="mesh-frame" type="text" value="' + escapeHTML(model?.frame || 'wow-yup-mirrored-x') + '" /></label>' +
                '<label class="bounds-toggle"><input id="mesh-liquid" type="checkbox" ' + (model?.liquid ? 'checked' : '') + ' /> Liquid overlay</label>' +
                '<div class="dimensions" id="liquid-fields" ' + (!model?.liquid ? 'hidden' : '') + '><label>Color (#rrggbb)<input id="liquid-color" type="text" value="' + escapeHTML(model?.liquid?.color || '#000000') + '" /></label><label>Opacity<input id="liquid-opacity" type="number" min="0" max="1" step="any" value="' + (model?.liquid?.opacity ?? 1) + '" /></label></div>' +
                '<div class="card-actions"><button id="remove-model" class="danger" ' + (!model ? 'disabled' : '') + '>Remove model</button></div></article>' +
            '</div>' +
            '<section class="preview-workbench"><div class="preview-head"><h3>Artwork preview</h3><div class="preview-tabs"><button class="preview-tab active" data-mode="original">Original</button><button class="preview-tab" data-mode="rendered">Rendered</button><button class="preview-tab" data-mode="3d">3D model</button></div></div>' +
            '<div class="preview-head"><div class="preview-options" id="preview-options"></div><span class="count">draft-aware</span></div><div class="preview-stage" id="preview-stage"><div class="preview-loading">Loading preview…</div></div><div class="preview-meta" id="preview-meta"></div></section>' +
            '<div class="json-panel"><details><summary>Draft source manifests</summary><pre id="json-preview"></pre></details></div></div>';
          document.getElementById('floor-select')?.addEventListener('change', event => {
            syncEditor();
            selectedFloor = event.target.value === 'map' ? null : Number(event.target.value);
            previewChoice = 0;
            renderEditor();
          });
          document.getElementById('preferred-2d')?.addEventListener('change', () => { syncEditor(); markDirty(); renderJSON(); });
          document.getElementById('mesh-liquid').addEventListener('change', event => { document.getElementById('liquid-fields').hidden = !event.target.checked; syncEditor(); markDirty(); });
          document.getElementById('has-bounds').addEventListener('change', event => { document.getElementById('bounds').hidden = !event.target.checked; syncEditor(); markDirty(); });
          document.querySelectorAll('#editor input').forEach(input => { if (input.type !== 'file' && input.id !== 'has-bounds' && input.id !== 'mesh-liquid') input.addEventListener('input', () => { syncEditor(); markDirty(); renderList(); }); });
          document.getElementById('render-file').addEventListener('change', event => uploadAsset('renders', event.target.files[0]));
          document.getElementById('model-file').addEventListener('change', event => uploadAsset('meshes', event.target.files[0]));
          document.getElementById('remove-render').addEventListener('click', () => removeLayer('renders'));
          document.getElementById('remove-model').addEventListener('click', () => removeLayer('meshes'));
          document.querySelectorAll('.preview-tab').forEach(button => button.addEventListener('click', () => { previewMode = button.dataset.mode; previewChoice = 0; renderPreview(); }));
          renderJSON();
          loadPreview();
        }
        function renderJSON() { const pre = document.getElementById('json-preview'); if (pre && state) pre.textContent = JSON.stringify({ renders:state.draft.renders, meshes:state.draft.meshes }, null, 2); }
        function removeLayer(kind) {
          const entry = layerEntry(kind, selectedID);
          if (!entry) return;
          if (selectedFloor === null) delete entry[kind === 'renders' ? 'renders' : 'mesh'];
          else {
            const floor = layerFloor(kind, selectedID, selectedFloor);
            if (floor) delete floor[kind === 'renders' ? 'renders' : 'mesh'];
            entry.floors = (entry.floors || []).filter(item => item.renders || item.mesh || item.preferred2D !== undefined);
            if (!entry.floors.length) delete entry.floors;
          }
          if (!entry.renders && !entry.mesh && !entry.floors?.length) state.draft[kind].instances = state.draft[kind].instances.filter(item => item !== entry);
          if (!baseInstance(selectedID) && !layerEntry('renders', selectedID) && !layerEntry('meshes', selectedID)) {
            addedMaps.delete(selectedID);
            const next = allInstances()[0]?.mapID || null;
            if (next) selectMap(next); else { selectedID = null; selectedFloor = null; }
          }
          markDirty(); renderList(); renderEditor();
        }
        async function uploadAsset(kind, file) {
          if (!file || !state || !selectedID) return;
          syncEditor();
          const namespace = state.namespace;
          const mapID = selectedID;
          const floor = selectedFloor;
          const name = document.getElementById('map-name').value.trim();
          setBusy(true); setStatus('Uploading ' + file.name + '…');
          try {
            const data = new FormData(); data.append('mapID', String(mapID)); if (floor !== null) data.append('floor', String(floor)); data.append('file', file);
            const response = await fetch('/internal/api/v1/maps/' + namespace + '/assets/' + kind, { method:'POST', body:data });
            const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Upload failed');
            if (!state || state.namespace !== namespace || selectedID !== mapID || selectedFloor !== floor) return;
            const entry = ensureEntry(kind, mapID); entry.name = name;
            const target = floor === null ? entry : ensureFloorEntry(kind, mapID, floor);
            if (kind === 'renders') target.renders = { path:result.path, width:result.width, height:result.height };
            else target.mesh = { path:result.path };
            dirty = true; setStatus('Asset uploaded. Confirm its calibration, then save the draft to register it.'); renderList(); renderEditor();
          } catch (error) {
            if (state?.namespace === namespace && selectedID === mapID) setStatus(error.message, true);
          } finally { setBusy(false); }
        }
        async function importBundle(file) {
          if (!file || !state) return;
          const namespace = state.namespace;
          const draftVersion = state.draft_version;
          let uploaded = 0;
          setBusy(true); setStatus('Reading and validating ' + file.name + '…');
          try {
            const files = bundleTools.parseStoredZip(new Uint8Array(await file.arrayBuffer()));
            const manifestBytes = files.get('foundry.json');
            if (!manifestBytes) throw new Error('ZIP archive is missing root foundry.json');
            let metadata;
            try { metadata = JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(manifestBytes)); }
            catch (error) { throw new Error('foundry.json is not valid UTF-8 JSON: ' + error.message); }
            const plan = await bundleTools.validateMapFoundryBundle(metadata, files, namespace, state.instances);
            const results = [];
            for (let index = 0; index < plan.assets.length; index++) {
              const asset = plan.assets[index];
              setStatus('Uploading bundle asset ' + (index + 1) + ' of ' + plan.assets.length + ': ' + asset.file);
              const data = new FormData();
              data.append('mapID', String(asset.mapID));
              if (asset.floor !== null) data.append('floor', String(asset.floor));
              data.append('file', new File([asset.bytes], asset.file.split('/').pop()));
              const response = await fetch('/internal/api/v1/maps/' + namespace + '/assets/' + asset.kind, {method:'POST',body:data});
              const result = await response.json();
              if (!response.ok) throw new Error(result.error || 'Upload failed for ' + asset.file);
              results.push(result); uploaded++;
            }
            const merged = bundleTools.mergeMapFoundryBundle(state.draft, plan, results);
            setStatus('All ' + uploaded + ' assets uploaded. Saving the updated draft…');
            const response = await fetch('/internal/api/v1/maps/' + namespace + '/draft', {
              method:'PUT', headers:{'Content-Type':'application/json'},
              body:JSON.stringify({version:draftVersion,renders:merged.renders.instances,meshes:merged.meshes.instances}),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Bundle draft save failed');
            if (!state || state.namespace !== namespace) return;
            state.draft_version = result.draft_version; state.has_draft = true; state.draft = result.draft; dirty = false;
            const first = plan.maps[0]; selectedID = first.mapID; selectedFloor = first.firstFloor;
            setStatus('Imported ' + uploaded + ' assets from ' + file.name + ' and saved the draft. Nothing was published.');
            renderList(); renderEditor();
          } catch (error) {
            if (state?.namespace === namespace) setStatus(error.message + (uploaded ? ' The draft was not changed; ' + uploaded + ' uploaded object' + (uploaded === 1 ? ' is' : 's are') + ' orphaned.' : ' No uploads were started.'), true);
          } finally {
            els['bundle-file'].value = '';
            setBusy(false);
          }
        }
        async function load() {
          const namespace = els.namespace.value;
          const request = ++loadRequest;
          previewRequest++;
          state = null; selectedID = null; selectedFloor = null; dirty = false; addedMaps = new Map(); setBusy(true); setStatus('Loading ' + namespace + '/maps manifests…'); els['map-list'].innerHTML = ''; renderEditor();
          try {
            const response = await fetch('/internal/api/v1/maps/' + namespace);
            const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Load failed');
            if (request !== loadRequest || els.namespace.value !== namespace) return;
            state = result; if (state.instances[0]) selectMap(state.instances[0].mapID);
            const bootstrap = state.base_source === 'reader'
              ? ' Recovered native metadata from the existing reader manifest; first publish will create manifest.original.json.'
              : state.base_source === 'empty'
                ? ' No native manifest exists yet; add a named map ID and first publish will bootstrap manifest.original.json.'
                : '';
            setStatus((state.has_draft ? 'Saved draft loaded. Publish when it is ready.' : 'Published manifests loaded. Changes stay private until saved and published.') + bootstrap);
            renderList(); renderEditor();
          } catch (error) {
            if (request !== loadRequest || els.namespace.value !== namespace) return;
            setStatus(error.message, true); els.editor.innerHTML = '<div class="empty-editor"><div><strong>Namespace unavailable</strong>' + escapeHTML(error.message) + '</div></div>';
          } finally { if (request === loadRequest) setBusy(false); }
        }
        async function saveDraft() {
          syncEditor(); setBusy(true); setStatus('Validating and saving draft…');
          try {
            const response = await fetch('/internal/api/v1/maps/' + state.namespace + '/draft', { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ version:state.draft_version, renders:state.draft.renders.instances, meshes:state.draft.meshes.instances }) });
            const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Save failed');
            state.draft_version = result.draft_version; state.has_draft = true; state.draft = result.draft; dirty = false;
            setStatus('Draft saved to R2. The public manifest is unchanged.'); renderList(); renderEditor();
          } catch (error) { setStatus(error.message, true); } finally { setBusy(false); }
        }
        async function discardDraft() {
          if (!confirm('Discard the saved draft and reload the published manifests? Uploaded but unpublished assets will remain in R2.')) return;
          setBusy(true);
          try { const response = await fetch('/internal/api/v1/maps/' + state.namespace + '/draft', {method:'DELETE', headers:{'Content-Type':'application/json'}, body:JSON.stringify({version:state.draft_version})}); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Discard failed'); await load(); }
          catch (error) { setStatus(error.message, true); setBusy(false); }
        }
        async function publish() {
          if (!confirm('Publish this draft? This replaces manifest.renders.json and manifest.meshes.json, then updates the merged manifest.json.')) return;
          setBusy(true); setStatus('Checking assets and publishing source manifests…');
          try { const response = await fetch('/internal/api/v1/maps/' + state.namespace + '/publish', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({version:state.draft_version})}); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Publish failed'); await load(); setStatus('Published ' + result.manifest + '. CDN caches may take up to one hour to refresh.'); }
          catch (error) { setStatus(error.message, true); setBusy(false); }
        }
        els.namespace.addEventListener('change', load);
        els.search.addEventListener('input', renderList);
        els.save.addEventListener('click', saveDraft);
        els['import-bundle'].addEventListener('click', () => els['bundle-file'].click());
        els['bundle-file'].addEventListener('change', event => importBundle(event.target.files[0]));
        els.discard.addEventListener('click', discardDraft);
        els.publish.addEventListener('click', publish);
        els['add-map'].addEventListener('click', () => {
          const rawID = prompt('Map ID'); if (rawID === null) return; const mapID = Number(rawID);
          if (!Number.isSafeInteger(mapID) || mapID <= 0) return setStatus('Map ID must be a positive integer.', true);
          const name = prompt('Map name (required for IDs missing from the original manifest)', baseInstance(mapID)?.name || ''); if (name === null || !name.trim()) return setStatus('A map name is required.', true);
          if (!baseInstance(mapID)) addedMaps.set(mapID, {mapID,name:name.trim(),directory:'',floor_count:0,original:false});
          selectMap(mapID); renderList(); renderEditor();
        });
        load();
      </script>`}
    </body>
  </html>
));

export default mapsDashboard;
