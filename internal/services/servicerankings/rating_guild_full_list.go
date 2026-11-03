package servicerankings

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type publishedGuildFullListReader interface {
	GetActiveTenantRatingGeneration(context.Context, uuid.UUID) (uuid.UUID, error)
	GetPublishedGuildBossFullList(context.Context, database.GetPublishedGuildBossFullListParams) (database.GetPublishedGuildBossFullListRow, error)
	GetPublishedGuildScopeFullList(context.Context, database.GetPublishedGuildScopeFullListParams) (database.GetPublishedGuildScopeFullListRow, error)
}

func (s *Service) handlePublishedGuildFullList(w http.ResponseWriter, r *http.Request) {
	handlePublishedGuildFullListWithStore(s.store, w, r)
}

func handlePublishedGuildFullListWithStore(store publishedGuildFullListReader, w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	// The published cursor reader validates the guild cohort and realm UUIDs.
	parsed := *r.URL
	parsed.RawQuery = q.Encode()
	request := *r
	request.URL = &parsed
	q, realms, _, _, _, err := tenantRatingInput(&request, true, q.Has("encounter_name"))
	if err != nil || q.Has("cursor") {
		tenantRatingBad(w, r, "invalid guild full-list cohort")
		return
	}
	page := int64(0)
	if q.Has("page") {
		page, err = strconv.ParseInt(q.Get("page"), 10, 32)
	}
	if err != nil || page < 0 {
		tenantRatingBad(w, r, "page must be a non-negative integer")
		return
	}
	limit := int64(50)
	if q.Has("limit") {
		limit, err = strconv.ParseInt(q.Get("limit"), 10, 32)
	}
	if err != nil || limit < 1 || limit > 50 || page > (int64(2147483647)-limit)/limit {
		tenantRatingBad(w, r, "limit must be between 1 and 50 and page must fit the result offset")
		return
	}
	query := strings.TrimSpace(q.Get("query"))
	if len(query) > 200 {
		tenantRatingBad(w, r, "query must be at most 200 bytes")
		return
	}
	ctx := r.Context()
	tenant := servicetenant.TenantIDFromContext(ctx)
	generation, err := store.GetActiveTenantRatingGeneration(ctx, tenant)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) && !errors.Is(err, sql.ErrNoRows) {
		httpapi.InternalServerError(w, err)
		return
	}
	result := chroniclesdk.PublishedGuildFullListResponse{Rows: []chroniclesdk.PublishedGuildFullListRow{}, Page: int(page)}
	if generation == uuid.Nil || err != nil {
		httpapi.Write(ctx, w, http.StatusOK, result)
		return
	}
	window := q.Get("window_kind")
	otherWindow, renownWindow := window, window
	switch window {
	case "all_time":
		renownWindow = "career"
	case "career":
		otherWindow = "all_time"
	}
	otherDifficulty, otherMaxPlayers := q.Get("difficulty_name"), tenantMax(q)
	params := database.GetPublishedGuildBossFullListParams{
		TenantID: tenant, GenerationID: generation,
		InstanceName: q.Get("instance_name"), EncounterName: q.Get("encounter_name"),
		DifficultyName: q.Get("difficulty_name"), MaxPlayers: tenantMax(q),
		RatingMetric: q.Get("rating_metric"),
		WindowKind:   window, OtherWindowKind: otherWindow, RenownWindowKind: renownWindow,
		OtherDifficultyName: otherDifficulty, OtherMaxPlayers: otherMaxPlayers,
		RealmIds: realms, SearchQuery: query,
		LimitCount: int32(limit), OffsetCount: int32(page * limit),
	}
	var total int64
	var rawRows any
	if q.Has("encounter_name") {
		row, readErr := store.GetPublishedGuildBossFullList(ctx, params)
		total, rawRows, err = row.Total, row.Rows, readErr
	} else {
		row, readErr := store.GetPublishedGuildScopeFullList(ctx, database.GetPublishedGuildScopeFullListParams{
			TenantID: params.TenantID, GenerationID: params.GenerationID, InstanceName: params.InstanceName,
			DifficultyName: params.DifficultyName, MaxPlayers: params.MaxPlayers, RatingMetric: params.RatingMetric, WindowKind: params.WindowKind, RealmIds: params.RealmIds,
			SearchQuery: params.SearchQuery, OtherWindowKind: params.OtherWindowKind,
			RenownWindowKind: params.RenownWindowKind, OtherDifficultyName: params.OtherDifficultyName,
			OtherMaxPlayers: params.OtherMaxPlayers,
			OffsetCount:     params.OffsetCount, LimitCount: params.LimitCount,
		})
		total, rawRows, err = row.Total, row.Rows, readErr
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	// Offset pages have no cursor. Reject a page assembled across a published
	// generation switch rather than returning misleading ranks/total.
	active, err := store.GetActiveTenantRatingGeneration(ctx, tenant)
	if errors.Is(err, pgx.ErrNoRows) || errors.Is(err, sql.ErrNoRows) || (err == nil && active != generation) {
		tenantRatingStale(w, r)
		return
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	encoded, err := json.Marshal(rawRows)
	if err == nil {
		err = json.Unmarshal(encoded, &result.Rows)
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	result.Total = total
	result.HasNextPage = page*limit+int64(len(result.Rows)) < result.Total
	httpapi.Write(ctx, w, http.StatusOK, result)
}
