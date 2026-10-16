package serviceoauth

import (
	"bytes"
	"html/template"
	"net/http"
)

type devicePageState string

const (
	devicePageAuthorize devicePageState = "authorize"
	devicePageApproved  devicePageState = "approved"
	devicePageDenied    devicePageState = "denied"
	devicePageError     devicePageState = "error"
)

type devicePageData struct {
	State    devicePageState
	UserCode string
	Title    string
	Message  string
}

var devicePageTemplate = template.Must(template.New("oauth-device").Parse(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark">
  <title>{{.Title}} · Chronicle</title>
  <style>
    @font-face {
      font-family: "Friz Quadrata";
      src: url("/c/fonts/FrizQuadrata-Regular.woff2") format("woff2");
      font-display: swap;
    }
    :root {
      color-scheme: dark;
      --ink: #f4ead4;
      --muted: #a89c87;
      --faint: #716957;
      --gold: #d7a955;
      --gold-bright: #f2cc7c;
      --blue: #61b9df;
      --panel: #15130f;
      --line: #3b3326;
      font-family: Georgia, "Times New Roman", serif;
    }
    * { box-sizing: border-box; }
    body {
      min-height: 100vh;
      margin: 0;
      display: grid;
      place-items: center;
      overflow-x: hidden;
      color: var(--ink);
      background:
        radial-gradient(circle at 50% 18%, #3a2c1a 0, #17130d 34%, transparent 60%),
        linear-gradient(145deg, #080909, #0d0c09 52%, #080909);
    }
    body::before {
      position: fixed;
      inset: 0;
      pointer-events: none;
      content: "";
      opacity: .34;
      background-image:
        linear-gradient(#d6b66f08 1px, transparent 1px),
        linear-gradient(90deg, #d6b66f08 1px, transparent 1px);
      background-size: 46px 46px;
      mask-image: radial-gradient(circle at center, black, transparent 76%);
    }
    .shell {
      position: relative;
      width: min(31rem, calc(100% - 2rem));
      margin: 2rem 0;
      animation: arrive .45s cubic-bezier(.2,.8,.2,1) both;
    }
    .seal {
      position: relative;
      z-index: 2;
      display: grid;
      width: 4.25rem;
      height: 4.25rem;
      margin: 0 auto -2.1rem;
      place-items: center;
      border: 1px solid #e3b85e88;
      border-radius: 50%;
      color: var(--gold-bright);
      background: radial-gradient(circle at 38% 28%, #49381f, #20190f 66%);
      box-shadow: 0 0 0 7px #0e0d0a, 0 0 2.5rem #c38a3038;
      font: 700 1.8rem/1 "Friz Quadrata", Georgia, serif;
      text-shadow: 0 2px 8px #000;
    }
    .card {
      position: relative;
      overflow: hidden;
      padding: 4.25rem clamp(1.4rem, 6vw, 2.75rem) 2.5rem;
      border: 1px solid var(--line);
      border-radius: 3px;
      background:
        linear-gradient(135deg, #ffffff05, transparent 34%),
        var(--panel);
      box-shadow: 0 1.5rem 5rem #000a, inset 0 1px #ffffff08;
      text-align: center;
    }
    .card::before, .card::after {
      position: absolute;
      width: 4rem;
      height: 4rem;
      content: "";
      border-color: #b98a4266;
    }
    .card::before { top: .75rem; left: .75rem; border-top: 1px solid; border-left: 1px solid; }
    .card::after { right: .75rem; bottom: .75rem; border-right: 1px solid; border-bottom: 1px solid; }
    .eyebrow {
      margin: 0 0 .8rem;
      color: var(--gold);
      font: 600 .68rem/1.2 ui-monospace, SFMono-Regular, Consolas, monospace;
      letter-spacing: .2em;
      text-transform: uppercase;
    }
    h1 {
      max-width: 22rem;
      margin: 0 auto .85rem;
      font: 400 clamp(2rem, 8vw, 2.75rem)/1.05 "Friz Quadrata", Georgia, serif;
      letter-spacing: -.025em;
    }
    .lede {
      max-width: 23rem;
      margin: 0 auto;
      color: var(--muted);
      font-size: .98rem;
      line-height: 1.65;
    }
    .rule {
      display: flex;
      align-items: center;
      gap: .75rem;
      margin: 1.7rem 0;
      color: #806a46;
    }
    .rule::before, .rule::after { flex: 1; height: 1px; background: linear-gradient(90deg, transparent, #6b5735); content: ""; }
    .rule::after { transform: scaleX(-1); }
    .code-label {
      display: block;
      margin-bottom: .6rem;
      color: #c8bda8;
      font: 600 .7rem/1 ui-monospace, SFMono-Regular, Consolas, monospace;
      letter-spacing: .12em;
      text-align: left;
      text-transform: uppercase;
    }
    .code-input {
      width: 100%;
      border: 1px solid #58472d;
      border-radius: 3px;
      outline: none;
      padding: .95rem 1rem;
      color: #fff5df;
      background: #090a09;
      box-shadow: inset 0 2px 9px #0009;
      font: 600 1.25rem/1 ui-monospace, SFMono-Regular, Consolas, monospace;
      letter-spacing: .11em;
      text-align: center;
      text-transform: uppercase;
      transition: border-color .16s, box-shadow .16s;
    }
    .code-input:focus { border-color: var(--gold); box-shadow: 0 0 0 3px #d7a9551f, inset 0 2px 9px #0009; }
    .scope {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: .75rem;
      margin: 1rem 0 1.45rem;
      padding: .9rem 1rem;
      border: 1px solid #272823;
      background: #0d0e0c;
      color: var(--muted);
      font-size: .8rem;
      line-height: 1.55;
      text-align: left;
    }
    .scope svg { width: 1.1rem; color: var(--blue); }
    .actions { display: grid; grid-template-columns: 1fr 1.6fr; gap: .75rem; }
    button {
      min-height: 3rem;
      border-radius: 3px;
      cursor: pointer;
      font: 600 .76rem/1 ui-monospace, SFMono-Regular, Consolas, monospace;
      letter-spacing: .08em;
      text-transform: uppercase;
      transition: transform .14s, border-color .14s, background .14s;
    }
    button:hover { transform: translateY(-1px); }
    button:active { transform: translateY(0); }
    .deny { border: 1px solid #403a30; color: #a79d8c; background: #11110f; }
    .deny:hover { border-color: #695f4e; color: #ddd2be; }
    .approve { border: 1px solid #d7a955aa; color: #211708; background: linear-gradient(#efd087, #b98536); box-shadow: 0 7px 22px #b9853625; }
    .approve:hover { background: linear-gradient(#f8dda0, #c89543); }
    .result-mark {
      display: grid;
      width: 4.25rem;
      height: 4.25rem;
      margin: 1.8rem auto 1.35rem;
      place-items: center;
      border: 1px solid #5e936d;
      border-radius: 50%;
      color: #a7d4ae;
      background: #142219;
      box-shadow: 0 0 2rem #5e936d22;
    }
    .result-mark.denied, .result-mark.error { border-color: #956251; color: #dda08a; background: #281713; box-shadow: 0 0 2rem #a85b4222; }
    .result-mark svg { width: 2rem; height: 2rem; }
    .return-note {
      margin: 1.5rem 0 0;
      color: var(--gold);
      font: 600 .72rem/1.5 ui-monospace, SFMono-Regular, Consolas, monospace;
      letter-spacing: .08em;
      text-transform: uppercase;
    }
    .footnote { margin: 1.25rem auto 0; color: var(--faint); font-size: .72rem; line-height: 1.55; }
    @keyframes arrive { from { opacity: 0; transform: translateY(10px) scale(.99); } }
    @media (max-width: 28rem) { .actions { grid-template-columns: 1fr; } .approve { grid-row: 1; } }
    @media (prefers-reduced-motion: reduce) { .shell { animation: none; } button { transition: none; } }
  </style>
</head>
<body>
  <main class="shell">
    <div class="seal" aria-hidden="true">C</div>
    <section class="card">
      <p class="eyebrow">Chronicle Sidekick</p>
      <h1>{{.Title}}</h1>
      <p class="lede">{{.Message}}</p>

      {{if eq .State "authorize"}}
        <div class="rule" aria-hidden="true">◆</div>
        <form method="post" action="/oauth/device">
          <label class="code-label" for="user-code">Device code</label>
          <input class="code-input" id="user-code" name="user_code" value="{{.UserCode}}" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false" required autofocus>
          <div class="scope">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 3 4.5 6v5.4c0 4.8 3.2 8 7.5 9.6 4.3-1.6 7.5-4.8 7.5-9.6V6L12 3Z"/><path d="m9 12 2 2 4-4"/></svg>
            <span>Sidekick will be able to act with your existing Chronicle permissions. It cannot gain access beyond your account.</span>
          </div>
          <div class="actions">
            <button class="deny" name="decision" value="deny" type="submit">Deny</button>
            <button class="approve" name="decision" value="approve" type="submit">Authorize device</button>
          </div>
        </form>
        <p class="footnote">Only approve a code shown by Chronicle Sidekick on a device you recognize.</p>
      {{else}}
        <div class="result-mark {{.State}}" aria-hidden="true">
          {{if eq .State "approved"}}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m5 12 4 4L19 6"/></svg>
          {{else}}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6 6 18"/></svg>
          {{end}}
        </div>
        {{if eq .State "approved"}}
          <p class="return-note">Authorization complete</p>
          <p class="footnote">You can close this window and return to Chronicle Sidekick.</p>
        {{else if eq .State "denied"}}
          <p class="return-note">No access was granted</p>
          <p class="footnote">You can safely close this window.</p>
        {{else}}
          <p class="footnote">Return to Chronicle Sidekick and start the connection process again.</p>
        {{end}}
      {{end}}
    </section>
  </main>
</body>
</html>`))

func renderDevicePage(w http.ResponseWriter, status int, data devicePageData) {
	var page bytes.Buffer
	if err := devicePageTemplate.Execute(&page, data); err != nil {
		http.Error(w, "Unable to render device authorization.", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("X-Frame-Options", "DENY")
	w.WriteHeader(status)
	_, _ = w.Write(page.Bytes())
}
