import { Hono } from "hono";
import { html } from "hono/html";
import type { Env } from "../types";

const miniatureDashboard = new Hono<{ Bindings: Env }>();

miniatureDashboard.get("/internal/miniatures", (c) => c.html(
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Miniature foundry · Chronicle Telemetry</title>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
      {html`<script>
        self.ModelViewerElement = self.ModelViewerElement || {};
        self.ModelViewerElement.meshoptDecoderLocation = "https://cdn.jsdelivr.net/npm/meshoptimizer/meshopt_decoder.js";
      </script>`}
      <script type="module" src="https://ajax.googleapis.com/ajax/libs/model-viewer/4.1.0/model-viewer.min.js"></script>
      {html`<style>
        :root { --bg:#111312; --panel:#191d1a; --line:#374039; --text:#e9ebe5; --muted:#8c968e; --bone:#d5c5a2; --moss:#9dbd72; --blue:#77aeb9; --danger:#df756d; }
        * { box-sizing:border-box; }
        body { margin:0; min-height:100vh; color:var(--text); background:radial-gradient(circle at 82% -8%,#3a3327 0,transparent 33rem),linear-gradient(135deg,#111312,#171915); font-family:'DM Sans',sans-serif; }
        body::before { content:''; position:fixed; inset:0; pointer-events:none; opacity:.13; background-image:linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px); background-size:44px 44px; mask-image:linear-gradient(to bottom,#000,transparent 78%); }
        main { position:relative; width:min(1480px,calc(100% - 36px)); margin:0 auto; padding:28px 0 58px; }
        header { display:flex; justify-content:space-between; align-items:flex-end; gap:24px; margin-bottom:22px; }
        .eyebrow,.mono { font-family:'JetBrains Mono',monospace; }
        .eyebrow { color:var(--bone); font-size:10px; letter-spacing:.18em; text-transform:uppercase; }
        h1 { margin:6px 0 3px; font-size:clamp(28px,4vw,44px); letter-spacing:-.045em; }
        header p { margin:7px 0 0; color:var(--muted); font-size:13px; }
        a { color:var(--blue); text-decoration:none; }
        .header-actions { display:flex; gap:8px; align-items:center; }
        button,input,textarea { font:inherit; }
        button { border:1px solid var(--line); border-radius:6px; padding:9px 12px; color:var(--text); background:#242a25; cursor:pointer; font-size:12px; font-weight:700; }
        button:hover:not(:disabled) { border-color:#69756c; background:#2c342e; }
        button:disabled { opacity:.42; cursor:not-allowed; }
        button.primary { color:#11150e; background:var(--moss); border-color:var(--moss); }
        button.publish { color:#1e180d; background:var(--bone); border-color:var(--bone); }
        button.danger { color:#ffaaa4; }
        .back { padding:9px 12px; border:1px solid var(--line); border-radius:6px; background:#171b18; font-size:12px; }
        .toolbar { display:grid; grid-template-columns:minmax(240px,1fr) auto; gap:10px; margin-bottom:14px; padding:12px; border:1px solid var(--line); border-radius:9px; background:#171b18dd; box-shadow:0 14px 40px #0004; }
        input[type='search'],input[type='text'],textarea { width:100%; color:var(--text); background:#0f1210; border:1px solid var(--line); border-radius:5px; padding:10px 11px; outline:none; }
        input:focus,textarea:focus { border-color:var(--bone); box-shadow:0 0 0 2px #d5c5a21a; }
        textarea { min-height:116px; resize:vertical; font:12px/1.55 'JetBrains Mono',monospace; }
        .toolbar-actions { display:flex; gap:8px; }
        .status { min-height:38px; display:flex; align-items:center; gap:9px; margin-bottom:14px; padding:8px 11px; color:var(--muted); background:#151917; border:1px solid #29302b; border-radius:7px; font:11px 'JetBrains Mono',monospace; }
        .status.error { color:#ffc0bb; border-color:#633b37; background:#291b19; }
        .dot { width:7px; height:7px; border-radius:50%; background:var(--blue); box-shadow:0 0 12px var(--blue); }
        .dot.draft { background:var(--bone); box-shadow:0 0 12px var(--bone); }
        .workspace { display:grid; grid-template-columns:minmax(300px,390px) minmax(0,1fr); gap:14px; align-items:start; }
        .panel { overflow:hidden; background:#181c19dd; border:1px solid var(--line); border-radius:9px; box-shadow:0 18px 50px #0004; }
        .panel-head { display:flex; justify-content:space-between; align-items:center; gap:12px; min-height:52px; padding:12px 15px; border-bottom:1px solid var(--line); background:#1d221e; }
        .panel-head h2 { margin:0; font-size:12px; letter-spacing:.08em; text-transform:uppercase; }
        .count { color:var(--muted); font:10px 'JetBrains Mono',monospace; }
        .model-list { min-height:500px; max-height:calc(100vh - 245px); overflow:auto; scrollbar-color:#4b554d #171b18; }
        .model-row { width:100%; display:grid; grid-template-columns:minmax(0,1fr) auto; gap:12px; align-items:center; padding:12px 14px; color:var(--text); background:transparent; border:0; border-bottom:1px solid #29302b; border-radius:0; text-align:left; }
        .model-row:hover,.model-row.active { background:#252c26; }
        .model-row.active { box-shadow:inset 3px 0 var(--bone); }
        .model-name { display:block; overflow:hidden; font-size:13px; font-weight:700; text-overflow:ellipsis; white-space:nowrap; }
        .model-path { display:block; margin-top:3px; overflow:hidden; color:var(--muted); font:9px 'JetBrains Mono',monospace; text-overflow:ellipsis; white-space:nowrap; }
        .id-count { padding:4px 6px; color:var(--bone); border:1px solid #655b44; border-radius:4px; background:#29251c; font:9px 'JetBrains Mono',monospace; white-space:nowrap; }
        .editor { min-height:650px; }
        .editor-body { padding:18px; }
        .editor-grid { display:grid; grid-template-columns:minmax(280px,420px) minmax(0,1fr); gap:16px; }
        .form-card,.preview-card { min-width:0; padding:16px; border:1px solid #354039; border-radius:8px; background:#141815; }
        h3 { margin:0 0 5px; font-size:15px; }
        .hint { margin:0 0 15px; color:var(--muted); font-size:11px; line-height:1.5; }
        label { display:block; margin:12px 0; color:#aab3ac; font-size:10px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; }
        label input,label textarea { margin-top:6px; text-transform:none; }
        .path { padding:9px 10px; overflow-wrap:anywhere; color:#b9c0ba; background:#0d100e; border:1px solid #2e3630; border-radius:5px; font:10px/1.5 'JetBrains Mono',monospace; }
        .path.empty { color:#687069; font-style:italic; }
        .upload { position:relative; display:block; margin-top:11px; padding:12px; color:var(--muted); border:1px dashed #596158; border-radius:6px; text-align:center; cursor:pointer; font-size:11px; }
        .upload:hover { color:var(--text); border-color:var(--bone); background:#25241d; }
        .upload input { position:absolute; inset:0; opacity:0; cursor:pointer; }
        .form-actions { display:flex; justify-content:flex-end; margin-top:15px; }
        model-viewer { width:100%; min-height:480px; height:62vh; max-height:680px; background:radial-gradient(circle at 50% 38%,#3b3d34 0,#181b18 62%,#0a0c0b 100%); --poster-color:transparent; }
        .preview-empty { min-height:480px; display:grid; place-items:center; padding:24px; color:var(--muted); text-align:center; }
        .preview-empty strong { display:block; margin-bottom:5px; color:#c9cec9; }
        .preview-meta { display:flex; justify-content:space-between; gap:12px; padding:10px 0 0; color:var(--muted); font:10px 'JetBrains Mono',monospace; }
        details { margin-top:15px; border:1px solid var(--line); border-radius:8px; background:#141815; }
        summary { padding:12px 14px; cursor:pointer; color:#adb5af; font-size:11px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; }
        pre { max-height:300px; overflow:auto; margin:0; padding:14px; color:#afbeb4; background:#0c0f0d; border-top:1px solid var(--line); font:10px/1.55 'JetBrains Mono',monospace; }
        .empty-editor { min-height:600px; display:grid; place-items:center; color:var(--muted); text-align:center; }
        .empty-editor strong { display:block; margin-bottom:6px; color:#c8cec9; }
        @media (max-width:980px) { .workspace,.editor-grid { grid-template-columns:1fr; } .model-list { min-height:0; max-height:330px; } }
        @media (max-width:620px) { main { width:min(100% - 20px,1480px); } header { align-items:flex-start; flex-direction:column; } .header-actions,.toolbar-actions { width:100%; } .toolbar { grid-template-columns:1fr; } .toolbar-actions button { flex:1; } }
      </style>`}
    </head>
    <body>
      <main>
        <header>
          <div><div class="eyebrow">Shared creature tokens</div><h1>Miniature foundry</h1><p>Map many creature entries to one reusable GLB, shared by every Chronicle server.</p></div>
          <div class="header-actions"><a class="back" href="/internal">← Telemetry</a><a class="back" href="/internal/maps">Map foundry →</a></div>
        </header>
        <section class="toolbar">
          <input id="search" type="search" aria-label="Search miniatures" placeholder="Search name, path, or entry ID" />
          <div class="toolbar-actions"><button id="add">Add model</button><button id="discard" class="danger" disabled>Discard draft</button><button id="save" class="primary" disabled>Save draft</button><button id="publish" class="publish" disabled>Publish</button></div>
        </section>
        <div class="status" id="status" role="status" aria-live="polite"><span class="dot"></span><span>Loading the shared miniature manifest…</span></div>
        <div class="workspace">
          <section class="panel"><div class="panel-head"><h2>Model registry</h2><span class="count" id="count">0 models</span></div><div class="model-list" id="list"></div></section>
          <section class="panel editor" id="editor" aria-live="polite"><div class="empty-editor"><div><strong>No model selected</strong>Add or select a miniature.</div></div></section>
        </div>
      </main>
      {html`<script>
        const els = Object.fromEntries(['search','add','discard','save','publish','status','count','list','editor'].map(id => [id,document.getElementById(id)]));
        let state = null;
        let selected = null;
        let dirty = false;
        let busy = false;
        function escapeHTML(value) { return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
        function setStatus(message,error=false) { els.status.className='status'+(error?' error':''); els.status.innerHTML='<span class="dot '+(!error&&state?.has_draft?'draft':'')+'"></span><span>'+escapeHTML(message)+'</span>'; }
        function setBusy(value) { busy=value; els.search.disabled=value; updateButtons(); }
        function updateButtons() { els.add.disabled=busy||!state; els.save.disabled=busy||!state||!dirty; els.publish.disabled=busy||!state?.has_draft||dirty; els.discard.disabled=busy||!state?.has_draft; }
        function items() { return state?.draft?.miniatures || []; }
        function current() { return items().find(item => item.path === selected) || null; }
        function markDirty() { dirty=true; updateButtons(); renderJSON(); }
        function renderList() {
          const query=els.search.value.trim().toLowerCase();
          const rows=items().filter(item => (item.name+' '+item.path+' '+item.entry_ids.join(' ')).toLowerCase().includes(query));
          els.count.textContent=rows.length+' models';
          els.list.innerHTML=rows.map(item => '<button class="model-row '+(item.path===selected?'active':'')+'" data-path="'+escapeHTML(item.path)+'"><span><span class="model-name">'+escapeHTML(item.name)+'</span><span class="model-path">'+escapeHTML(item.path||'Upload required')+'</span></span><span class="id-count">'+item.entry_ids.length+' IDs</span></button>').join('') || '<div class="empty-editor"><div><strong>No miniatures</strong>Add a shared GLB model.</div></div>';
          document.querySelectorAll('.model-row').forEach(row => row.addEventListener('click',()=>{if(busy)return;syncEditor();selected=row.dataset.path;renderList();renderEditor();}));
        }
        function parseIDs(value) { return value.split(/[\s,]+/).filter(Boolean).map(raw=>Number(raw)); }
        function syncEditor() {
          const item=current(); if(!item)return;
          item.name=document.getElementById('name').value.trim();
          item.entry_ids=parseIDs(document.getElementById('entry-ids').value);
        }
        function previewURL(path) { const filename=path.split('/').pop(); return '/internal/api/v1/miniatures/preview/'+encodeURIComponent(filename); }
        function renderEditor() {
          const item=current();
          if(!item){els.editor.innerHTML='<div class="empty-editor"><div><strong>No model selected</strong>Add or select a miniature.</div></div>';return;}
          const hasPath=item.path.startsWith('miniatures/');
          els.editor.innerHTML='<div class="panel-head"><h2>Miniature editor</h2><span class="count">shared globally</span></div><div class="editor-body"><div class="editor-grid">'+
            '<article class="form-card"><h3>'+escapeHTML(item.name||'New miniature')+'</h3><p class="hint">One model can represent many bosses, creatures, pets, or totems. Each entry ID may belong to only one model.</p>'+
            '<label>Display name<input id="name" type="text" value="'+escapeHTML(item.name)+'" placeholder="Deviate serpent" /></label>'+
            '<div class="path '+(!hasPath?'empty':'')+'">'+escapeHTML(item.path||'Upload a GLB to create its immutable path')+'</div>'+
            '<label class="upload">Upload or replace GLB<input id="file" type="file" accept="model/gltf-binary,.glb" /></label>'+
            '<label>Creature entry IDs<textarea id="entry-ids" placeholder="3669, 3670, 3671">'+escapeHTML(item.entry_ids.join('\\n'))+'</textarea></label>'+
            '<p class="hint">Separate IDs with commas, spaces, or new lines. Positive 32-bit IDs only.</p><div class="form-actions"><button id="remove" class="danger">Remove model</button></div></article>'+
            '<article class="preview-card"><h3>Model preview</h3><p class="hint">Drag to orbit and scroll to zoom. The replay client integration will follow separately.</p>'+
            (hasPath?'<model-viewer src="'+previewURL(item.path)+'" alt="'+escapeHTML((item.name||'Miniature')+' preview')+'" camera-controls auto-rotate shadow-intensity="1" environment-image="neutral"></model-viewer><div class="preview-meta"><span>GLB 2.0</span><a href="'+previewURL(item.path)+'" target="_blank" rel="noreferrer">Open asset ↗</a></div>':'<div class="preview-empty"><div><strong>No GLB uploaded</strong>Upload a model to inspect it here.</div></div>')+'</article></div><details><summary>Draft manifest</summary><pre id="json"></pre></details></div>';
          document.getElementById('name').addEventListener('input',()=>{syncEditor();markDirty();renderList();});
          document.getElementById('entry-ids').addEventListener('input',()=>{syncEditor();markDirty();renderList();});
          document.getElementById('file').addEventListener('change',event=>upload(event.target.files[0]));
          document.getElementById('remove').addEventListener('click',remove);
          renderJSON();
        }
        function renderJSON(){const pre=document.getElementById('json');if(pre&&state)pre.textContent=JSON.stringify(state.draft,null,2);}
        function remove(){const item=current();if(!item)return;state.draft.miniatures=items().filter(candidate=>candidate!==item);selected=items()[0]?.path||null;markDirty();renderList();renderEditor();}
        async function upload(file){
          if(!file||!state)return;syncEditor();const item=current();if(!item)return;setBusy(true);setStatus('Uploading '+file.name+'…');
          try{const data=new FormData();data.append('file',file);const response=await fetch('/internal/api/v1/miniatures/assets',{method:'POST',body:data});const result=await response.json();if(!response.ok)throw new Error(result.error||'Upload failed');item.path=result.path;selected=result.path;dirty=true;setStatus('GLB uploaded. Save the draft to register it.');renderList();renderEditor();}
          catch(error){setStatus(error.message,true);}finally{setBusy(false);}
        }
        async function load(){setBusy(true);setStatus('Loading the shared miniature manifest…');try{const response=await fetch('/internal/api/v1/miniatures');const result=await response.json();if(!response.ok)throw new Error(result.error||'Load failed');state=result;selected=state.draft.miniatures[0]?.path||null;dirty=false;setStatus(state.has_draft?'Saved draft loaded. Publish when ready.':'Published manifest loaded. Changes remain private until saved and published.');renderList();renderEditor();}catch(error){setStatus(error.message,true);}finally{setBusy(false);}}
        async function save(){syncEditor();setBusy(true);setStatus('Validating and saving draft…');try{const response=await fetch('/internal/api/v1/miniatures/draft',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:state.draft_version,miniatures:items()})});const result=await response.json();if(!response.ok)throw new Error(result.error||'Save failed');state.draft=result.draft;state.draft_version=result.draft_version;state.has_draft=true;selected=state.draft.miniatures.find(item=>item.path===selected)?.path||state.draft.miniatures[0]?.path||null;dirty=false;setStatus('Draft saved to R2. The public manifest is unchanged.');renderList();renderEditor();}catch(error){setStatus(error.message,true);}finally{setBusy(false);}}
        async function discard(){if(!confirm('Discard the saved miniature draft? Uploaded but unpublished GLBs remain in R2.'))return;setBusy(true);try{const response=await fetch('/internal/api/v1/miniatures/draft',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:state.draft_version})});const result=await response.json();if(!response.ok)throw new Error(result.error||'Discard failed');await load();}catch(error){setStatus(error.message,true);setBusy(false);}}
        async function publish(){if(!confirm('Publish miniatures/manifest.json for every Chronicle server?'))return;setBusy(true);setStatus('Checking assets and publishing the shared manifest…');try{const response=await fetch('/internal/api/v1/miniatures/publish',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:state.draft_version})});const result=await response.json();if(!response.ok)throw new Error(result.error||'Publish failed');await load();setStatus('Published '+result.manifest+'. CDN caches may take up to one hour to refresh.');}catch(error){setStatus(error.message,true);setBusy(false);}}
        els.search.addEventListener('input',renderList);
        els.add.addEventListener('click',()=>{syncEditor();const temporary='__new__'+crypto.randomUUID();const item={name:'',path:temporary,entry_ids:[]};state.draft.miniatures.push(item);selected=temporary;markDirty();renderList();renderEditor();});
        els.save.addEventListener('click',save);els.discard.addEventListener('click',discard);els.publish.addEventListener('click',publish);load();
      </script>`}
    </body>
  </html>
));

export default miniatureDashboard;
