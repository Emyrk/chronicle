package httpmw

import (
	"bytes"
	"compress/gzip"
	"io"
	"log/slog"
	"net/http"
)

const maxBodyCapture = 512

// statusWriter wraps http.ResponseWriter to capture the status code and
// the first maxBodyCapture bytes of the response body.
type statusWriter struct {
	http.ResponseWriter
	status int
	wrote  bool
	body   []byte
}

func (w *statusWriter) WriteHeader(code int) {
	if !w.wrote {
		w.status = code
		w.wrote = true
	}
	w.ResponseWriter.WriteHeader(code)
}

func (w *statusWriter) Write(b []byte) (int, error) {
	if !w.wrote {
		w.status = http.StatusOK
		w.wrote = true
	}
	if remaining := maxBodyCapture - len(w.body); remaining > 0 {
		capture := b
		if len(capture) > remaining {
			capture = capture[:remaining]
		}
		w.body = append(w.body, capture...)
	}
	return w.ResponseWriter.Write(b)
}

// Unwrap supports http.ResponseController and middleware that check the inner writer.
func (w *statusWriter) Unwrap() http.ResponseWriter {
	return w.ResponseWriter
}

// Log500 returns middleware that logs all responses with status code 500.
func Log500(logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
			sw := &statusWriter{ResponseWriter: rw}
			next.ServeHTTP(sw, r)
			if sw.status == http.StatusInternalServerError {
				body := sw.body
				// Decompress gzip body so error messages are readable in logs.
				if len(body) >= 2 && body[0] == 0x1f && body[1] == 0x8b {
					if gr, err := gzip.NewReader(bytes.NewReader(body)); err == nil {
						if decompressed, err := io.ReadAll(gr); err == nil {
							body = decompressed
						}
						_ = gr.Close()
					}
				}
				logger.ErrorContext(r.Context(), "returned 500",
					slog.String("method", r.Method),
					slog.String("path", r.URL.Path),
					slog.String("body", string(body)),
				)
			}
		})
	}
}
