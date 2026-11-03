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
      <link rel="icon" href="/favicon.png" type="image/png" />
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
      {html`<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.183.2/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.183.2/examples/jsm/"}}</script>`}
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
        input[type='search'],input[type='text'],input[type='number'],textarea { width:100%; color:var(--text); background:#0f1210; border:1px solid var(--line); border-radius:5px; padding:10px 11px; outline:none; }
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
        .scale-row { display:grid; grid-template-columns:minmax(0,1fr) 82px; align-items:center; gap:10px; margin-top:6px; }
        .scale-row input[type='range'] { width:100%; accent-color:var(--moss); }
        .scale-row input[type='number'] { padding:8px 9px; font:11px 'JetBrains Mono',monospace; }
        .scale-readout { display:flex; justify-content:space-between; margin-top:6px; color:var(--muted); font:9px 'JetBrains Mono',monospace; text-transform:none; letter-spacing:0; }
        .form-actions { display:flex; justify-content:flex-end; margin-top:15px; }
        .model-stage { position:relative; min-height:480px; height:62vh; max-height:680px; overflow:hidden; border:1px solid #2c332e; border-radius:6px; background:radial-gradient(circle at 50% 38%,#3b3d34 0,#181b18 62%,#0a0c0b 100%); }
        .model-stage canvas { display:block; width:100%; height:100%; cursor:grab; }
        .model-stage canvas:active { cursor:grabbing; }
        .model-stage-note { position:absolute; left:12px; bottom:10px; padding:6px 8px; color:#b9c7c0; border:1px solid #ffffff1c; border-radius:5px; background:#090c0ab8; font:9px 'JetBrains Mono',monospace; pointer-events:none; }
        .model-stage-note strong { color:#8ec6dd; }
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
          <div><div class="eyebrow">Shared creature models</div><h1>Miniature foundry</h1><p>Publish tabletop miniatures and original game-file GLBs for every Chronicle server.</p></div>
          <div class="header-actions"><a class="back" href="/internal">← Telemetry</a><a class="back" href="/internal/unit-images">Unit image foundry →</a><a class="back" href="/internal/maps">Map foundry →</a></div>
        </header>
        <section class="toolbar">
          <input id="search" type="search" aria-label="Search miniatures" placeholder="Search name, path, or entry ID" />
          <div class="toolbar-actions"><button id="add-miniature">Add miniature</button><button id="add-game-model">Add game model</button><button id="discard" class="danger" disabled>Discard draft</button><button id="save" class="primary" disabled>Save draft</button><button id="publish" class="publish" disabled>Publish</button></div>
        </section>
        <div class="status" id="status" role="status" aria-live="polite"><span class="dot"></span><span>Loading the shared miniature manifest…</span></div>
        <div class="workspace">
          <section class="panel"><div class="panel-head"><h2>Model registry</h2><span class="count" id="count">0 models</span></div><div class="model-list" id="list"></div></section>
          <section class="panel editor" id="editor" aria-live="polite"><div class="empty-editor"><div><strong>No model selected</strong>Add or select a miniature or game model.</div></div></section>
        </div>
      </main>
      {html`<script type="module">
        import * as THREE from 'three';
        import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
        import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
        import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
        const els = Object.fromEntries(['search','add-miniature','add-game-model','discard','save','publish','status','count','list','editor'].map(id => [id,document.getElementById(id)]));
        let state = null;
        let selected = null;
        let dirty = false;
        let busy = false;
        const PLAYER_GEOMETRY_HEIGHT=3;
        const PLAYER_WORLD_HEIGHT=2;
        const BASE_MODEL_HEIGHT=2.6;
        const MESH_MODEL_SCALE=2.5;
        const previewLoader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
        let preview=null;
        function escapeHTML(value) { return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
        function setStatus(message,error=false) { els.status.className='status'+(error?' error':''); els.status.innerHTML='<span class="dot '+(!error&&state?.has_draft?'draft':'')+'"></span><span>'+escapeHTML(message)+'</span>'; }
        function setBusy(value) { busy=value; els.search.disabled=value; updateButtons(); }
        function updateButtons() { els['add-miniature'].disabled=busy||!state; els['add-game-model'].disabled=busy||!state; els.save.disabled=busy||!state||!dirty; els.publish.disabled=busy||!state?.has_draft||dirty; els.discard.disabled=busy||!state?.has_draft; }
        function collection(kind) { return state?.draft?.[kind] || []; }
        function items() { return ['miniatures','game_models'].flatMap(kind => collection(kind).map(item => ({kind,item}))); }
        function itemKey(kind,item) { return kind+':'+item.path; }
        function current() { return items().find(({kind,item}) => itemKey(kind,item) === selected) || null; }
        function markDirty() { dirty=true; updateButtons(); renderJSON(); }
        function renderList() {
          const query=els.search.value.trim().toLowerCase();
          const rows=items().filter(({kind,item}) => (kind+' '+item.name+' '+item.path+' '+item.entry_ids.join(' ')).toLowerCase().includes(query));
          els.count.textContent=rows.length+' models';
          els.list.innerHTML=rows.map(({kind,item}) => {const key=itemKey(kind,item);const type=kind==='miniatures'?'tabletop':'game file';return '<button class="model-row '+(key===selected?'active':'')+'" data-key="'+escapeHTML(key)+'"><span><span class="model-name">'+escapeHTML(item.name)+'</span><span class="model-path">'+type+' · '+escapeHTML(item.path||'Upload required')+'</span></span><span class="id-count">'+item.entry_ids.length+' IDs</span></button>';}).join('') || '<div class="empty-editor"><div><strong>No models</strong>Add a tabletop miniature or original game model.</div></div>';
          document.querySelectorAll('.model-row').forEach(row => row.addEventListener('click',()=>{if(busy)return;syncEditor();selected=row.dataset.key;renderList();renderEditor();}));
        }
        function parseIDs(value) { return value.split(/[\s,]+/).filter(Boolean).map(raw=>Number(raw)); }
        function syncEditor() {
          const selectedItem=current(); if(!selectedItem)return;
          selectedItem.item.name=document.getElementById('name').value.trim();
          selectedItem.item.entry_ids=parseIDs(document.getElementById('entry-ids').value);
          const scale=Number(document.getElementById('map-scale-number').value);
          if(Number.isFinite(scale))selectedItem.item.map_scale=Math.min(10,Math.max(.1,scale));
        }
        function disposePreview() { if(preview){preview.dispose();preview=null;} }
        function disposeObject(root) { root.traverse(child=>{if(child.geometry)child.geometry.dispose();const materials=Array.isArray(child.material)?child.material:child.material?[child.material]:[];for(const material of materials){for(const value of Object.values(material)){if(value?.isTexture)value.dispose();}material.dispose();}}); }
        function mountPreview(url,isGameModel,mapScale,worldHeight) {
          const stage=document.getElementById('model-stage'); if(!stage)return;
          const scene=new THREE.Scene();
          const camera=new THREE.PerspectiveCamera(35,1,.01,1000);
          const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
          renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.shadowMap.enabled=true;stage.prepend(renderer.domElement);
          const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.08;
          scene.add(new THREE.HemisphereLight(0xeef6ff,0x29251d,2.2));
          const key=new THREE.DirectionalLight(0xfff0d2,3);key.position.set(5,8,6);key.castShadow=true;scene.add(key);
          const fill=new THREE.DirectionalLight(0x79b8d2,1.4);fill.position.set(-5,3,-4);scene.add(fill);
          const floor=new THREE.Mesh(new THREE.CircleGeometry(30,64),new THREE.MeshStandardMaterial({color:0x171b18,roughness:.95,metalness:0}));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
          const player=new THREE.Mesh(new THREE.CapsuleGeometry(.9,1.2,4,12).translate(0,1.5,0),new THREE.MeshStandardMaterial({color:0x78b9d5,roughness:.5,metalness:.08}));player.castShadow=true;player.receiveShadow=true;scene.add(player);
          const modelRoot=new THREE.Group();scene.add(modelRoot);
          let model=null,mixer=null,baseScale=1,currentScale=mapScale,disposed=false,frame=0;
          const clock=new THREE.Clock();
          function fit() {
            if(!model)return;
            modelRoot.scale.setScalar(baseScale*currentScale);modelRoot.position.set(0,0,0);
            let box=new THREE.Box3().setFromObject(modelRoot);const center=box.getCenter(new THREE.Vector3());
            modelRoot.position.set(-center.x,-box.min.y,-center.z);box=new THREE.Box3().setFromObject(modelRoot);
            player.position.set(box.min.x-1.5,0,0);
            const combined=box.clone().union(new THREE.Box3().setFromObject(player));
            const target=combined.getCenter(new THREE.Vector3());target.y=Math.max(.8,target.y*.75);controls.target.copy(target);
            const size=combined.getSize(new THREE.Vector3());const radius=Math.max(2.5,size.length()*.62);
            camera.near=Math.max(.01,radius/100);camera.far=radius*100;camera.position.copy(target).add(new THREE.Vector3(radius*.95,radius*.55,radius*1.65));camera.updateProjectionMatrix();controls.update();
          }
          function resize() { const width=Math.max(1,stage.clientWidth),height=Math.max(1,stage.clientHeight);renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix(); }
          const observer=new ResizeObserver(resize);observer.observe(stage);resize();
          function animate() { if(disposed)return;frame=requestAnimationFrame(animate);const delta=Math.min(.05,clock.getDelta());mixer?.update(delta);controls.update();renderer.render(scene,camera); }
          previewLoader.load(url,gltf=>{if(disposed){disposeObject(gltf.scene);return;}model=gltf.scene;model.traverse(child=>{if(child.isMesh){child.castShadow=true;child.receiveShadow=true;}});modelRoot.add(model);const nativeBox=new THREE.Box3().setFromObject(model);const nativeHeight=Math.max(.001,nativeBox.max.y-nativeBox.min.y);baseScale=worldHeight===undefined?(isGameModel?BASE_MODEL_HEIGHT/nativeHeight:BASE_MODEL_HEIGHT)*MESH_MODEL_SCALE:(worldHeight*PLAYER_GEOMETRY_HEIGHT)/(PLAYER_WORLD_HEIGHT*nativeHeight);if(gltf.animations.length){mixer=new THREE.AnimationMixer(model);mixer.clipAction(gltf.animations.find(clip=>/^stand$/i.test(clip.name))||gltf.animations[0]).play();}fit();},undefined,error=>{if(disposed)return;console.error('Unable to load model preview',error);stage.insertAdjacentHTML('beforeend','<div class="preview-empty"><div><strong>Preview failed</strong>Open the asset to inspect it directly.</div></div>');});
          animate();
          preview={setScale(scale){currentScale=scale;fit();},dispose(){disposed=true;cancelAnimationFrame(frame);observer.disconnect();controls.dispose();mixer?.stopAllAction();disposeObject(scene);renderer.dispose();renderer.domElement.remove();}};
        }
        function setMapScale(value) {
          const selectedItem=current(); if(!selectedItem)return;
          if(value==='')return;
          const numeric=Number(value);if(!Number.isFinite(numeric))return;
          const scale=Math.min(10,Math.max(.1,numeric));
          selectedItem.item.map_scale=scale;
          document.getElementById('map-scale').value=String(scale);
          document.getElementById('map-scale-number').value=String(scale);
          markDirty();renderJSON();preview?.setScale(scale);
        }
        function previewURL(path) { const filename=path.split('/').pop(); return '/internal/api/v1/miniatures/preview/'+encodeURIComponent(filename); }
        function renderEditor() {
          disposePreview();
          const selectedItem=current();
          if(!selectedItem){els.editor.innerHTML='<div class="empty-editor"><div><strong>No model selected</strong>Add or select a miniature or game model.</div></div>';return;}
          const {kind,item}=selectedItem;
          const isGameModel=kind==='game_models';
          const typeLabel=isGameModel?'Game model':'Miniature';
          const hasPath=item.path.startsWith('miniatures/');
          els.editor.innerHTML='<div class="panel-head"><h2>'+typeLabel+' editor</h2><span class="count">shared globally</span></div><div class="editor-body"><div class="editor-grid">'+
            '<article class="form-card"><h3>'+escapeHTML(item.name||('New '+typeLabel.toLowerCase()))+'</h3><p class="hint">'+(isGameModel?'Upload the original animated GLB extracted from the game files.':'Upload the tabletop-style GLB used by the 3D replay map.')+' Each entry ID may belong to only one '+typeLabel.toLowerCase()+'.</p>'+
            '<label>Display name<input id="name" type="text" value="'+escapeHTML(item.name)+'" placeholder="Deviate serpent" /></label>'+
            '<div class="path '+(!hasPath?'empty':'')+'">'+escapeHTML(item.path||'Upload a GLB to create its immutable path')+'</div>'+
            '<label class="upload">Upload or replace GLB<input id="file" type="file" accept="model/gltf-binary,.glb" /></label>'+
            '<label>Creature entry IDs<textarea id="entry-ids" placeholder="3669, 3670, 3671">'+escapeHTML(item.entry_ids.join(String.fromCharCode(10)))+'</textarea></label>'+
            '<p class="hint">Separate IDs with commas, spaces, or new lines. Positive 32-bit IDs only.</p>'+
            '<label>Map size<div class="scale-row"><input id="map-scale" type="range" min="0.1" max="10" step="0.05" value="'+(item.map_scale||1)+'" /><input id="map-scale-number" type="number" min="0.1" max="10" step="0.05" value="'+(item.map_scale||1)+'" /></div><span class="scale-readout"><span>0.1×</span><span>Baseline 1×</span><span>10× max</span></span></label>'+
            '<p class="hint">Adjust this model relative to a standard player on the 3D replay map. Existing models default to 1×.</p><div class="form-actions"><button id="remove" class="danger">Remove model</button></div></article>'+
            '<article class="preview-card"><h3>Model preview</h3><p class="hint">Drag to orbit and scroll to zoom.'+(isGameModel?' Animation clips from the extracted game model are available in compatible viewers.':' This model is optimized for the replay map.')+'</p>'+
            (hasPath?'<div class="model-stage" id="model-stage" role="img" aria-label="'+escapeHTML((item.name||typeLabel)+' beside a standard player')+'"><div class="model-stage-note"><strong>Blue capsule</strong> = standard player</div></div><div class="preview-meta"><span>GLB 2.0 · true relative map size</span><a href="'+previewURL(item.path)+'" target="_blank" rel="noreferrer">Open asset ↗</a></div>':'<div class="preview-empty"><div><strong>No GLB uploaded</strong>Upload a model to inspect it here.</div></div>')+'</article></div><details><summary>Draft manifest</summary><pre id="json"></pre></details></div>';
          document.getElementById('name').addEventListener('input',()=>{syncEditor();markDirty();renderList();});
          document.getElementById('entry-ids').addEventListener('input',()=>{syncEditor();markDirty();renderList();});
          document.getElementById('map-scale').addEventListener('input',event=>setMapScale(event.target.value));
          document.getElementById('map-scale-number').addEventListener('input',event=>setMapScale(event.target.value));
          document.getElementById('file').addEventListener('change',event=>upload(event.target.files[0]));
          document.getElementById('remove').addEventListener('click',remove);
          renderJSON();
          if(hasPath){const entry=item.entry_ids[0];mountPreview(previewURL(item.path),isGameModel,item.map_scale||1,item.world_heights?.[entry]);}
        }
        function renderJSON(){const pre=document.getElementById('json');if(pre&&state)pre.textContent=JSON.stringify(state.draft,null,2);}
        function remove(){const selectedItem=current();if(!selectedItem)return;const {kind,item}=selectedItem;if(!confirm('Remove "'+(item.name||'this model')+'" from the draft? The uploaded GLB will remain in R2 until cleaned up separately.'))return;state.draft[kind]=collection(kind).filter(candidate=>candidate!==item);selected=items()[0] ? itemKey(items()[0].kind,items()[0].item) : null;markDirty();renderList();renderEditor();}
        async function upload(file){
          if(!file||!state)return;syncEditor();const selectedItem=current();if(!selectedItem)return;setBusy(true);setStatus('Uploading '+file.name+'…');
          try{const data=new FormData();data.append('file',file);const response=await fetch('/internal/api/v1/miniatures/assets',{method:'POST',body:data});const result=await response.json();if(!response.ok)throw new Error(result.error||'Upload failed');selectedItem.item.path=result.path;selected=itemKey(selectedItem.kind,selectedItem.item);dirty=true;setStatus('GLB uploaded. Save the draft to register it.');renderList();renderEditor();}
          catch(error){setStatus(error.message,true);}finally{setBusy(false);}
        }
        function firstKey(){const first=items()[0];return first?itemKey(first.kind,first.item):null;}
        async function load(){setBusy(true);setStatus('Loading the shared miniature manifest…');try{const response=await fetch('/internal/api/v1/miniatures');const result=await response.json();if(!response.ok)throw new Error(result.error||'Load failed');state=result;selected=firstKey();dirty=false;setStatus(state.has_draft?'Saved draft loaded. Publish when ready.':'Published manifest loaded. Changes remain private until saved and published.');renderList();renderEditor();}catch(error){setStatus(error.message,true);}finally{setBusy(false);}}
        async function save(){syncEditor();setBusy(true);setStatus('Validating and saving draft…');try{const response=await fetch('/internal/api/v1/miniatures/draft',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:state.draft_version,miniatures:collection('miniatures'),game_models:collection('game_models')})});const result=await response.json();if(!response.ok)throw new Error(result.error||'Save failed');state.draft=result.draft;state.draft_version=result.draft_version;state.has_draft=true;if(!current())selected=firstKey();dirty=false;setStatus('Draft saved to R2. The public manifest is unchanged.');renderList();renderEditor();}catch(error){setStatus(error.message,true);}finally{setBusy(false);}}
        async function discard(){if(!confirm('Discard the saved miniature draft? Uploaded but unpublished GLBs remain in R2.'))return;setBusy(true);try{const response=await fetch('/internal/api/v1/miniatures/draft',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:state.draft_version})});const result=await response.json();if(!response.ok)throw new Error(result.error||'Discard failed');await load();}catch(error){setStatus(error.message,true);setBusy(false);}}
        async function publish(){if(!confirm('Publish miniatures/manifest.json for every Chronicle server?'))return;setBusy(true);setStatus('Checking assets and publishing the shared manifest…');try{const response=await fetch('/internal/api/v1/miniatures/publish',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:state.draft_version})});const result=await response.json();if(!response.ok)throw new Error(result.error||'Publish failed');await load();setStatus('Published '+result.manifest+'. CDN caches may take up to one hour to refresh.');}catch(error){setStatus(error.message,true);setBusy(false);}}
        function add(kind){syncEditor();const temporary='__new__'+crypto.randomUUID();const item={name:'',path:temporary,entry_ids:[],map_scale:1};state.draft[kind].push(item);selected=itemKey(kind,item);markDirty();renderList();renderEditor();}
        els.search.addEventListener('input',renderList);
        els['add-miniature'].addEventListener('click',()=>add('miniatures'));
        els['add-game-model'].addEventListener('click',()=>add('game_models'));
        els.save.addEventListener('click',save);els.discard.addEventListener('click',discard);els.publish.addEventListener('click',publish);load();
      </script>`}
    </body>
  </html>
));

export default miniatureDashboard;
