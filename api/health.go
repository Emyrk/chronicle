package api

import (
	"net/http"

	"github.com/Emyrk/chronicle/api/httpapi"
)

func healthz(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	httpapi.Write(r.Context(), w, http.StatusOK, "OK")
}
