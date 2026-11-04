package servicerankings

import (
	"net/http"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
)

func (s *Service) handleRatingCatchup(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	caughtUp, err := s.store.GetTenantRatingCatchupSummary(ctx, servicetenant.TenantIDFromContext(ctx))
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	// This status changes as pages commit; do not apply the board's 15-minute CDN TTL.
	w.Header().Set("Cache-Control", "public, max-age=15")
	w.Header().Set("Cloudflare-CDN-Cache-Control", "public, max-age=15")
	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.TenantRatingCatchupResponse{CaughtUp: caughtUp.Valid && caughtUp.Bool})
}
