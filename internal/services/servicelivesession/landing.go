package servicelivesession

import (
	"html/template"
	"net/http"
)

var landingPageTemplate = template.Must(template.New("live-signaling-landing").Parse(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark">
  <title>Chronicle Live Relay</title>
  <style>
    :root {
      color-scheme: dark;
      --ink: #071018;
      --line: rgba(149, 190, 211, 0.18);
      --mist: #a8bdc8;
      --paper: #edf5f7;
      --blue: #6bb5d6;
      --gold: #d8b76a;
    }

    * { box-sizing: border-box; }

    html, body { min-height: 100%; }

    body {
      margin: 0;
      display: grid;
      place-items: center;
      overflow-x: hidden;
      color: var(--paper);
      font-family: "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif;
      background:
        radial-gradient(circle at 78% 18%, rgba(54, 129, 161, 0.18), transparent 32rem),
        radial-gradient(circle at 8% 85%, rgba(170, 126, 51, 0.12), transparent 28rem),
        linear-gradient(145deg, #050b11 0%, var(--ink) 46%, #08141c 100%);
    }

    body::before {
      content: "";
      position: fixed;
      inset: 0;
      pointer-events: none;
      opacity: 0.23;
      background-image:
        linear-gradient(rgba(132, 181, 204, 0.08) 1px, transparent 1px),
        linear-gradient(90deg, rgba(132, 181, 204, 0.08) 1px, transparent 1px);
      background-size: 64px 64px;
      mask-image: linear-gradient(to bottom, black, transparent 82%);
    }

    main {
      position: relative;
      width: min(920px, calc(100% - 2rem));
      margin: 4rem auto;
      padding: clamp(2rem, 6vw, 5.5rem);
      border: 1px solid var(--line);
      background: linear-gradient(140deg, rgba(12, 31, 44, 0.9), rgba(5, 15, 23, 0.76));
      box-shadow: 0 40px 100px rgba(0, 0, 0, 0.48), inset 0 1px rgba(255, 255, 255, 0.035);
      backdrop-filter: blur(18px);
    }

    main::before,
    main::after {
      content: "";
      position: absolute;
      width: 84px;
      height: 84px;
      pointer-events: none;
    }

    main::before {
      top: -1px;
      left: -1px;
      border-top: 2px solid var(--gold);
      border-left: 2px solid var(--gold);
    }

    main::after {
      right: -1px;
      bottom: -1px;
      border-right: 2px solid var(--blue);
      border-bottom: 2px solid var(--blue);
    }

    header {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: clamp(3rem, 7vw, 5.5rem);
    }

    .mark {
      position: relative;
      display: grid;
      width: 48px;
      height: 48px;
      place-items: center;
      border: 1px solid rgba(216, 183, 106, 0.6);
      border-radius: 50%;
      color: var(--gold);
      font-size: 1.35rem;
      font-weight: 700;
      box-shadow: 0 0 36px rgba(107, 181, 214, 0.12);
    }

    .mark::after {
      content: "";
      position: absolute;
      inset: 5px;
      border: 1px solid rgba(107, 181, 214, 0.42);
      border-radius: 50%;
      border-left-color: transparent;
      transform: rotate(-24deg);
    }

    .eyebrow,
    .status,
    footer {
      font-family: ui-monospace, "Cascadia Mono", "Roboto Mono", monospace;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }

    .eyebrow {
      margin: 0;
      color: var(--mist);
      font-size: 0.7rem;
    }

    .brand {
      margin: 0.22rem 0 0;
      font-size: 1rem;
      letter-spacing: 0.06em;
    }

    h1 {
      max-width: 700px;
      margin: 0;
      font-size: clamp(3rem, 8vw, 6.7rem);
      font-weight: 400;
      line-height: 0.9;
      letter-spacing: -0.055em;
    }

    h1 em {
      color: var(--blue);
      font-weight: 400;
      font-style: italic;
    }

    .lede {
      max-width: 620px;
      margin: 2.2rem 0 0;
      color: var(--mist);
      font-size: clamp(1.05rem, 2.3vw, 1.28rem);
      line-height: 1.75;
    }

    .lede strong {
      color: var(--paper);
      font-weight: 400;
    }

    .status {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      margin: clamp(3rem, 7vw, 5rem) 0 0;
      border-top: 1px solid var(--line);
      border-bottom: 1px solid var(--line);
    }

    .status div {
      padding: 1.1rem 0.9rem;
      border-right: 1px solid var(--line);
    }

    .status div:first-child { padding-left: 0; }
    .status div:last-child { border-right: 0; }

    .status span {
      display: block;
      color: #6f8b99;
      font-size: 0.6rem;
    }

    .status b {
      display: block;
      margin-top: 0.45rem;
      color: var(--paper);
      font-size: 0.72rem;
      font-weight: 500;
    }

    .status b.live { color: #91d0aa; }

    .status b.live::before {
      content: "";
      display: inline-block;
      width: 0.44rem;
      height: 0.44rem;
      margin-right: 0.55rem;
      border-radius: 50%;
      background: currentColor;
      box-shadow: 0 0 14px currentColor;
    }

    footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1.5rem;
      margin-top: 2rem;
      color: #6f8b99;
      font-size: 0.62rem;
      line-height: 1.6;
    }

    a {
      color: var(--gold);
      text-decoration: none;
      border-bottom: 1px solid rgba(216, 183, 106, 0.38);
      transition: color 160ms ease, border-color 160ms ease;
    }

    a:hover,
    a:focus-visible {
      color: #f3d990;
      border-color: currentColor;
    }

    @media (max-width: 620px) {
      main { margin: 1rem auto; padding: 2rem 1.35rem; }
      header { margin-bottom: 3.5rem; }
      .status { grid-template-columns: 1fr; }
      .status div,
      .status div:first-child {
        padding: 1rem 0;
        border-right: 0;
        border-bottom: 1px solid var(--line);
      }
      .status div:last-child { border-bottom: 0; }
      footer { align-items: flex-start; flex-direction: column; }
    }

    @media (prefers-reduced-motion: no-preference) {
      main { animation: arrive 650ms cubic-bezier(.2,.8,.2,1) both; }
      .mark::after { animation: orbit 12s linear infinite; }
      @keyframes arrive {
        from { opacity: 0; transform: translateY(18px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes orbit { to { transform: rotate(336deg); } }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div class="mark" aria-hidden="true">C</div>
      <div>
        <p class="eyebrow">Chronicle infrastructure</p>
        <p class="brand">Live session relay</p>
      </div>
    </header>

    <h1>Nothing to click <em>here.</em></h1>
    <p class="lede">
      This address runs Chronicle's live-session signaling relay. It briefly
      introduces browsers to one another so raid reviews can stay synchronized
      in real time. <strong>No combat logs or account data are persisted here.</strong>
    </p>

    <section class="status" aria-label="Service details">
      <div><span>Service</span><b class="live">Operational</b></div>
      <div><span>Purpose</span><b>WebRTC signaling</b></div>
      <div><span>State</span><b>Ephemeral</b></div>
    </section>

    <footer>
      <span>If you arrived here by hand, you can safely head back.</span>
      <a href="{{.ChronicleURL}}">Open Chronicle &rarr;</a>
    </footer>
  </main>
</body>
</html>`))

type landingPageData struct {
	ChronicleURL string
}

func (s *Service) LandingPage(w http.ResponseWriter, _ *http.Request) {
	chronicleURL := "https://chronicleclassic.com"
	if s.accessURL != nil && s.accessURL.IsAbs() {
		chronicleURL = s.accessURL.String()
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
	w.Header().Set("Referrer-Policy", "no-referrer")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	if err := landingPageTemplate.Execute(w, landingPageData{ChronicleURL: chronicleURL}); err != nil {
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
	}
}
