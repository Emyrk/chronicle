package api

import (
	"context"
	"encoding/json"
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

	var assets staticHintAssetReader
	if api.Opts != nil {
		assets = api.Opts.Assets
	}
	response, err := api.technicalHints.get(cacheKey, now, func() (chroniclesdk.TechnicalHintsResponse, error) {
		static, staticErr := loadStaticTechnicalHints(assets)
		if staticErr != nil {
			static = nil
			if api.Opts != nil && api.Opts.Logger != nil {
				api.Opts.Logger.WarnContext(ctx, "technical hint assets unavailable", "error", staticErr)
			}
		}
		dynamic, err := buildDynamicTechnicalHints(ctx, api.technicalHintsStore, now)
		if err != nil {
			return chroniclesdk.TechnicalHintsResponse{}, err
		}

		return chroniclesdk.TechnicalHintsResponse{
			Version:      technicalHintsVersion,
			GeneratedAt:  now,
			RefreshAfter: now.Add(technicalHintsCacheTTL),
			Payloads:     mergeTechnicalHints(static, dynamic),
		}, nil
	})
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{Message: "Failed to fetch technical hints"},
		})
		return
	}

	w.Header().Set("Cache-Control", technicalHintsCacheControl)
	httpapi.Write(ctx, w, http.StatusOK, response)
}

func (cache *technicalHintsCache) get(key string, now time.Time, load func() (chroniclesdk.TechnicalHintsResponse, error)) (chroniclesdk.TechnicalHintsResponse, error) {
	cache.mu.Lock()
	if entry, ok := cache.entries[key]; ok && now.Before(entry.expiresAt) {
		cache.mu.Unlock()
		return entry.response, nil
	}
	cache.mu.Unlock()

	// Do not hold the global cache lock during asset or database I/O. Concurrent
	// misses may duplicate a refresh, but one slow tenant cannot block the rest.
	response, err := load()
	if err != nil {
		return chroniclesdk.TechnicalHintsResponse{}, err
	}

	cache.mu.Lock()
	if cache.entries == nil {
		cache.entries = make(map[string]technicalHintsCacheEntry)
	}
	if current, ok := cache.entries[key]; ok && current.response.GeneratedAt.After(response.GeneratedAt) {
		response = current.response
	} else {
		cache.entries[key] = technicalHintsCacheEntry{
			response:  response,
			expiresAt: now.Add(technicalHintsCacheTTL),
		}
	}
	cache.mu.Unlock()
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

type staticHintAssetReader interface {
	ReadFile(string) ([]byte, error)
}

type generalTipAsset struct {
	ID      string `json:"id"`
	Content string `json:"content"`
}

type panelHintAsset struct {
	ID      string `json:"id"`
	PanelID string `json:"panelID"`
	Content string `json:"content"`
}

type blogPostAsset struct {
	ID          string     `json:"id"`
	Title       string     `json:"title"`
	Description string     `json:"description"`
	Tag         string     `json:"tag"`
	Icon        string     `json:"icon"`
	PublishedAt string     `json:"publishedAt"`
	FlavorSets  [][]string `json:"flavorSets"`
}

func loadStaticTechnicalHints(reader staticHintAssetReader) ([]chroniclesdk.TechnicalHint, error) {
	if reader == nil {
		return nil, nil
	}

	var tips []generalTipAsset
	if err := readTechnicalHintAsset(reader, "general-tips.json", &tips); err != nil {
		return nil, err
	}
	var panels []panelHintAsset
	if err := readTechnicalHintAsset(reader, "panel-hints.json", &panels); err != nil {
		return nil, err
	}
	var posts []blogPostAsset
	if err := readTechnicalHintAsset(reader, "blog-posts.json", &posts); err != nil {
		return nil, err
	}

	payloads := make([]chroniclesdk.TechnicalHint, 0, len(tips)+len(panels)+len(posts))
	for _, tip := range tips {
		if tip.ID == "" || tip.Content == "" {
			continue
		}
		payloads = append(payloads, chroniclesdk.TechnicalHint{
			ID:    "tip-" + tip.ID,
			Kind:  chroniclesdk.TechnicalHintKindTip,
			Title: humanizeHintID(tip.ID),
			Body:  tip.Content,
			Href:  "/technical#chronicle-tips",
			Tags:  []string{"tip"},
		})
	}
	for _, panel := range panels {
		if panel.ID == "" || panel.PanelID == "" || panel.Content == "" {
			continue
		}
		payloads = append(payloads, chroniclesdk.TechnicalHint{
			ID:          "panel-" + panel.ID,
			Kind:        chroniclesdk.TechnicalHintKindPanel,
			Title:       humanizeHintID(panel.PanelID),
			Body:        panel.Content,
			Href:        "/technical#panel-insights",
			ActionLabel: "See panel insights",
			Panel:       panel.PanelID,
			Tags:        []string{"panel", panel.PanelID},
		})
	}
	for _, post := range posts {
		if post.ID == "" || post.Title == "" || post.Description == "" {
			continue
		}
		payloads = append(payloads, chroniclesdk.TechnicalHint{
			ID:          "blog-" + post.ID,
			Kind:        chroniclesdk.TechnicalHintKindBlog,
			Title:       post.Title,
			Body:        post.Description,
			Href:        "/blog/" + post.ID,
			ActionLabel: "Read the article",
			Icon:        post.Icon,
			BlogID:      post.ID,
			Tags:        []string{"blog", post.Tag},
		})
	}
	return payloads, nil
}

func readTechnicalHintAsset(reader staticHintAssetReader, filename string, target any) error {
	data, err := reader.ReadFile(filename)
	if err != nil {
		return fmt.Errorf("read %s: %w", filename, err)
	}
	if err := json.Unmarshal(data, target); err != nil {
		return fmt.Errorf("decode %s: %w", filename, err)
	}
	return nil
}

func humanizeHintID(id string) string {
	words := strings.ReplaceAll(strings.ReplaceAll(id, "-", " "), "_", " ")
	if words == "" {
		return "Chronicle tip"
	}
	return strings.ToUpper(words[:1]) + words[1:]
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
