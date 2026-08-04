package api

import (
	"net/http"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/internal/version"
)

// ParserVersion returns the exact parser version string used by this server
// to stamp parsed instances.
//
// GET /api/v1/parser-version (unauthenticated)
func (*API) ParserVersion(w http.ResponseWriter, r *http.Request) {
	httpapi.Write(r.Context(), w, http.StatusOK, chroniclesdk.ParserVersionResponse{
		Version: version.ExactParserVersion(),
	})
}
