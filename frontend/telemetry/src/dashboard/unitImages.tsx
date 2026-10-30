import { Hono } from "hono";
import { html } from "hono/html";
import type { Env } from "../types";

const unitImageDashboard = new Hono<{ Bindings: Env }>();

unitImageDashboard.get("/internal/unit-images", (c) => c.html(
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Unit image foundry · Chronicle Telemetry</title>
      <link rel="icon" href="/favicon.png" type="image/png" />
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
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
        .header-actions,.toolbar-actions,.row,.variant-tabs { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
        button,input,textarea { font:inherit; }
        button { border:1px solid var(--line); border-radius:6px; padding:9px 12px; color:var(--text); background:#242a25; cursor:pointer; font-size:12px; font-weight:700; }
        button:hover:not(:disabled) { border-color:#69756c; background:#2c342e; }
        button:disabled { opacity:.42; cursor:not-allowed; }
        button.primary { color:#11150e; background:var(--moss); border-color:var(--moss); }
        button.publish { color:#1e180d; background:var(--bone); border-color:var(--bone); }
        button.danger { color:#ffaaa4; }
        button.variant.active { color:#15120c; background:var(--bone); border-color:var(--bone); }
        .back { padding:9px 12px; border:1px solid var(--line); border-radius:6px; background:#171b18; font-size:12px; }
        .toolbar { display:grid; grid-template-columns:minmax(240px,1fr) auto; gap:10px; margin-bottom:14px; padding:12px; border:1px solid var(--line); border-radius:9px; background:#171b18dd; box-shadow:0 14px 40px #0004; }
        input[type='search'],input[type='text'],textarea { width:100%; color:var(--text); background:#0f1210; border:1px solid var(--line); border-radius:5px; padding:10px 11px; outline:none; }
        input:focus,textarea:focus { border-color:var(--bone); box-shadow:0 0 0 2px #d5c5a21a; }
        textarea { min-height:100px; resize:vertical; font:12px/1.55 'JetBrains Mono',monospace; }
        .status { min-height:38px; display:flex; align-items:center; gap:9px; margin-bottom:14px; padding:8px 11px; color:var(--muted); background:#151917; border:1px solid #29302b; border-radius:7px; font:11px 'JetBrains Mono',monospace; }
        .status.error { color:#ffc0bb; border-color:#633b37; background:#291b19; }
        .dot { width:7px; height:7px; border-radius:50%; background:var(--blue); box-shadow:0 0 12px var(--blue); }
        .dot.draft { background:var(--bone); box-shadow:0 0 12px var(--bone); }
        .workspace { display:grid; grid-template-columns:minmax(300px,390px) minmax(0,1fr); gap:14px; align-items:start; }
        .panel { overflow:hidden; background:#181c19dd; border:1px solid var(--line); border-radius:9px; box-shadow:0 18px 50px #0004; }
        .panel-head { display:flex; justify-content:space-between; align-items:center; gap:12px; min-height:52px; padding:12px 15px; border-bottom:1px solid var(--line); background:#1d221e; }
        .panel-head h2 { margin:0; font-size:12px; letter-spacing:.08em; text-transform:uppercase; }
        .count { color:var(--muted); font:10px 'JetBrains Mono',monospace; }
        .unit-list { min-height:500px; max-height:calc(100vh - 245px); overflow:auto; scrollbar-color:#4b554d #171b18; }
        .unit-row { width:100%; display:grid; grid-template-columns:minmax(0,1fr) auto; gap:12px; align-items:center; padding:12px 14px; color:var(--text); background:transparent; border:0; border-bottom:1px solid #29302b; border-radius:0; text-align:left; }
        .unit-row:hover,.unit-row.active { background:#252c26; }
        .unit-row.active { box-shadow:inset 3px 0 var(--bone); }
        .unit-name { display:block; overflow:hidden; font-size:13px; font-weight:700; text-overflow:ellipsis; white-space:nowrap; }
        .unit-meta { display:block; margin-top:3px; overflow:hidden; color:var(--muted); font:9px 'JetBrains Mono',monospace; text-overflow:ellipsis; white-space:nowrap; }
        .id-count { padding:4px 6px; color:var(--bone); border:1px solid #655b44; border-radius:4px; background:#29251c; font:9px 'JetBrains Mono',monospace; white-space:nowrap; }
        .editor { min-height:690px; }
        .editor-body { padding:18px; }
        .editor-grid { display:grid; grid-template-columns:minmax(270px,370px) minmax(420px,1fr); gap:16px; }
        .form-card,.crop-card { min-width:0; padding:16px; border:1px solid #354039; border-radius:8px; background:#141815; }
        h3 { margin:0 0 5px; font-size:15px; }
        .hint { margin:0 0 15px; color:var(--muted); font-size:11px; line-height:1.5; }
        label { display:block; margin:12px 0; color:#aab3ac; font-size:10px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; }
        label input,label textarea { margin-top:6px; text-transform:none; }
        .path { padding:9px 10px; overflow-wrap:anywhere; color:#b9c0ba; background:#0d100e; border:1px solid #2e3630; border-radius:5px; font:10px/1.5 'JetBrains Mono',monospace; }
        .upload { position:relative; display:block; margin-top:11px; padding:12px; color:var(--muted); border:1px dashed #596158; border-radius:6px; text-align:center; cursor:pointer; font-size:11px; }
        .upload:hover { color:var(--text); border-color:var(--bone); background:#25241d; }
        .upload input { position:absolute; inset:0; opacity:0; cursor:pointer; }
        .form-actions { display:flex; justify-content:space-between; gap:8px; margin-top:15px; }
        .crop-stage { position:relative; width:min(100%,620px); aspect-ratio:1; margin:12px auto; overflow:hidden; border:1px solid #4a544c; border-radius:8px; background:radial-gradient(circle,#352b25,#0d0f0e 68%); touch-action:none; cursor:grab; }
        .crop-stage.dragging { cursor:grabbing; }
        #crop-canvas { width:100%; height:100%; display:block; }
        .crop-guide { position:absolute; inset:0; pointer-events:none; box-shadow:inset 0 0 0 1px #fff2; background:linear-gradient(90deg,transparent 33.2%,#fff2 33.3%,#fff2 33.5%,transparent 33.6%,transparent 66.4%,#fff2 66.5%,#fff2 66.7%,transparent 66.8%),linear-gradient(transparent 33.2%,#fff2 33.3%,#fff2 33.5%,transparent 33.6%,transparent 66.4%,#fff2 66.5%,#fff2 66.7%,transparent 66.8%); }
        .crop-empty { position:absolute; inset:0; display:grid; place-items:center; padding:30px; color:var(--muted); text-align:center; pointer-events:none; }
        .slider { display:grid; grid-template-columns:54px minmax(0,1fr) 46px; gap:8px; align-items:center; margin-top:10px; color:var(--muted); font:10px 'JetBrains Mono',monospace; }
        .slider input { width:100%; accent-color:var(--bone); }
        .crop-actions { display:flex; justify-content:flex-end; gap:8px; margin-top:14px; }
        details { margin-top:15px; border:1px solid var(--line); border-radius:8px; background:#141815; }
        summary { padding:12px 14px; cursor:pointer; color:#adb5af; font-size:11px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; }
        pre { max-height:300px; overflow:auto; margin:0; padding:14px; color:#afbeb4; background:#0c0f0d; border-top:1px solid var(--line); font:10px/1.55 'JetBrains Mono',monospace; }
        .empty-editor { min-height:600px; display:grid; place-items:center; color:var(--muted); text-align:center; }
        .empty-editor strong { display:block; margin-bottom:6px; color:#c8cec9; }
        @media (max-width:1050px) { .workspace,.editor-grid { grid-template-columns:1fr; } .unit-list { min-height:0; max-height:330px; } }
        @media (max-width:620px) { main { width:min(100% - 20px,1480px); } header { align-items:flex-start; flex-direction:column; } .header-actions,.toolbar-actions { width:100%; } .toolbar { grid-template-columns:1fr; } .toolbar-actions button { flex:1; } }
      </style>`}
    </head>
    <body>
      <main>
        <header>
          <div><div class="eyebrow">Shared creature artwork</div><h1>Unit image foundry</h1><p>Upload, recrop, label, and publish square unit artwork shared by every Chronicle server.</p></div>
          <div class="header-actions"><a class="back" href="/internal">← Telemetry</a><a class="back" href="/internal/miniatures">Miniature foundry →</a></div>
        </header>
        <section class="toolbar">
          <input id="search" type="search" aria-label="Search unit images" placeholder="Search name, label, path, or entry ID" />
          <div class="toolbar-actions"><button id="add">Add unit</button><button id="discard" class="danger" disabled>Discard draft</button><button id="save" class="primary" disabled>Save draft</button><button id="publish" class="publish" disabled>Publish</button></div>
        </section>
        <div class="status" id="status" role="status" aria-live="polite"><span class="dot"></span><span>Loading the shared unit image manifest…</span></div>
        <div class="workspace">
          <section class="panel"><div class="panel-head"><h2>Image registry</h2><span class="count" id="count">0 units</span></div><div class="unit-list" id="list"></div></section>
          <section class="panel editor" id="editor" aria-live="polite"><div class="empty-editor"><div><strong>No unit selected</strong>Add or select a unit image set.</div></div></section>
        </div>
      </main>
      {html`<script>
        const els=Object.fromEntries(['search','add','discard','save','publish','status','count','list','editor'].map(id=>[id,document.getElementById(id)]));
        const crop={image:null,url:null,zoom:1,x:0,y:0,dragging:false,startX:0,startY:0,startOffsetX:0,startOffsetY:0,label:'headshot',labelDraft:false};
        let state=null,selected=null,dirty=false,busy=false;
        function escapeHTML(value){return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
        function formatBytes(bytes){if(!Number.isFinite(bytes))return '';if(bytes<1024)return bytes+' B';const units=['KB','MB','GB'];let value=bytes/1024,index=0;while(value>=1024&&index<units.length-1){value/=1024;index++;}return value.toFixed(value>=10?1:2)+' '+units[index];}
        function setStatus(message,error=false){els.status.className='status'+(error?' error':'');els.status.innerHTML='<span class="dot '+(!error&&state?.has_draft?'draft':'')+'"></span><span>'+escapeHTML(message)+'</span>';}
        function setBusy(value){busy=value;els.search.disabled=value;updateButtons();}
        function updateButtons(){els.add.disabled=busy||!state;els.save.disabled=busy||!state||!dirty;els.publish.disabled=busy||!state?.has_draft||dirty;els.discard.disabled=busy||!state?.has_draft;}
        function items(){return state?.draft?.units||[];}
        function current(){return items().find(item=>item.name===selected)||null;}
        function markDirty(){dirty=true;updateButtons();renderJSON();}
        function itemSearch(item){return (item.name+' '+item.entry_ids.join(' ')+' '+Object.entries(item.images).flat().join(' ')).toLowerCase();}
        function renderList(){const query=els.search.value.trim().toLowerCase();const rows=items().filter(item=>itemSearch(item).includes(query));els.count.textContent=rows.length+' units';els.list.innerHTML=rows.map(item=>'<button class="unit-row '+(item.name===selected?'active':'')+'" data-name="'+escapeHTML(item.name)+'"><span><span class="unit-name">'+escapeHTML(item.name||'New unit')+'</span><span class="unit-meta">'+Object.keys(item.images).join(', ')+'</span></span><span class="id-count">'+item.entry_ids.length+' IDs</span></button>').join('')||'<div class="empty-editor"><div><strong>No unit images</strong>Add a unit image set.</div></div>';document.querySelectorAll('.unit-row').forEach(row=>row.addEventListener('click',()=>{if(busy)return;syncEditor();selected=row.dataset.name;crop.labelDraft=false;clearCrop();renderList();renderEditor();}));}
        function parseIDs(value){return value.split(/[\\s,]+/).filter(Boolean).map(raw=>Number(raw));}
        function syncEditor(){const item=current();if(!item)return;const oldName=item.name;item.name=document.getElementById('name').value.trim();item.entry_ids=parseIDs(document.getElementById('entry-ids').value);if(selected===oldName)selected=item.name;}
        function previewURL(path){const filename=path.split('/').pop();return '/internal/api/v1/unit-images/preview/'+encodeURIComponent(filename);}
        function activePath(){return current()?.images?.[crop.label]||null;}
        function variantButtons(item){return Object.keys(item.images).sort().map(label=>'<button class="variant '+(label===crop.label?'active':'')+'" data-label="'+escapeHTML(label)+'">'+escapeHTML(label)+'</button>').join('');}
        function renderEditor(){const item=current();if(!item){els.editor.innerHTML='<div class="empty-editor"><div><strong>No unit selected</strong>Add or select a unit image set.</div></div>';return;}if(!crop.labelDraft&&!item.images[crop.label])crop.label=Object.keys(item.images)[0]||'headshot';const path=activePath();const size=path?state.asset_sizes?.[path]:null;const pathLabel=path?path+(Number.isFinite(size)?' · '+formatBytes(size):''):'Choose an image, adjust the crop, then upload it';els.editor.innerHTML='<div class="panel-head"><h2>Image editor</h2><span class="count">browser crop · 1024² WebP</span></div><div class="editor-body"><div class="editor-grid">'+
          '<article class="form-card"><h3>'+escapeHTML(item.name||'New unit')+'</h3><p class="hint">One image set can represent several creature entry IDs. Labels are open-ended: headshot, full, card, silhouette, and more.</p><label>Registry name<input id="name" type="text" value="'+escapeHTML(item.name)+'" placeholder="ony-onyxia" /></label><label>Creature entry IDs<textarea id="entry-ids" placeholder="10184">'+escapeHTML(item.entry_ids.join('\\n'))+'</textarea></label><p class="hint">Each entry ID may belong to only one unit image set.</p><div class="variant-tabs">'+variantButtons(item)+'</div><label>Image label<input id="label" type="text" value="'+escapeHTML(crop.label)+'" placeholder="headshot" /></label><div class="path '+(!path?'empty':'')+'">'+escapeHTML(pathLabel)+'</div><label class="upload">Choose source image<input id="source-file" type="file" accept="image/avif,image/jpeg,image/png,image/webp" /></label><div class="form-actions"><button id="remove-image" class="danger" '+(!path?'disabled':'')+'>Remove variant</button><button id="remove-unit" class="danger">Remove unit</button></div></article>'+
          '<article class="crop-card"><h3>Square crop</h3><p class="hint">Drag the image to reposition it. Use the slider for subtle zoom changes. The exported WebP is immutable; the manifest switches to its new content-addressed URL.</p><div class="crop-stage" id="crop-stage"><canvas id="crop-canvas" width="1024" height="1024"></canvas><div class="crop-guide"></div><div class="crop-empty" id="crop-empty"><div><strong>Choose a source image</strong><br />or load the registered variant below.</div></div></div><div class="slider"><span>Zoom</span><input id="zoom" type="range" min="1" max="4" step="0.01" value="'+crop.zoom+'" /><output id="zoom-value">'+crop.zoom.toFixed(2)+'×</output></div><div class="crop-actions"><button id="reset-crop">Reset crop</button><button id="load-current" '+(!path?'disabled':'')+'>Load registered</button><button id="upload-crop" class="primary" '+(!crop.image?'disabled':'')+'>Upload crop</button></div></article></div><details><summary>Draft manifest</summary><pre id="json"></pre></details></div>';
          document.getElementById('name').addEventListener('input',()=>{syncEditor();markDirty();renderList();});document.getElementById('entry-ids').addEventListener('input',()=>{syncEditor();markDirty();renderList();});document.getElementById('label').addEventListener('input',event=>{crop.label=event.target.value.trim().toLowerCase();crop.labelDraft=true;});document.getElementById('source-file').addEventListener('change',event=>loadFile(event.target.files[0]));document.getElementById('zoom').addEventListener('input',event=>{crop.zoom=Number(event.target.value);document.getElementById('zoom-value').textContent=crop.zoom.toFixed(2)+'×';drawCrop();});document.getElementById('reset-crop').addEventListener('click',resetCrop);document.getElementById('load-current').addEventListener('click',()=>loadSource(previewURL(activePath())));document.getElementById('upload-crop').addEventListener('click',uploadCrop);document.getElementById('remove-image').addEventListener('click',removeImage);document.getElementById('remove-unit').addEventListener('click',removeUnit);document.querySelectorAll('.variant').forEach(button=>button.addEventListener('click',()=>{crop.label=button.dataset.label;crop.labelDraft=false;clearCrop();renderEditor();}));bindCropDrag();drawCrop();renderJSON();}
        function clearCrop(){if(crop.url?.startsWith('blob:'))URL.revokeObjectURL(crop.url);crop.image=null;crop.url=null;crop.zoom=1;crop.x=0;crop.y=0;}
        function loadFile(file){if(!file)return;clearCrop();loadSource(URL.createObjectURL(file));}
        function loadSource(url){clearCrop();crop.url=url;const image=new Image();image.onload=()=>{crop.image=image;crop.zoom=1;crop.x=0;crop.y=0;drawCrop();renderEditor();};image.onerror=()=>setStatus('Could not load the selected image.',true);image.src=url;}
        function resetCrop(){crop.zoom=1;crop.x=0;crop.y=0;const slider=document.getElementById('zoom');if(slider)slider.value='1';drawCrop();}
        function drawCrop(){const canvas=document.getElementById('crop-canvas');if(!canvas)return;const context=canvas.getContext('2d');context.clearRect(0,0,canvas.width,canvas.height);const empty=document.getElementById('crop-empty');if(!crop.image){if(empty)empty.style.display='grid';return;}if(empty)empty.style.display='none';const base=Math.max(canvas.width/crop.image.naturalWidth,canvas.height/crop.image.naturalHeight);const scale=base*crop.zoom;const width=crop.image.naturalWidth*scale;const height=crop.image.naturalHeight*scale;context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';context.drawImage(crop.image,(canvas.width-width)/2+crop.x,(canvas.height-height)/2+crop.y,width,height);}
        function bindCropDrag(){const stage=document.getElementById('crop-stage');if(!stage)return;stage.addEventListener('pointerdown',event=>{if(!crop.image)return;crop.dragging=true;crop.startX=event.clientX;crop.startY=event.clientY;crop.startOffsetX=crop.x;crop.startOffsetY=crop.y;stage.setPointerCapture(event.pointerId);stage.classList.add('dragging');});stage.addEventListener('pointermove',event=>{if(!crop.dragging)return;const ratio=1024/stage.clientWidth;crop.x=crop.startOffsetX+(event.clientX-crop.startX)*ratio;crop.y=crop.startOffsetY+(event.clientY-crop.startY)*ratio;drawCrop();});const stop=()=>{crop.dragging=false;stage.classList.remove('dragging');};stage.addEventListener('pointerup',stop);stage.addEventListener('pointercancel',stop);}
        function canvasBlob(){return new Promise((resolve,reject)=>document.getElementById('crop-canvas').toBlob(blob=>blob?resolve(blob):reject(new Error('Browser could not encode the crop')),'image/webp',.9));}
        async function uploadCrop(){const item=current();const label=(document.getElementById('label').value||'').trim().toLowerCase();if(!item||!crop.image)return;if(!/^[a-z][a-z0-9_-]*$/.test(label)){setStatus('Image label must start with a letter and use lowercase letters, numbers, _ or -.',true);return;}setBusy(true);setStatus('Encoding and uploading '+label+' crop…');try{const blob=await canvasBlob();const data=new FormData();data.append('file',new File([blob],(item.name||'unit')+'-'+label+'.webp',{type:'image/webp'}));const response=await fetch('/internal/api/v1/unit-images/assets',{method:'POST',body:data});const result=await response.json();if(!response.ok)throw new Error(result.error||'Upload failed');item.images[label]=result.path;state.asset_sizes??={};state.asset_sizes[result.path]=result.size;crop.label=label;crop.labelDraft=false;dirty=true;setStatus('Crop uploaded. Save the draft to register it.');renderList();loadSource(previewURL(result.path));}catch(error){setStatus(error.message,true);}finally{setBusy(false);}}
        function removeImage(){const item=current();const path=activePath();if(!item||!path)return;if(!confirm('Remove the '+crop.label+' image from this unit? The immutable file remains in R2.'))return;delete item.images[crop.label];crop.label=Object.keys(item.images)[0]||'headshot';clearCrop();markDirty();renderList();renderEditor();}
        function removeUnit(){const item=current();if(!item)return;if(!confirm('Remove "'+(item.name||'this unit')+'" from the draft? Uploaded images remain in R2.'))return;state.draft.units=items().filter(candidate=>candidate!==item);selected=items()[0]?.name||null;clearCrop();markDirty();renderList();renderEditor();}
        function renderJSON(){const pre=document.getElementById('json');if(pre&&state)pre.textContent=JSON.stringify(state.draft,null,2);}
        async function load(){setBusy(true);setStatus('Loading the shared unit image manifest…');try{const response=await fetch('/internal/api/v1/unit-images');const result=await response.json();if(!response.ok)throw new Error(result.error||'Load failed');state=result;selected=state.draft.units[0]?.name||null;dirty=false;setStatus(state.has_draft?'Saved draft loaded. Publish when ready.':'Published manifest loaded. Changes remain private until saved and published.');renderList();renderEditor();}catch(error){setStatus(error.message,true);}finally{setBusy(false);}}
        async function save(){syncEditor();setBusy(true);setStatus('Validating and saving draft…');try{const response=await fetch('/internal/api/v1/unit-images/draft',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:state.draft_version,units:items()})});const result=await response.json();if(!response.ok)throw new Error(result.error||'Save failed');state.draft=result.draft;state.draft_version=result.draft_version;state.has_draft=true;selected=state.draft.units.find(item=>item.name===selected)?.name||state.draft.units[0]?.name||null;dirty=false;setStatus('Draft saved to R2. The public manifest is unchanged.');renderList();renderEditor();}catch(error){setStatus(error.message,true);}finally{setBusy(false);}}
        async function discard(){if(!confirm('Discard the saved unit image draft? Uploaded but unpublished images remain in R2.'))return;setBusy(true);try{const response=await fetch('/internal/api/v1/unit-images/draft',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:state.draft_version})});const result=await response.json();if(!response.ok)throw new Error(result.error||'Discard failed');clearCrop();await load();}catch(error){setStatus(error.message,true);setBusy(false);}}
        async function publish(){if(!confirm('Publish unit-images/manifest.json for every Chronicle server?'))return;setBusy(true);setStatus('Checking images and publishing the shared manifest…');try{const response=await fetch('/internal/api/v1/unit-images/publish',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:state.draft_version})});const result=await response.json();if(!response.ok)throw new Error(result.error||'Publish failed');clearCrop();await load();setStatus('Published '+result.manifest+'. CDN caches may take up to one hour to refresh.');}catch(error){setStatus(error.message,true);setBusy(false);}}
        els.search.addEventListener('input',renderList);els.add.addEventListener('click',()=>{syncEditor();let name='new-unit';let suffix=2;while(items().some(item=>item.name===name))name='new-unit-'+suffix++;const item={name,entry_ids:[],images:{}};state.draft.units.push(item);selected=name;crop.label='headshot';crop.labelDraft=false;clearCrop();markDirty();renderList();renderEditor();});els.save.addEventListener('click',save);els.discard.addEventListener('click',discard);els.publish.addEventListener('click',publish);load();
      </script>`}
    </body>
  </html>
));

export default unitImageDashboard;
