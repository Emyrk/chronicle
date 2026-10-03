package riverqueue

import (
	"bytes"
	_ "embed"
	"net/http"
	"strconv"
	"strings"
)

const riverLogLinksScriptPath = "/river/chronicle-log-links.js"

//go:embed riverui_log_links.js
var riverLogLinksScript []byte

func withLogLinks(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == riverLogLinksScriptPath {
			w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
			w.Header().Set("Content-Length", strconv.Itoa(len(riverLogLinksScript)))
			if r.Method != http.MethodHead {
				_, _ = w.Write(riverLogLinksScript)
			}
			return
		}

		if !strings.Contains(r.Header.Get("Accept"), "text/html") {
			next.ServeHTTP(w, r)
			return
		}

		response := newBufferedResponseWriter()
		next.ServeHTTP(response, r)
		if !response.wroteHeader {
			response.WriteHeader(http.StatusOK)
		}

		body := response.body.Bytes()
		if response.statusCode >= http.StatusOK && response.statusCode < http.StatusMultipleChoices && strings.Contains(response.header.Get("Content-Type"), "text/html") {
			body = bytes.Replace(body, []byte("</head>"), []byte(`<script src="`+riverLogLinksScriptPath+`"></script></head>`), 1)
		}

		copyHeader(w.Header(), response.header)
		w.Header().Set("Content-Length", strconv.Itoa(len(body)))
		w.WriteHeader(response.statusCode)
		if r.Method != http.MethodHead {
			_, _ = w.Write(body)
		}
	})
}

type bufferedResponseWriter struct {
	header      http.Header
	body        bytes.Buffer
	statusCode  int
	wroteHeader bool
}

func newBufferedResponseWriter() *bufferedResponseWriter {
	return &bufferedResponseWriter{header: make(http.Header)}
}

func (w *bufferedResponseWriter) Header() http.Header {
	return w.header
}

func (w *bufferedResponseWriter) WriteHeader(statusCode int) {
	if w.wroteHeader {
		return
	}
	w.statusCode = statusCode
	w.wroteHeader = true
}

func (w *bufferedResponseWriter) Write(contents []byte) (int, error) {
	if !w.wroteHeader {
		w.WriteHeader(http.StatusOK)
	}
	return w.body.Write(contents)
}

func copyHeader(destination, source http.Header) {
	for key := range destination {
		destination.Del(key)
	}
	for key, values := range source {
		for _, value := range values {
			destination.Add(key, value)
		}
	}
}
