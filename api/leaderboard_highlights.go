package api

import (
	"context"
	"encoding/json"
	"net/http"
	"slices"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/serviceratings"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
)

func (api *API) LeaderboardHighlights(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	tenant := servicetenant.TenantFromContext(ctx)
	if tenant == nil {
		httpapi.Write(ctx, w, 400, chroniclesdk.Response{Message: "Open a tenant site to view leaderboard highlights."})
		return
	}
	out := chroniclesdk.LeaderboardHighlightsResponse{Status: "ready", LandingPreviews: []chroniclesdk.HubLandingPreview{}, Snapshots: []chroniclesdk.LeaderboardHighlightSnapshot{}}
	q := r.URL.Query()
	ids := q["realm"]
	if len(q["realm_ids"]) > 1 {
		out.Status = "unsupported_scope"
		httpapi.Write(ctx, w, 200, out)
		return
	}
	if q.Get("realm_ids") != "" {
		ids = append(ids, strings.Split(q.Get("realm_ids"), ",")...)
	}
	if len(ids) > 1 {
		out.Status = "unsupported_scope"
		httpapi.Write(ctx, w, 200, out)
		return
	}
	realm := uuid.Nil
	if len(ids) == 1 && ids[0] != "" {
		id, err := uuid.Parse(ids[0])
		if err != nil || id == uuid.Nil {
			httpapi.Write(ctx, w, 400, chroniclesdk.Response{Message: "Invalid realm ID"})
			return
		}
		realm = id
	}
	db := database.New(api.Opts.Pool)
	if realm != uuid.Nil {
		realms, err := db.LeaderboardHighlightRealms(ctx, tenant.ID)
		if err != nil {
			httpapi.InternalServerError(w, err)
			return
		}
		if !slices.Contains(realms, realm) {
			httpapi.Write(ctx, w, 400, chroniclesdk.Response{Message: "Realm does not belong to this tenant"})
			return
		}
	}
	config, cohorts, err := serviceratings.HighlightConfiguration(ctx, db, tenant.ID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	stored, err := db.ListLeaderboardHighlights(ctx, database.ListLeaderboardHighlightsParams{TenantID: tenant.ID, RealmScope: realm})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	out, needRefresh, err := highlightSnapshotResponse(config, cohorts, stored)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	// Fingerprint mismatch covers seed/config/default-set mutations without unsafe
	// callbacks or synchronous calculation. Hourly dispatch repairs missed nudges.
	if needRefresh && api.Queues != nil {
		_, enqueueErr := api.Queues.Insert(ctx, serviceratings.ArgsHighlightDispatch{TenantID: tenant.ID}, nil)
		if enqueueErr != nil && api.Opts.Logger != nil {
			api.Opts.Logger.WarnContext(ctx, "queue leaderboard highlight refresh", "error", enqueueErr)
		}
	}
	httpapi.Write(ctx, w, 200, out)
}

func (api *API) AdminRefreshLeaderboardHighlights(w http.ResponseWriter, r *http.Request) {
	var req chroniclesdk.RefreshLeaderboardHighlightsRequest
	if !httpapi.Read(r.Context(), w, r, &req) {
		return
	}
	if req.TenantID == uuid.Nil {
		httpapi.Write(r.Context(), w, 400, chroniclesdk.Response{Message: "tenant_id is required"})
		return
	}
	if api.Queues == nil {
		httpapi.Write(r.Context(), w, 503, chroniclesdk.Response{Message: "Refresh queue unavailable"})
		return
	}
	_, err := database.New(api.Opts.Pool).GetTenantByID(servicetenant.WithTenantID(r.Context(), req.TenantID), req.TenantID)
	if err != nil {
		httpapi.Write(r.Context(), w, 400, chroniclesdk.Response{Message: "Unknown tenant"})
		return
	}
	if _, err = api.Queues.Insert(r.Context(), serviceratings.ArgsHighlightDispatch{TenantID: req.TenantID}, nil); err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(r.Context(), w, 202, chroniclesdk.Response{Message: "Leaderboard highlight refresh queued."})
}

func highlightSnapshotResponse(config []database.ResolveLeaderboardConfigurationRow, cohorts []serviceratings.HighlightCohort, stored []database.LeaderboardHighlight) (chroniclesdk.LeaderboardHighlightsResponse, bool, error) {
	out := chroniclesdk.LeaderboardHighlightsResponse{Status: "ready", LandingPreviews: []chroniclesdk.HubLandingPreview{}, Snapshots: []chroniclesdk.LeaderboardHighlightSnapshot{}}
	needRefresh := false
	for _, c := range cohorts {
		fingerprint := serviceratings.HighlightFingerprint(config, c)
		metadata := chroniclesdk.LeaderboardHighlightSnapshot{InstanceName: c.Instance, DifficultyName: c.Difficulty, MaxPlayers: c.Size, Status: "not_prepared", ConfigurationFingerprint: fingerprint}
		for _, row := range stored {
			if row.InstanceName != c.Instance || row.DifficultyName != c.Difficulty || row.MaxPlayers != c.Size {
				continue
			}
			metadata.RefreshedAt = &row.RefreshedAt.Time
			if row.ConfigurationFingerprint != fingerprint {
				metadata.Status = "rebuilding"
				break
			}
			var preview chroniclesdk.HubLandingPreview
			if err := json.Unmarshal(row.Payload, &preview); err != nil {
				return out, false, err
			}
			metadata.Status = "ready"
			if serviceratings.HighlightEmpty(preview) {
				metadata.Status = "empty"
			}
			if row.RefreshedAt.Time.Before(time.Now().Add(-time.Hour)) {
				metadata.Status = "stale"
			}
			out.LandingPreviews = append(out.LandingPreviews, preview)
			break
		}
		if metadata.Status == "not_prepared" || metadata.Status == "rebuilding" || metadata.Status == "stale" {
			needRefresh = true
			out.Status = "partial"
		}
		out.Snapshots = append(out.Snapshots, metadata)
	}
	return out, needRefresh, nil
}
