import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./types";
import { LOGO_SVG_BASE64 } from "./logo";
import ingest from "./routes/ingest";
import api from "./routes/api";
import dashboard from "./dashboard/index";
import noticesDashboard from "./dashboard/notices";

const app = new Hono<{ Bindings: Env }>();

// Allow Chronicle instances to POST from any origin.
app.use("/api/*", cors());

// Serve the logo from the Worker itself (avoids cross-origin ORB blocking).
app.get("/logo.svg", async (c) => {
  const bytes = Uint8Array.from(atob(LOGO_SVG_BASE64), (ch) => ch.charCodeAt(0));
  return c.body(bytes, 200, {
    "Content-Type": "image/svg+xml",
    "Cache-Control": "public, max-age=31536000, immutable",
  });
});

// Public: ingest endpoint.
app.route("/", ingest);

// Protected: dashboard + read API (behind Cloudflare Access on /internal/*).
app.route("/", api);
app.route("/", dashboard);
app.route("/", noticesDashboard);

// Public root — friendly landing page matching Chronicle's brand.
app.get("/", (c) => {
  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Chronicle Telemetry</title>
  <link rel="icon" href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAQlBMVEUrKytVTT1rXkdkWUQdHyQ1Mi9wY0knKCkjJCcuLSxGQTdcUkE9OTNNRjp3aE3GqHCAb1CpkGO6nmqKd1WUgFrYt3iDjUckAAAACXBIWXMAAA7EAAAOxAGVKw4bAAABgklEQVR42pVT23LdMAiUAHHRXbbP//9qcDudyidNM+FJI1bLsogQfhqi/09LziZfpi0kxtKr2H1+C3VuIchEicUR+s5ToEjqnWomnEnDWXQnESwhXmtNaoX4dfTygh0giSnrbIQtx9r7GMd4MhhrY5RgOCf0EI8x4g4wLWc7p1tAEal2wjHyrtLovFpqLEFyFHXQGlV29+KoFDSyaPPawoIj/QVIZQDOYo6gHMkLNiu7gl5V022gRuBZRSrqNhKN/sg0o9/pzJWTJNisdsJbsCTv0jNEmNVg98B1OQM19MZ1YmR/BM9ZcVOtPbmGUrD7hZd4fIIEs8OtsYB34W26yOe8aV2kdw/6y4dbdlmbEaZ41CqR/Uv8NqrStTvlkHWWs/uw1I3ShpTH8QSw1QliPvdZUze5ngCpQDGgSWYEPFO4xhuDcKZ2JWXzEtDXa603QAIA/3L9HlZ8HdP4KdIXwlRzP0UCASdvd9rnrRBqXFNBkq82zFUCxD/4f4bqN8v58/gAYXERW1mDvqEAAAAASUVORK5CYII=" type="image/png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Roboto+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{
      min-height:100vh;display:flex;align-items:center;justify-content:center;
      font-family:'Inter',system-ui,sans-serif;
      background:#1a1a1a;color:#e8e8e8;
      overflow:hidden;
    }

    .container{position:relative;z-index:1;text-align:center;max-width:520px;padding:48px 32px;margin-top:-80px}

    /* Logo wrapper with particle + glow effects */
    .logo-wrap{
      position:relative;display:inline-block;overflow:visible;
      margin:0 auto -20px;
    }
    .logo{
      position:relative;z-index:10;
      width:240px;height:240px;
    }

    /* Pulsing blue glow blobs behind the logo */
    .glow{position:absolute;pointer-events:none;border-radius:50%;filter:blur(40px)}
    .glow-1{left:50%;top:50%;width:200px;height:100px;background:rgba(147,197,253,0.10);transform:translate(-70%,-80%) rotate(-15deg);animation:glow-pulse 4.5s ease-in-out infinite 3s}
    .glow-2{left:50%;top:50%;width:360px;height:180px;background:rgba(96,165,250,0.15);filter:blur(32px);transform:translate(-50%,-50%);animation:glow-pulse 4.5s ease-in-out infinite 0s}
    .glow-3{left:50%;top:50%;width:200px;height:100px;background:rgba(147,197,253,0.10);transform:translate(-20%,20%) rotate(-15deg);animation:glow-pulse 4.5s ease-in-out infinite 1.5s}
    @keyframes glow-pulse{0%,100%{opacity:1}50%{opacity:.4}}

    /* Floating particles */
    .particles{position:absolute;inset:-32px;pointer-events:none;overflow:visible;z-index:10}
    .particle{
      position:absolute;border-radius:50%;
      width:var(--size,3px);height:var(--size,3px);
      background:radial-gradient(circle,rgba(147,197,253,0.8) 0%,rgba(96,165,250,0.5) 50%,transparent 100%);
      box-shadow:0 0 4px 1px rgba(96,165,250,0.3);
      left:var(--x);top:var(--y);
      animation:float-up var(--dur) ease-out infinite, sparkle 3s ease-in-out infinite;
      animation-delay:var(--del);
    }
    @keyframes float-up{
      0%{opacity:0;transform:translateY(0) scale(0)}
      15%{opacity:1;transform:translateY(-20px) scale(1)}
      85%{opacity:0.8;transform:translateY(-120px) scale(0.8)}
      100%{opacity:0;transform:translateY(-150px) scale(0.3)}
    }
    @keyframes sparkle{0%,100%{opacity:.2}50%{opacity:.6}}

    h1{
      font-size:28px;font-weight:600;color:#f0f0f0;
      letter-spacing:-0.3px;margin-bottom:6px;
    }
    h1 span{color:#5F8FA6}

    .subtitle{
      font-size:14px;font-weight:400;color:#888;
      line-height:1.7;margin-bottom:24px;
    }

    .status{
      display:inline-flex;align-items:center;gap:8px;
      padding:7px 18px;border-radius:6px;
      background:rgba(95,143,166,0.06);
      border:1px solid rgba(95,143,166,0.12);
      font-family:'Roboto Mono',monospace;font-size:11px;font-weight:500;
      color:#5F8FA6;letter-spacing:0.5px;text-transform:uppercase;
    }
    .status::before{
      content:'';width:5px;height:5px;border-radius:50%;
      background:#5F8FA6;
      animation:pulse 2.5s ease-in-out infinite;
    }
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}

    .links{
      margin-top:28px;display:flex;justify-content:center;gap:24px;
      font-size:12px;color:#555;
    }
    .links a{
      color:#5F8FA6;text-decoration:none;
      transition:color .15s ease;
    }
    .links a:hover{color:#7fb3cc}
    .links .sep{color:#333}

    .note{
      margin-top:20px;
      font-size:11px;color:#444;font-style:italic;
      line-height:1.5;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo-wrap">
      <div class="glow glow-1"></div>
      <div class="glow glow-2"></div>
      <div class="glow glow-3"></div>
      <div class="particles" id="particles"></div>
      <img class="logo" src="/logo.svg" alt="Chronicle">
    </div>
    <h1>Chronicle <span>Telemetry</span></h1>
    <p class="subtitle">
      Deployment analytics for self-hosted Chronicle instances.<br>
      Collecting heartbeats, not secrets.
    </p>
    <div class="status">Receiving</div>
    <div class="links">
      <a href="https://chronicleclassic.com">Chronicle</a>
      <span class="sep">·</span>
      <a href="https://github.com/Emyrk/chronicle">GitHub</a>
    </div>
    <p class="note">
      Chronicle reports basic deployment stats (version, user count, log count).<br>
      No personal data is collected.
    </p>
  </div>
  <script>
    // Generate 16 floating particles like Chronicle's MagicLogo
    const el = document.getElementById('particles');
    for (let i = 0; i < 16; i++) {
      const span = document.createElement('span');
      span.className = 'particle';
      span.style.setProperty('--del', '-' + (i * 0.4) + 's');
      span.style.setProperty('--x', (10 + Math.random() * 80) + '%');
      span.style.setProperty('--y', (20 + Math.random() * 41) + '%');
      span.style.setProperty('--dur', (3 + Math.random() * 9) + 's');
      span.style.setProperty('--size', (2 + Math.random() * 2) + 'px');
      el.appendChild(span);
    }
  </script>
</body>
</html>`);
});

export default app;
