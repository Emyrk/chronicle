package api

import (
	"context"
	"net/http"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
)

const (
	telemetryNoticeAudiencePublic = "public"
	telemetryNoticeAudienceAdmin  = "admin"
)

type telemetryNoticeListFunc func(context.Context) ([]database.TelemetryNotice, error)

func (api *API) ListPublicTelemetryNotices(w http.ResponseWriter, r *http.Request) {
	api.listTelemetryNotices(
		w,
		r,
		telemetryNoticeAudiencePublic,
		database.New(api.Opts.Pool).ListActivePublicTelemetryNotices,
	)
}

func (api *API) AdminListTelemetryNotices(w http.ResponseWriter, r *http.Request) {
	api.listTelemetryNotices(
		w,
		r,
		telemetryNoticeAudienceAdmin,
		database.New(api.Opts.Pool).ListActiveAdminTelemetryNotices,
	)
}

func (api *API) listTelemetryNotices(
	w http.ResponseWriter,
	r *http.Request,
	audience string,
	list telemetryNoticeListFunc,
) {
	ctx := r.Context()
	rows, err := list(ctx)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	notices := make([]chroniclesdk.TelemetryNotice, 0, len(rows))
	for _, row := range rows {
		// Keep a second audience check at the serialization boundary so a query
		// regression cannot expose admin notices through the public endpoint.
		if row.Audience == audience {
			notices = append(notices, telemetryNoticeToSDK(row))
		}
	}

	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.TelemetryNoticesResponse{Notices: notices})
}

func telemetryNoticeToSDK(row database.TelemetryNotice) chroniclesdk.TelemetryNotice {
	notice := chroniclesdk.TelemetryNotice{
		ID:        row.ID,
		Audience:  row.Audience,
		Category:  row.Category,
		Severity:  chroniclesdk.TelemetryNoticeSeverity(row.Severity),
		Title:     row.Title,
		Message:   row.Message,
		UpdatedAt: row.UpdatedAt.Time,
	}
	if row.ActionLabel.Valid {
		notice.ActionLabel = &row.ActionLabel.String
	}
	if row.ActionUrl.Valid {
		notice.ActionURL = &row.ActionUrl.String
	}
	if row.StartsAt.Valid {
		notice.StartsAt = &row.StartsAt.Time
	}
	if row.ExpiresAt.Valid {
		notice.ExpiresAt = &row.ExpiresAt.Time
	}
	return notice
}
