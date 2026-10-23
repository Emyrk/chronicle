package api

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
)

const (
	technicalHintsVersion      = "1"
	technicalHintsWindow       = 24 * time.Hour
	technicalHintsCacheTTL     = 5 * time.Minute
	technicalHintsCacheControl = "public, max-age=300, stale-while-revalidate=900"
	technicalHintsTopLimit     = 3
)

type technicalHintsStore interface {
	TechnicalHintActivityTotals(context.Context, database.TechnicalHintActivityTotalsParams) (database.TechnicalHintActivityTotalsRow, error)
	TechnicalHintMostActiveInstances(context.Context, database.TechnicalHintMostActiveInstancesParams) ([]database.TechnicalHintMostActiveInstancesRow, error)
}

type technicalHintsCacheEntry struct {
	response  chroniclesdk.TechnicalHintsResponse
	expiresAt time.Time
}

type technicalHintsCache struct {
	mu      sync.Mutex
	entries map[string]technicalHintsCacheEntry
}

// TechnicalHints returns cacheable static tips and dynamic community facts.
// Static asset integration can append payloads at the merge point below.
//
//	@Summary	Technical hints and community activity
//	@Tags		Stats
//	@Produce	json
//	@Success	200	{object}	chroniclesdk.TechnicalHintsResponse
//	@Router		/technical-hints [get]
func (api *API) TechnicalHints(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	now := time.Now().UTC()
	cacheKey := servicetenant.TenantIDFromContext(ctx).String()

	response, err := api.technicalHints.get(cacheKey, now, func() (chroniclesdk.TechnicalHintsResponse, error) {
		dynamic, err := buildDynamicTechnicalHints(ctx, api.technicalHintsStore, now)
		if err != nil {
			return chroniclesdk.TechnicalHintsResponse{}, err
		}

		return chroniclesdk.TechnicalHintsResponse{
			Version:      technicalHintsVersion,
			GeneratedAt:  now,
			RefreshAfter: now.Add(technicalHintsCacheTTL),
			Payloads:     mergeTechnicalHints(staticTechnicalHints(), dynamic),
		}, nil
	})
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to fetch technical hints",
				Detail:  err.Error(),
			},
		})
		return
	}

	w.Header().Set("Cache-Control", technicalHintsCacheControl)
	httpapi.Write(ctx, w, http.StatusOK, response)
}

func (cache *technicalHintsCache) get(key string, now time.Time, load func() (chroniclesdk.TechnicalHintsResponse, error)) (chroniclesdk.TechnicalHintsResponse, error) {
	cache.mu.Lock()
	defer cache.mu.Unlock()

	if entry, ok := cache.entries[key]; ok && now.Before(entry.expiresAt) {
		return entry.response, nil
	}

	response, err := load()
	if err != nil {
		return chroniclesdk.TechnicalHintsResponse{}, err
	}
	if cache.entries == nil {
		cache.entries = make(map[string]technicalHintsCacheEntry)
	}
	cache.entries[key] = technicalHintsCacheEntry{
		response:  response,
		expiresAt: now.Add(technicalHintsCacheTTL),
	}
	return response, nil
}

func buildDynamicTechnicalHints(ctx context.Context, store technicalHintsStore, generatedAt time.Time) ([]chroniclesdk.TechnicalHint, error) {
	startTime := generatedAt.Add(-technicalHintsWindow)
	window := database.TechnicalHintActivityTotalsParams{
		StartTime: database.Timestamptz(startTime),
		EndTime:   database.Timestamptz(generatedAt),
	}
	totals, err := store.TechnicalHintActivityTotals(ctx, window)
	if err != nil {
		return nil, fmt.Errorf("activity totals: %w", err)
	}

	mostActive, err := store.TechnicalHintMostActiveInstances(ctx, database.TechnicalHintMostActiveInstancesParams{
		StartTime:  window.StartTime,
		EndTime:    window.EndTime,
		LimitCount: technicalHintsTopLimit,
	})
	if err != nil {
		return nil, fmt.Errorf("most active instances: %w", err)
	}

	expiresAt := generatedAt.Add(technicalHintsCacheTTL)
	payloads := make([]chroniclesdk.TechnicalHint, 0, 3)
	if totals.LogsProcessed > 0 {
		payloads = append(payloads, communityFact(
			"activity-logs-processed-24h",
			fmt.Sprintf("%d %s processed", totals.LogsProcessed, pluralize(totals.LogsProcessed, "log", "logs")),
			"Chronicle processed these public uploads in the last 24 hours.",
			generatedAt,
			expiresAt,
		))
	}
	if totals.InstanceRuns > 0 {
		payloads = append(payloads, communityFact(
			"activity-instance-runs-24h",
			fmt.Sprintf("%d public %s", totals.InstanceRuns, pluralize(totals.InstanceRuns, "instance run", "instance runs")),
			"Duplicate uploads are combined into one run for the last 24 hours.",
			generatedAt,
			expiresAt,
		))
	}
	if body := mostActiveInstancesBody(mostActive); body != "" {
		payloads = append(payloads, communityFact(
			"activity-most-active-instances-24h",
			"Most active instances",
			body,
			generatedAt,
			expiresAt,
		))
	}
	return payloads, nil
}

func staticTechnicalHints() []chroniclesdk.TechnicalHint {
	// Static generated-asset payloads are intentionally integrated here later.
	return nil
}

func mergeTechnicalHints(static, dynamic []chroniclesdk.TechnicalHint) []chroniclesdk.TechnicalHint {
	payloads := make([]chroniclesdk.TechnicalHint, 0, len(static)+len(dynamic))
	payloads = append(payloads, static...)
	payloads = append(payloads, dynamic...)
	return payloads
}

func communityFact(id, title, body string, generatedAt, expiresAt time.Time) chroniclesdk.TechnicalHint {
	return chroniclesdk.TechnicalHint{
		ID:          id,
		Kind:        chroniclesdk.TechnicalHintKindCommunityFact,
		Title:       title,
		Body:        body,
		GeneratedAt: &generatedAt,
		ExpiresAt:   &expiresAt,
	}
}

func mostActiveInstancesBody(rows []database.TechnicalHintMostActiveInstancesRow) string {
	parts := make([]string, 0, len(rows))
	for _, row := range rows {
		if row.InstanceName == "" || row.RunCount <= 0 {
			continue
		}
		parts = append(parts, fmt.Sprintf("%s (%d %s)", row.InstanceName, row.RunCount, pluralize(row.RunCount, "run", "runs")))
	}
	if len(parts) == 0 {
		return ""
	}
	return strings.Join(parts, ", ") + " in the last 24 hours."
}

func pluralize(value int64, singular, plural string) string {
	if value == 1 {
		return singular
	}
	return plural
}
