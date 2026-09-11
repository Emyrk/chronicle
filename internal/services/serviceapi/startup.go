package serviceapi

import (
	"context"
	_ "embed"
	"io"
	"log/slog"
	"net/http"
	"sync"
)

const (
	startupPagePreviewPath = "/example-not-ready"
	startupLogoPath        = startupPagePreviewPath + "/logo.png"
)

//go:embed startup-logo.png
var startupLogo []byte

const startupPage = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Chronicle is getting ready</title>
  <style>
    :root { color-scheme: dark; font-family: Georgia, "Times New Roman", serif; }
    * { box-sizing: border-box; }
    body {
      display: grid;
      min-height: 100vh;
      margin: 0;
      place-items: center;
      overflow: hidden;
      background: #0c0b09;
      color: #f4ead4;
    }
    body::before {
      position: fixed;
      inset: 0;
      background: radial-gradient(circle at 50% 40%, #332718 0, #16120d 36%, #0c0b09 72%);
      content: "";
    }
    main { position: relative; width: min(34rem, calc(100% - 3rem)); text-align: center; }
    .logo {
      display: block;
      width: 5.5rem;
      height: 5.5rem;
      margin: 0 auto 1.75rem;
      object-fit: contain;
      filter: drop-shadow(0 0 1.25rem #b9853040);
      animation: breathe 2.4s ease-in-out infinite;
    }
    h1 { margin: 0 0 0.75rem; font-size: clamp(2rem, 7vw, 3.25rem); font-weight: 400; letter-spacing: -0.04em; }
    .message { margin: 0; color: #b7a98e; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 0.85rem; line-height: 1.7; }
    .retry { display: flex; align-items: center; justify-content: center; gap: 0.65rem; margin-top: 2rem; color: #796e5b; font: 0.72rem ui-monospace, SFMono-Regular, Consolas, monospace; letter-spacing: 0.08em; text-transform: uppercase; }
    .timer { min-width: 2ch; color: #d8ad64; font-variant-numeric: tabular-nums; }
    .track { width: 5rem; height: 1px; overflow: hidden; background: #3f372b; }
    .track::after { display: block; width: 100%; height: 100%; background: #c8974e; content: ""; transform-origin: left; }
    .track.running::after { animation: drain 5s linear forwards; }
    @keyframes breathe { 50% { filter: drop-shadow(0 0 1.75rem #b9853066); transform: scale(1.04); } }
    @keyframes drain { to { transform: scaleX(0); } }
    @media (prefers-reduced-motion: reduce) { .logo, .track::after { animation: none; } }
  </style>
</head>
<body>
  <main>
    <img class="logo" src="/example-not-ready/logo.png" alt="Chronicle">
    <h1>Consulting the archives...</h1>
    <p class="message">The scribes are shuffling a few things into place.</p>
    <div class="retry" aria-live="polite">
      <span>Trying again in</span>
      <span class="timer" id="countdown">5</span>
      <span>seconds</span>
      <span class="track running" aria-hidden="true"></span>
    </div>
  </main>
  <script>
    (() => {
      const retrySeconds = 5;
      const countdown = document.getElementById("countdown");
      const track = document.querySelector(".track");
      const preview = window.location.pathname === "/example-not-ready";
      let remaining = retrySeconds;
      let checking = false;

      const restartCountdown = () => {
        remaining = retrySeconds;
        countdown.textContent = String(remaining);
        track.classList.remove("running");
        void track.offsetWidth;
        track.classList.add("running");
      };

      window.setInterval(async () => {
        remaining -= 1;
        countdown.textContent = String(Math.max(remaining, 0));
        if (remaining > 0 || checking) return;

        checking = true;
        try {
          const response = await window.fetch("/api/v1/healthz", { cache: "no-store" });
          if (response.ok && !preview) {
            window.location.reload();
            return;
          }
        } catch (_) {
          // The server may briefly be unavailable while it changes over.
        }
        restartCountdown();
        checking = false;
      }, 1000);
    })();
  </script>
</body>
</html>
`

type switchableHandler struct {
	mu      sync.RWMutex
	handler http.Handler
}

func newSwitchableHandler(handler http.Handler) *switchableHandler {
	return &switchableHandler{handler: handler}
}

func (h *switchableHandler) Set(handler http.Handler) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.handler = handler
}

func (h *switchableHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path == startupLogoPath {
		startupLogoHandler().ServeHTTP(w, r)
		return
	}
	if r.URL.Path == startupPagePreviewPath {
		startupPageHandler().ServeHTTP(w, r)
		return
	}

	h.mu.RLock()
	handler := h.handler
	h.mu.RUnlock()
	handler.ServeHTTP(w, r)
}

func startupLogoHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Cache-Control", "public, max-age=86400")
		w.Header().Set("Content-Type", "image/png")
		_, _ = w.Write(startupLogo)
	})
}

func startupPageHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Retry-After", "5")
		w.WriteHeader(http.StatusServiceUnavailable)
		_, _ = io.WriteString(w, startupPage)
	})
}

// StartStartupServer binds the public HTTP address before the remaining
// services start, so requests receive a useful response while migrations run.
func (s *Service) StartStartupServer(ctx context.Context, logger *slog.Logger) error {
	if s.serverLn != nil {
		return nil
	}

	serverLn, err := ProvisionListener(logger, s.httpAddress)
	if err != nil {
		return err
	}

	s.serverLn = serverLn
	s.httpHandler = newSwitchableHandler(startupPageHandler())
	s.closeListener = ServeHandler(ctx, logger, s.httpHandler, serverLn, "api")
	return nil
}

// CloseHTTPServer stops the listener even when startup fails before the API
// service joins the normal service shutdown sequence.
func (s *Service) CloseHTTPServer() {
	if s.closeListener != nil {
		s.closeListener()
	}
}
