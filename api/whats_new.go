package api

import (
	"net/http"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
)

func (api *API) GetMyWhatsNewStatus(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := chronauth.MustAuthenticatedClaims(ctx)
	status, err := api.Opts.WhatsNew.Status(ctx, claims.Subject)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.WhatsNewStatus{
		CurrentID: status.CurrentID, HasUnread: status.HasUnread,
	})
}

func (api *API) MarkMyWhatsNewRead(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := chronauth.MustAuthenticatedClaims(ctx)
	status, err := api.Opts.WhatsNew.MarkRead(ctx, claims.Subject)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.WhatsNewStatus{
		CurrentID: status.CurrentID, HasUnread: status.HasUnread,
	})
}
