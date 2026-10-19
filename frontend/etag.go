package frontend

import (
	"fmt"
	"net/http"
	"path"
	"strings"

	"github.com/Emyrk/chronicle/internal/version"
)

func etagMiddleware(next http.Handler) http.Handler {
	etag := fmt.Sprintf(`"%s-%s-%s"`, version.GitTag, version.GitCommit, version.BuildTime)
	if strings.EqualFold(version.GitTag, "unknown") {
		// Don't set an ETag if we don't have version info, to avoid caching issues during development
		return next
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var cacheControl string
		switch path.Ext(r.URL.Path) {
		case ".js", ".css":
			cacheControl = "public, max-age=86400"
		case ".woff", ".woff2":
			cacheControl = "public, max-age=604800"
		default:
			next.ServeHTTP(w, r)
			return
		}
		if r.Header.Get("If-None-Match") == etag {
			w.WriteHeader(http.StatusNotModified)
			return
		}
		w.Header().Set("ETag", etag)
		w.Header().Set("Cache-Control", cacheControl)
		next.ServeHTTP(w, r)
	})
}
