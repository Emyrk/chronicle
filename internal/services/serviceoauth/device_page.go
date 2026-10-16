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
  <link rel="icon" href="/c/chronicle/favicon.ico">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Roboto+Mono:wght@500;600&display=swap">
  <style>
    @font-face {
      font-family: "Friz Quadrata";
      src: url("/c/fonts/FrizQuadrata-Regular.woff2") format("woff2");
      font-display: swap;
    }
    /* Mirrors the frontend theme tokens in frontend/chronicle/src/index.css. */
    :root {
      --background: oklch(0.2891 0 0);
      --foreground: oklch(0.9300 0.0035 247.8602);
      --card: oklch(0.2686 0 0);
      --primary: #5F8FA6;
      --primary-darker: oklch(0.3818 0.0603 233.7748);
      --primary-foreground: oklch(0.8914 0 0);
      --secondary: oklch(0.5692 0.0609 82.3871);
      --muted-foreground: oklch(0.7593 0.0073 67.7161);
      --destructive: oklch(0.6368 0.2078 25.3313);
      --success: oklch(0.792 0.209 151.711); /* tailwind green-400 */
      --border: oklch(0.3407 0 0);
      --ring: oklch(0.5204 0.0833 232.6334);
      --radius: 0.2rem;
      --font-mono: "Roboto Mono", ui-monospace, monospace;
      --font-wow: "Friz Quadrata", ui-serif, serif;
      color-scheme: dark;
      font-family: Inter, ui-sans-serif, sans-serif, system-ui;
    }
    * { box-sizing: border-box; }
    body {
      min-height: 100svh;
      margin: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 2rem 1rem 5rem;
      overflow-x: hidden;
      color: var(--foreground);
      background: var(--background);
    }
    main { width: 100%; max-width: 28rem; animation: arrive .5s cubic-bezier(.22,1,.36,1) both; }

    /* Login page MagicLogo: pulsing blue glow and rising particles. */
    .hero { position: relative; width: 16rem; max-width: 100%; margin: 0 auto 1.25rem; }
    .hero img { position: relative; z-index: 1; display: block; width: 100%; }
    .glow { position: absolute; border-radius: 9999px; pointer-events: none; animation: pulse 4.5s cubic-bezier(.4,0,.6,1) infinite; }
    .glow.a { left: -15%; top: 5%; width: 130%; height: 90%; background: rgb(96 165 250 / .15); filter: blur(40px); }
    .glow.b { right: -20%; top: 55%; width: 60%; height: 45%; background: rgb(147 197 253 / .1); filter: blur(64px); rotate: -15deg; animation-delay: 1.5s; }
    .particles { position: absolute; inset: -2rem; z-index: 2; pointer-events: none; }
    .particles span {
      position: absolute;
      left: var(--x);
      top: var(--y);
      width: var(--size);
      height: var(--size);
      border-radius: 50%;
      background: radial-gradient(circle, rgb(147 197 253 / .8) 0%, rgb(96 165 250 / .5) 50%, transparent 100%);
      box-shadow: 0 0 4px 1px rgb(96 165 250 / .3);
      animation: float-up var(--duration) ease-out infinite, sparkle 3s ease-in-out infinite;
      animation-delay: var(--delay);
    }

    .card {
      position: relative;
      overflow: hidden;
      padding: 2rem;
      border: 1px solid var(--border);
      border-radius: calc(var(--radius) + 4px);
      background: var(--card);
      box-shadow: 0 20px 25px -5px rgb(0 0 0 / .25), 0 8px 10px -6px rgb(0 0 0 / .2);
      text-align: center;
    }
    .card::before {
      position: absolute;
      inset: 0 0 auto;
      height: 1px;
      content: "";
      background: linear-gradient(90deg, transparent, var(--secondary), transparent);
      opacity: .7;
    }
    .eyebrow {
      margin: 0 0 .5rem;
      color: var(--secondary);
      font: 600 .7rem/1 var(--font-mono);
      letter-spacing: .18em;
      text-transform: uppercase;
    }
    h1 { margin: 0 0 .6rem; font: 400 1.75rem/1.15 var(--font-wow); }
    p { margin: 0; }
    .muted { color: var(--muted-foreground); font-size: .875rem; line-height: 1.4rem; }
    .rule { display: flex; align-items: center; gap: .75rem; margin: 1.5rem 0; color: var(--secondary); font-size: .6rem; }
    .rule::before, .rule::after { flex: 1; height: 1px; content: ""; background: linear-gradient(90deg, transparent, var(--border)); }
    .rule::after { transform: scaleX(-1); }
    form { text-align: left; }
    label { display: block; margin-bottom: .4rem; font-size: .875rem; font-weight: 500; }
    input {
      width: 100%;
      padding: .75rem;
      border: 1px solid var(--border);
      border-radius: calc(var(--radius) + 2px);
      outline: none;
      color: var(--foreground);
      background: var(--background);
      box-shadow: inset 0 2px 6px rgb(0 0 0 / .25);
      font: 600 1.25rem/1.5rem var(--font-mono);
      letter-spacing: .15em;
      text-align: center;
      text-transform: uppercase;
      transition: border-color .15s, box-shadow .15s;
    }
    input:focus-visible { border-color: var(--ring); box-shadow: 0 0 0 3px color-mix(in oklch, var(--ring) 50%, transparent), inset 0 2px 6px rgb(0 0 0 / .25); }
    .scope {
      display: flex;
      gap: .75rem;
      margin: 1rem 0 1.25rem;
      padding: .75rem 1rem;
      border: 1px solid var(--border);
      border-left: 2px solid var(--primary);
      border-radius: calc(var(--radius) + 2px);
      background: color-mix(in oklch, var(--primary-darker) 18%, transparent);
      font-size: .8rem;
    }
    .scope svg { flex: none; width: 1.1rem; height: 1.1rem; margin-top: .1rem; color: var(--primary); }
    .actions { display: grid; grid-template-columns: 1fr 1.6fr; gap: .5rem; }
    button {
      height: 2.5rem;
      padding: 0 1rem;
      border: 1px solid transparent;
      border-radius: calc(var(--radius) + 2px);
      cursor: pointer;
      font: 500 .875rem/1 inherit;
      font-family: inherit;
      transition: background .15s, transform .15s;
    }
    button:hover { transform: translateY(-1px); }
    button:active { transform: none; }
    button:focus-visible { outline: none; box-shadow: 0 0 0 3px color-mix(in oklch, var(--ring) 50%, transparent); }
    .approve { color: var(--primary-foreground); background: var(--primary-darker); }
    .approve:hover { background: color-mix(in oklch, var(--primary-darker) 90%, transparent); }
    .deny { color: #fff; background: color-mix(in oklch, var(--destructive) 60%, transparent); }
    .deny:hover { background: color-mix(in oklch, var(--destructive) 54%, transparent); }
    .mark {
      display: grid;
      width: 4rem;
      height: 4rem;
      margin: 0 auto 1.25rem;
      place-items: center;
      border: 1px solid color-mix(in oklch, var(--success) 60%, transparent);
      border-radius: 50%;
      color: var(--success);
      background: color-mix(in oklch, var(--success) 10%, transparent);
      box-shadow: 0 0 2rem color-mix(in oklch, var(--success) 20%, transparent);
      animation: pop .55s cubic-bezier(.22,1,.36,1) .1s both;
    }
    .mark.denied, .mark.error {
      border-color: color-mix(in oklch, var(--destructive) 60%, transparent);
      color: var(--destructive);
      background: color-mix(in oklch, var(--destructive) 10%, transparent);
      box-shadow: 0 0 2rem color-mix(in oklch, var(--destructive) 20%, transparent);
    }
    .mark svg { width: 1.75rem; height: 1.75rem; }
    .status { margin-top: 1.25rem; color: var(--secondary); font: 600 .7rem/1.5 var(--font-mono); letter-spacing: .12em; text-transform: uppercase; }
    .footnote { margin-top: .5rem; font-size: .75rem; }

    @keyframes arrive { from { opacity: 0; transform: translateY(10px); } }
    @keyframes pop { 0% { opacity: 0; transform: scale(.6); } 60% { opacity: 1; transform: scale(1.08); } 100% { transform: none; } }
    @keyframes pulse { 50% { opacity: .5; } }
    @keyframes sparkle { 0%, 100% { opacity: .2; } 50% { opacity: .6; } }
    @keyframes float-up {
      0% { opacity: 0; transform: translateY(0) scale(0); }
      15% { opacity: 1; transform: translateY(-20px) scale(1); }
      85% { opacity: .8; transform: translateY(calc(var(--travel) * .8)) scale(.8); }
      100% { opacity: 0; transform: translateY(var(--travel)) scale(.3); }
    }
    @media (max-width: 26rem) { .actions { grid-template-columns: 1fr; } .approve { grid-row: 1; } }
    @media (prefers-reduced-motion: reduce) {
      main, .mark, .glow, button { animation: none; transition: none; }
      .particles { display: none; }
    }
  </style>
</head>
<body>
  <main>
    <div class="hero">
      <div class="glow a" aria-hidden="true"></div>
      <div class="glow b" aria-hidden="true"></div>
      <div class="particles" aria-hidden="true">
        <span style="--x:14%;--y:30%;--duration:5s;--delay:-0.0s;--size:2.5px;--travel:-140px"></span>
        <span style="--x:22%;--y:52%;--duration:9s;--delay:-0.4s;--size:3.5px;--travel:-180px"></span>
        <span style="--x:31%;--y:38%;--duration:4s;--delay:-0.8s;--size:2px;--travel:-120px"></span>
        <span style="--x:40%;--y:58%;--duration:7s;--delay:-1.2s;--size:3px;--travel:-200px"></span>
        <span style="--x:48%;--y:26%;--duration:11s;--delay:-1.6s;--size:2.5px;--travel:-160px"></span>
        <span style="--x:57%;--y:44%;--duration:6s;--delay:-2.0s;--size:3.5px;--travel:-110px"></span>
        <span style="--x:66%;--y:34%;--duration:8s;--delay:-2.4s;--size:2px;--travel:-190px"></span>
        <span style="--x:74%;--y:56%;--duration:5s;--delay:-2.8s;--size:3px;--travel:-150px"></span>
        <span style="--x:82%;--y:40%;--duration:10s;--delay:-3.2s;--size:2.5px;--travel:-130px"></span>
        <span style="--x:88%;--y:28%;--duration:7s;--delay:-3.6s;--size:3.5px;--travel:-170px"></span>
        <span style="--x:35%;--y:22%;--duration:12s;--delay:-4.0s;--size:2px;--travel:-100px"></span>
        <span style="--x:62%;--y:60%;--duration:4s;--delay:-4.4s;--size:3px;--travel:-185px"></span>
      </div>
      <img src="/c/chronicle/ChronicleLogoCenter.svg" alt="Chronicle">
    </div>
    <section class="card">
      {{if eq .State "authorize"}}
        <p class="eyebrow">Chronicle Sidekick</p>
        <h1>{{.Title}}</h1>
        <p class="muted">{{.Message}}</p>
        <div class="rule" aria-hidden="true">◆</div>
        <form method="post" action="/oauth/device">
          <label for="user-code">Device code</label>
          <input id="user-code" name="user_code" value="{{.UserCode}}" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false" required autofocus>
          <div class="scope muted">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 3 4.5 6v5.4c0 4.8 3.2 8 7.5 9.6 4.3-1.6 7.5-4.8 7.5-9.6V6L12 3Z"/><path d="m9 12 2 2 4-4"/></svg>
            <span>Sidekick will act with your existing Chronicle permissions. Only approve a code shown by Sidekick on a device you recognize.</span>
          </div>
          <div class="actions">
            <button class="deny" name="decision" value="deny" type="submit">Deny</button>
            <button class="approve" name="decision" value="approve" type="submit">Authorize device</button>
          </div>
        </form>
      {{else}}
        <div class="mark {{.State}}" aria-hidden="true">
          {{if eq .State "approved"}}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m5 12 4 4L19 6"/></svg>
          {{else}}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6 6 18"/></svg>
          {{end}}
        </div>
        <h1>{{.Title}}</h1>
        <p class="muted">{{.Message}}</p>
        {{if eq .State "approved"}}
          <p class="status">Authorization complete</p>
          <p class="muted footnote">You can close this window and return to Chronicle Sidekick.</p>
        {{else if eq .State "denied"}}
          <p class="status">No access was granted</p>
          <p class="muted footnote">You can safely close this window.</p>
        {{else}}
          <p class="muted footnote">Return to Chronicle Sidekick and start the connection process again.</p>
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
