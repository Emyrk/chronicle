package serviceapi

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"sync"
)

const startupPage = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="5">
  <title>Chronicle is starting</title>
  <style>
    :root { color-scheme: dark; font-family: system-ui, sans-serif; }
    body { display: grid; min-height: 100vh; margin: 0; place-items: center; background: #09090b; color: #fafafa; }
    main { max-width: 32rem; padding: 2rem; text-align: center; }
    h1 { margin-bottom: 0.75rem; font-size: clamp(1.75rem, 5vw, 2.5rem); }
    p { margin: 0; color: #a1a1aa; line-height: 1.6; }
  </style>
</head>
<body>
  <main>
    <h1>Please wait</h1>
    <p>Chronicle is updating its database and will be available shortly.</p>
  </main>
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
