package api

import (
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/internal/parseradmission"
	"github.com/Emyrk/chronicle/internal/version"
	"net/http"
)

// ParserCompatibility is process identity, not the human-facing parser version.
// It deliberately requires no authentication or tenant lookup.
func ParserCompatibility(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	identity, err := version.BinaryIdentity()
	if err != nil {
		httpapi.Write(r.Context(), w, http.StatusServiceUnavailable, parseradmission.Response{})
		return
	}
	httpapi.Write(r.Context(), w, http.StatusOK, parseradmission.Response{BinaryIdentity: identity})
}

// Register before tenant and authentication middleware. Compatibility belongs
// to the executable, not to a request tenant or an authenticated principal.
func parserCompatibilityMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == parseradmission.Path && r.Method == http.MethodGet {
			ParserCompatibility(w, r)
			return
		}
		next.ServeHTTP(w, r)
	})
}
