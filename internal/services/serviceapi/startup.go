package serviceapi

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"sync"
)

const startupPagePreviewPath = "/example-not-ready"

const startupPage = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="6">
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
    .rune {
      display: grid;
      width: 4.5rem;
      height: 4.5rem;
      margin: 0 auto 1.75rem;
      place-items: center;
      border: 1px solid #8f6f3b;
      border-radius: 50%;
      box-shadow: 0 0 2rem #b9853026, inset 0 0 1.25rem #b9853014;
      color: #d8ad64;
      font-size: 2rem;
      animation: breathe 2.4s ease-in-out infinite;
    }
    h1 { margin: 0 0 0.75rem; font-size: clamp(2rem, 7vw, 3.25rem); font-weight: 400; letter-spacing: -0.04em; }
    .message { margin: 0; color: #b7a98e; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 0.85rem; line-height: 1.7; }
    .retry { display: flex; align-items: center; justify-content: center; gap: 0.65rem; margin-top: 2rem; color: #796e5b; font: 0.72rem ui-monospace, SFMono-Regular, Consolas, monospace; letter-spacing: 0.08em; text-transform: uppercase; }
    .timer { min-width: 2ch; color: #d8ad64; font-variant-numeric: tabular-nums; }
    .track { width: 5rem; height: 1px; overflow: hidden; background: #3f372b; }
    .track::after { display: block; width: 100%; height: 100%; background: #c8974e; content: ""; transform-origin: left; animation: drain 5s linear forwards; }
    @keyframes breathe { 50% { border-color: #d8ad64; box-shadow: 0 0 2.5rem #b9853040, inset 0 0 1.5rem #b9853020; transform: scale(1.04); } }
    @keyframes drain { to { transform: scaleX(0); } }
    @media (prefers-reduced-motion: reduce) { .rune, .track::after { animation: none; } }
  </style>
</head>
<body>
  <main>
    <div class="rune" aria-hidden="true">C</div>
    <h1>Consulting the archives...</h1>
    <p class="message">The scribes are shuffling a few things into place.</p>
    <div class="retry" aria-live="polite">
      <span>Trying again in</span>
      <span class="timer" id="countdown">5</span>
      <span>seconds</span>
      <span class="track" aria-hidden="true"></span>
    </div>
  </main>
  <script>
    (() => {
      let remaining = 5;
      const countdown = document.getElementById("countdown");
      const timer = window.setInterval(() => {
        remaining -= 1;
        countdown.textContent = String(Math.max(remaining, 0));
        if (remaining <= 0) {
          window.clearInterval(timer);
          window.location.reload();
        }
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
	if r.URL.Path == startupPagePreviewPath {
		startupPageHandler().ServeHTTP(w, r)
		return
	}

	h.mu.RLock()
	handler := h.handler
	h.mu.RUnlock()
	handler.ServeHTTP(w, r)
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
