package externalapi

import (
	"net/http"

	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/go-chi/chi/v5"
)

// Handler serves Chronicle's public, unauthenticated API.
type Handler struct{}

func New() *Handler {
	return &Handler{}
}

func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Get("/health", h.Health)
	return r
}

type HealthResponse struct {
	Status string `json:"status"`
}

func (h *Handler) Health(w http.ResponseWriter, r *http.Request) {
	httpapi.Write(r.Context(), w, http.StatusOK, HealthResponse{Status: "ok"})
}
