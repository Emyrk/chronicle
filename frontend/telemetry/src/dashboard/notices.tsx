import { Hono } from "hono";
import { html } from "hono/html";
import type { Env } from "../types";

const noticesDashboard = new Hono<{ Bindings: Env }>();

noticesDashboard.get("/internal/notices", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT deployment_id, version, access_url
     FROM deployment_latest
     WHERE last_report_id IS NOT NULL
     ORDER BY last_reported_at DESC`
  ).all<{ deployment_id: string; version: string; access_url: string }>();
  const deployments = results ?? [];

  return c.html(
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Notice control room · Chronicle Telemetry</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Manrope:wght@400;500;600;700&display=swap" rel="stylesheet" />
        {html`<style>
          :root { --bg:#131718; --panel:#1b2122; --line:#334042; --text:#e9eeee; --muted:#8d9b9d; --accent:#79b6c7; --good:#82b899; --warn:#d6ac68; --danger:#e47b72; }
          * { box-sizing:border-box; }
          body { margin:0; min-height:100vh; color:var(--text); background:radial-gradient(circle at 75% 0%,#243033 0,transparent 32rem),var(--bg); font-family:'Manrope',sans-serif; }
          body::before { content:''; position:fixed; inset:0; pointer-events:none; opacity:.18; background-image:linear-gradient(#ffffff08 1px,transparent 1px),linear-gradient(90deg,#ffffff08 1px,transparent 1px); background-size:32px 32px; }
          main { position:relative; width:min(1400px,calc(100% - 40px)); margin:0 auto; padding:32px 0 64px; }
          header { display:flex; justify-content:space-between; gap:24px; align-items:flex-end; margin-bottom:28px; }
          .eyebrow,.mono { font-family:'IBM Plex Mono',monospace; }
          .eyebrow { color:var(--accent); font-size:11px; letter-spacing:.16em; text-transform:uppercase; }
          h1 { margin:7px 0 5px; font-size:clamp(27px,4vw,44px); letter-spacing:-.04em; }
          header p { margin:0; color:var(--muted); font-size:14px; }
          a { color:var(--accent); text-decoration:none; }
          .back { border:1px solid var(--line); padding:9px 13px; border-radius:6px; background:#182021; font-size:12px; }
          .workspace { display:grid; grid-template-columns:minmax(340px,460px) minmax(0,1fr); gap:20px; align-items:start; }
          .panel { background:color-mix(in srgb,var(--panel) 94%,transparent); border:1px solid var(--line); border-radius:10px; box-shadow:0 20px 50px #0005; }
          .form-panel { padding:20px; position:sticky; top:20px; }
          h2 { margin:0 0 15px; font-size:13px; text-transform:uppercase; letter-spacing:.1em; color:#b8c3c4; }
          label { display:block; margin-bottom:12px; color:var(--muted); font-size:11px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; }
          input,select,textarea { width:100%; margin-top:6px; padding:10px 11px; color:var(--text); background:#111617; border:1px solid var(--line); border-radius:5px; font:13px 'Manrope',sans-serif; outline:none; }
          input:focus,select:focus,textarea:focus { border-color:var(--accent); box-shadow:0 0 0 2px #79b6c722; }
          textarea { min-height:112px; resize:vertical; line-height:1.5; }
          .grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
          .switch { display:flex; align-items:center; gap:8px; text-transform:none; letter-spacing:0; font-size:13px; }
          .switch input { width:auto; margin:0; accent-color:var(--accent); }
          .actions { display:flex; gap:8px; margin-top:17px; }
          button { border:1px solid var(--line); border-radius:5px; padding:9px 12px; background:#222b2d; color:var(--text); cursor:pointer; font:600 12px 'Manrope',sans-serif; }
          button:hover { border-color:#526568; background:#293436; }
          button.primary { flex:1; color:#101718; background:var(--accent); border-color:var(--accent); }
          button.danger { color:var(--danger); }
          .hint { font-size:11px; color:#6f7d7f; line-height:1.45; margin-top:-5px; margin-bottom:12px; }
          .error { display:none; padding:10px; margin-bottom:12px; color:#ffc0ba; background:#3a211f; border:1px solid #703b36; border-radius:5px; font-size:12px; }
          .preview { margin-top:18px; padding-top:18px; border-top:1px solid var(--line); }
          .notice-card { position:relative; overflow:hidden; padding:15px 16px 15px 19px; background:#151b1c; border:1px solid var(--line); border-radius:7px; }
          .notice-card::before { content:''; position:absolute; inset:0 auto 0 0; width:4px; background:var(--accent); }
          .notice-card[data-severity='warning']::before { background:var(--warn); }
          .notice-card[data-severity='critical']::before { background:var(--danger); }
          .notice-meta { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:8px; }
          .tag { font:500 10px 'IBM Plex Mono',monospace; padding:3px 6px; color:#aab8ba; background:#232c2e; border-radius:3px; text-transform:uppercase; }
          .notice-title { font-weight:700; margin-bottom:5px; }
          .notice-message { white-space:pre-wrap; color:#aeb9ba; line-height:1.48; font-size:13px; }
          .notice-action { display:inline-block; margin-top:11px; font-size:12px; font-weight:700; color:var(--accent); }
          .list-panel { padding:20px; min-height:460px; }
          .list-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; }
          .count { font:500 11px 'IBM Plex Mono',monospace; color:var(--muted); }
          #notice-list { display:grid; gap:10px; }
          .row { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:12px; padding:14px; border:1px solid #2d383a; border-radius:7px; background:#171d1e; }
          .row.disabled { opacity:.52; }
          .row-title { font-weight:700; font-size:14px; }
          .row-message { margin-top:4px; color:var(--muted); font-size:12px; white-space:pre-wrap; overflow-wrap:anywhere; }
          .row-meta { margin-top:9px; display:flex; flex-wrap:wrap; gap:6px; }
          .row-actions { display:flex; gap:6px; align-items:flex-start; }
          .empty { padding:60px 20px; text-align:center; color:var(--muted); border:1px dashed var(--line); border-radius:7px; }
          @media (max-width:900px) { .workspace { grid-template-columns:1fr; } .form-panel { position:static; } }
          @media (max-width:560px) { main { width:min(100% - 24px,1400px); } header { align-items:flex-start; flex-direction:column; } .grid { grid-template-columns:1fr; } .row { grid-template-columns:1fr; } }
        </style>`}
      </head>
      <body>
        <main>
          <header>
            <div>
              <div class="eyebrow">Central communications</div>
              <h1>Notice control room</h1>
              <p>Publish plain-text notices to every deployment or one installation.</p>
            </div>
            <a class="back" href="/internal">← Telemetry dashboard</a>
          </header>

          <div class="workspace">
            <section class="panel form-panel">
              <h2 id="form-heading">Compose notice</h2>
              <div class="error" id="error"></div>
              <form id="notice-form">
                <input type="hidden" id="notice-id" />
                <label>Template
                  <select id="template">
                    <option value="">Blank notice</option>
                    <option value="attribution">Attribution notice</option>
                    <option value="unauthorized">Unauthorized deployment</option>
                    <option value="breaking">Breaking update</option>
                  </select>
                </label>
                <label>Target
                  <select id="deployment-id">
                    <option value="">All deployments</option>
                    {deployments.map((deployment) => (
                      <option value={deployment.deployment_id}>
                        {deployment.deployment_id.substring(0, 12)} · {deployment.version || "unknown"} · {deployment.access_url || "no URL"}
                      </option>
                    ))}
                  </select>
                </label>
                <div class="grid">
                  <label>Audience
                    <select id="audience"><option value="public">Public</option><option value="admin">Admin</option></select>
                  </label>
                  <label>Severity
                    <select id="severity"><option value="info">Info</option><option value="warning">Warning</option><option value="critical">Critical</option></select>
                  </label>
                </div>
                <label>Category
                  <select id="category"><option value="announcement">Announcement</option><option value="compliance">Compliance</option><option value="release">Release</option><option value="maintenance">Maintenance</option></select>
                </label>
                <label>Title <span class="mono">(120)</span><input id="title" maxlength={120} required /></label>
                <label>Message <span class="mono">(2000)</span><textarea id="message" maxlength={2000} required></textarea></label>
                <div class="grid">
                  <label>Action label <span class="mono">(40)</span><input id="action-label" maxlength={40} /></label>
                  <label>Action URL <input id="action-url" maxlength={500} type="url" /></label>
                </div>
                <div class="hint">Allowed: chronicleclassic.com, github.com/Emyrk/chronicle, or discord.gg. Label and URL must be set together.</div>
                <div class="grid">
                  <label>Starts at<input id="starts-at" type="datetime-local" /></label>
                  <label>Expires at<input id="expires-at" type="datetime-local" /></label>
                </div>
                <label class="switch"><input id="enabled" type="checkbox" checked /> Enabled</label>
                <div class="actions"><button class="primary" type="submit" id="save">Publish notice</button><button type="button" id="reset">Clear</button></div>
              </form>

              <div class="preview">
                <h2>Live preview</h2>
                <div class="notice-card" id="preview-card" data-severity="info">
                  <div class="notice-meta"><span class="tag" id="preview-audience">public</span><span class="tag" id="preview-category">announcement</span><span class="tag" id="preview-severity">info</span></div>
                  <div class="notice-title" id="preview-title">Notice title</div>
                  <div class="notice-message" id="preview-message">Your message will appear here.</div>
                  <span class="notice-action" id="preview-action" hidden></span>
                </div>
              </div>
            </section>

            <section class="panel list-panel">
              <div class="list-head"><h2 style="margin:0">Published notices</h2><span class="count" id="count">loading</span></div>
              <div id="notice-list"><div class="empty">Loading notice registry…</div></div>
            </section>
          </div>
        </main>

        {html`<script>
          (() => {
            const $ = (id) => document.getElementById(id);
            const form = $('notice-form');
            const fields = {
              id: $('notice-id'), template: $('template'), deployment: $('deployment-id'),
              audience: $('audience'), severity: $('severity'), category: $('category'),
              title: $('title'), message: $('message'), actionLabel: $('action-label'),
              actionUrl: $('action-url'), startsAt: $('starts-at'), expiresAt: $('expires-at'),
              enabled: $('enabled')
            };
            let notices = [];
            const templates = {
              attribution: { audience:'public', category:'compliance', severity:'warning', title:'Chronicle attribution required', message:'This deployment must preserve Chronicle attribution and comply with the project license.', action_label:'Review Chronicle', action_url:'https://github.com/Emyrk/chronicle' },
              unauthorized: { audience:'admin', category:'compliance', severity:'critical', title:'Unauthorized Chronicle deployment', message:'This deployment is not authorized for continued operation. Contact the Chronicle maintainers to resolve access.', action_label:'Contact maintainers', action_url:'https://discord.gg/' },
              breaking: { audience:'admin', category:'release', severity:'critical', title:'Breaking update required', message:'A breaking Chronicle update is available. Review the release notes and update this deployment before the stated deadline.', action_label:'View releases', action_url:'https://github.com/Emyrk/chronicle/releases' }
            };

            function localDate(iso) {
              if (!iso) return '';
              const date = new Date(iso);
              const offset = date.getTimezoneOffset() * 60000;
              return new Date(date.getTime() - offset).toISOString().slice(0,16);
            }
            function payload() {
              return {
                deployment_id: fields.deployment.value || null,
                audience: fields.audience.value, category: fields.category.value,
                severity: fields.severity.value, title: fields.title.value,
                message: fields.message.value, action_label: fields.actionLabel.value || null,
                action_url: fields.actionUrl.value || null, enabled: fields.enabled.checked,
                starts_at: fields.startsAt.value ? new Date(fields.startsAt.value).toISOString() : null,
                expires_at: fields.expiresAt.value ? new Date(fields.expiresAt.value).toISOString() : null
              };
            }
            function showError(message) { const el=$('error'); el.textContent=message; el.style.display=message?'block':'none'; }
            function updatePreview() {
              $('preview-card').dataset.severity = fields.severity.value;
              $('preview-audience').textContent = fields.audience.value;
              $('preview-category').textContent = fields.category.value;
              $('preview-severity').textContent = fields.severity.value;
              $('preview-title').textContent = fields.title.value || 'Notice title';
              $('preview-message').textContent = fields.message.value || 'Your message will appear here.';
              $('preview-action').textContent = fields.actionLabel.value;
              $('preview-action').hidden = !fields.actionLabel.value;
            }
            function resetForm() {
              form.reset(); fields.id.value=''; fields.enabled.checked=true;
              $('form-heading').textContent='Compose notice'; $('save').textContent='Publish notice';
              showError(''); updatePreview();
            }
            function editNotice(notice) {
              fields.id.value=notice.id; fields.template.value=''; fields.deployment.value=notice.deployment_id || '';
              fields.audience.value=notice.audience; fields.severity.value=notice.severity; fields.category.value=notice.category;
              fields.title.value=notice.title; fields.message.value=notice.message;
              fields.actionLabel.value=notice.action_label || ''; fields.actionUrl.value=notice.action_url || '';
              fields.startsAt.value=localDate(notice.starts_at); fields.expiresAt.value=localDate(notice.expires_at);
              fields.enabled.checked=notice.enabled===1; $('form-heading').textContent='Edit notice #'+notice.id;
              $('save').textContent='Save changes'; updatePreview(); window.scrollTo({top:0,behavior:'smooth'});
            }
            function render() {
              const list=$('notice-list'); list.textContent=''; $('count').textContent=notices.length+' total';
              if (!notices.length) { const empty=document.createElement('div'); empty.className='empty'; empty.textContent='No notices published yet.'; list.appendChild(empty); return; }
              notices.forEach((notice) => {
                const row=document.createElement('div'); row.className='row'+(notice.enabled===1?'':' disabled');
                const body=document.createElement('div');
                const title=document.createElement('div'); title.className='row-title'; title.textContent=notice.title; body.appendChild(title);
                const message=document.createElement('div'); message.className='row-message'; message.textContent=notice.message; body.appendChild(message);
                const meta=document.createElement('div'); meta.className='row-meta';
                [notice.deployment_id ? notice.deployment_id.slice(0,12) : 'all deployments', notice.audience, notice.category, notice.severity, notice.enabled===1?'enabled':'disabled'].forEach((text)=>{ const tag=document.createElement('span'); tag.className='tag'; tag.textContent=text; meta.appendChild(tag); });
                body.appendChild(meta); row.appendChild(body);
                const actions=document.createElement('div'); actions.className='row-actions';
                const edit=document.createElement('button'); edit.textContent='Edit'; edit.addEventListener('click',()=>editNotice(notice)); actions.appendChild(edit);
                const toggle=document.createElement('button'); toggle.textContent=notice.enabled===1?'Disable':'Enable'; toggle.addEventListener('click',()=>saveNotice(notice.id,{...notice,enabled:notice.enabled!==1}).catch((error)=>showError(error.message))); actions.appendChild(toggle);
                const remove=document.createElement('button'); remove.className='danger'; remove.textContent='Delete'; remove.addEventListener('click',()=>deleteNotice(notice)); actions.appendChild(remove);
                row.appendChild(actions); list.appendChild(row);
              });
            }
            async function load() {
              const response=await fetch('/internal/api/v1/notices'); const data=await response.json();
              if (!response.ok) throw new Error(data.error || 'Failed to load notices'); notices=data.notices; render();
            }
            async function saveNotice(id, body) {
              showError('');
              const response=await fetch('/internal/api/v1/notices'+(id?'/'+id:''), { method:id?'PUT':'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
              const data=await response.json(); if (!response.ok) throw new Error(data.error || 'Failed to save notice'); await load(); return data.notice;
            }
            async function deleteNotice(notice) {
              if (!confirm('Delete “'+notice.title+'”?')) return;
              try { const response=await fetch('/internal/api/v1/notices/'+notice.id,{method:'DELETE'}); const data=await response.json(); if(!response.ok) throw new Error(data.error||'Delete failed'); if(fields.id.value==notice.id) resetForm(); await load(); } catch(error) { showError(error.message); }
            }
            fields.template.addEventListener('change',()=>{ const template=templates[fields.template.value]; if(!template)return; fields.audience.value=template.audience; fields.category.value=template.category; fields.severity.value=template.severity; fields.title.value=template.title; fields.message.value=template.message; fields.actionLabel.value=template.action_label; fields.actionUrl.value=template.action_url; updatePreview(); });
            Object.values(fields).forEach((field)=>field.addEventListener('input',updatePreview));
            $('reset').addEventListener('click',resetForm);
            form.addEventListener('submit',async(event)=>{ event.preventDefault(); try { await saveNotice(fields.id.value,payload()); resetForm(); } catch(error) { showError(error.message); } });
            load().catch((error)=>showError(error.message)); updatePreview();
          })();
        </script>`}
      </body>
    </html>
  );
});

export default noticesDashboard;
