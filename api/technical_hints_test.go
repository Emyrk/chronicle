package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

type fakeTechnicalHintsStore struct {
	totals          database.TechnicalHintActivityTotalsRow
	mostActive      []database.TechnicalHintMostActiveInstancesRow
	totalsParams    database.TechnicalHintActivityTotalsParams
	mostParams      database.TechnicalHintMostActiveInstancesParams
	totalsCalls     int
	mostActiveCalls int
}

func (f *fakeTechnicalHintsStore) TechnicalHintActivityTotals(_ context.Context, params database.TechnicalHintActivityTotalsParams) (database.TechnicalHintActivityTotalsRow, error) {
	f.totalsCalls++
	f.totalsParams = params
	return f.totals, nil
}

func (f *fakeTechnicalHintsStore) TechnicalHintMostActiveInstances(_ context.Context, params database.TechnicalHintMostActiveInstancesParams) ([]database.TechnicalHintMostActiveInstancesRow, error) {
	f.mostActiveCalls++
	f.mostParams = params
	return f.mostActive, nil
}

func TestTechnicalHintsResponseAndCache(t *testing.T) {
	t.Parallel()

	store := &fakeTechnicalHintsStore{
		totals: database.TechnicalHintActivityTotalsRow{
			LogsProcessed: 4,
			InstanceRuns:  3,
		},
		mostActive: []database.TechnicalHintMostActiveInstancesRow{
			{InstanceName: "Molten Core", RunCount: 2},
		},
	}
	api := &API{technicalHintsStore: store}

	first := httptest.NewRecorder()
	api.TechnicalHints(first, httptest.NewRequest(http.MethodGet, "/api/v1/technical-hints", nil))
	second := httptest.NewRecorder()
	api.TechnicalHints(second, httptest.NewRequest(http.MethodGet, "/api/v1/technical-hints", nil))

	require.Equal(t, http.StatusOK, first.Code)
	require.Equal(t, technicalHintsCacheControl, first.Header().Get("Cache-Control"))
	require.Equal(t, 1, store.totalsCalls)
	require.Equal(t, 1, store.mostActiveCalls)
	require.JSONEq(t, first.Body.String(), second.Body.String())

	var response chroniclesdk.TechnicalHintsResponse
	require.NoError(t, json.Unmarshal(first.Body.Bytes(), &response))
	require.Equal(t, technicalHintsVersion, response.Version)
	require.Equal(t, response.GeneratedAt.Add(technicalHintsCacheTTL), response.RefreshAfter)
	require.Len(t, response.Payloads, 3)
	require.Equal(t, []string{
		"activity-logs-processed-24h",
		"activity-instance-runs-24h",
		"activity-most-active-instances-24h",
	}, []string{response.Payloads[0].ID, response.Payloads[1].ID, response.Payloads[2].ID})
	for _, payload := range response.Payloads {
		require.Equal(t, chroniclesdk.TechnicalHintKindCommunityFact, payload.Kind)
		require.NotEmpty(t, payload.Title)
		require.NotEmpty(t, payload.Body)
		require.NotNil(t, payload.GeneratedAt)
		require.NotNil(t, payload.ExpiresAt)
	}
}

func TestTechnicalHintsCacheDoesNotOverwriteNewerConcurrentResponse(t *testing.T) {
	t.Parallel()

	var cache technicalHintsCache
	olderTime := time.Date(2026, 10, 23, 16, 0, 0, 0, time.UTC)
	newerTime := olderTime.Add(time.Second)
	olderStarted := make(chan struct{})
	releaseOlder := make(chan struct{})
	olderDone := make(chan chroniclesdk.TechnicalHintsResponse)

	go func() {
		response, _ := cache.get("tenant", olderTime, func() (chroniclesdk.TechnicalHintsResponse, error) {
			close(olderStarted)
			<-releaseOlder
			return chroniclesdk.TechnicalHintsResponse{Version: "old", GeneratedAt: olderTime}, nil
		})
		olderDone <- response
	}()

	<-olderStarted
	newer, err := cache.get("tenant", newerTime, func() (chroniclesdk.TechnicalHintsResponse, error) {
		return chroniclesdk.TechnicalHintsResponse{Version: "new", GeneratedAt: newerTime}, nil
	})
	require.NoError(t, err)
	require.Equal(t, "new", newer.Version)
	close(releaseOlder)
	require.Equal(t, "new", (<-olderDone).Version)

	cached, err := cache.get("tenant", newerTime.Add(time.Second), func() (chroniclesdk.TechnicalHintsResponse, error) {
		t.Fatal("fresh cache entry unexpectedly reloaded")
		return chroniclesdk.TechnicalHintsResponse{}, nil
	})
	require.NoError(t, err)
	require.Equal(t, "new", cached.Version)
}

func TestTechnicalHintsCacheIsTenantScoped(t *testing.T) {
	t.Parallel()

	store := &fakeTechnicalHintsStore{}
	api := &API{technicalHintsStore: store}
	for range 2 {
		tenant := database.Tenant{ID: uuid.New()}
		req := httptest.NewRequest(http.MethodGet, "/api/v1/technical-hints", nil)
		req = req.WithContext(servicetenant.WithTenant(req.Context(), tenant))
		api.TechnicalHints(httptest.NewRecorder(), req)
	}

	require.Equal(t, 2, store.totalsCalls)
	require.Equal(t, 2, store.mostActiveCalls)
}

func TestBuildDynamicTechnicalHintsOmitsEmptyFactsAndUses24HourWindow(t *testing.T) {
	t.Parallel()

	generatedAt := time.Date(2026, 10, 23, 16, 0, 0, 0, time.UTC)
	store := &fakeTechnicalHintsStore{}

	payloads, err := buildDynamicTechnicalHints(context.Background(), store, generatedAt)
	require.NoError(t, err)
	require.Empty(t, payloads)
	require.Equal(t, generatedAt.Add(-24*time.Hour), store.totalsParams.StartTime.Time)
	require.Equal(t, generatedAt, store.totalsParams.EndTime.Time)
	require.Equal(t, store.totalsParams.StartTime, store.mostParams.StartTime)
	require.Equal(t, store.totalsParams.EndTime, store.mostParams.EndTime)
	require.EqualValues(t, technicalHintsTopLimit, store.mostParams.LimitCount)
}

type fakeTechnicalHintAssets map[string]string

func (assets fakeTechnicalHintAssets) ServeHTTP(http.ResponseWriter, *http.Request) {}

func (assets fakeTechnicalHintAssets) ReadFile(filename string) ([]byte, error) {
	return []byte(assets[filename]), nil
}

func TestTechnicalHintsDegradesWhenStaticAssetsAreUnavailable(t *testing.T) {
	t.Parallel()

	store := &fakeTechnicalHintsStore{
		totals: database.TechnicalHintActivityTotalsRow{LogsProcessed: 1},
	}
	api := &API{
		Opts:                &Options{Assets: fakeTechnicalHintAssets{}},
		technicalHintsStore: store,
	}
	recorder := httptest.NewRecorder()
	api.TechnicalHints(recorder, httptest.NewRequest(http.MethodGet, "/api/v1/technical-hints", nil))

	require.Equal(t, http.StatusOK, recorder.Code)
	var response chroniclesdk.TechnicalHintsResponse
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &response))
	require.Len(t, response.Payloads, 1)
	require.Equal(t, "activity-logs-processed-24h", response.Payloads[0].ID)
}

func TestLoadStaticTechnicalHints(t *testing.T) {
	t.Parallel()

	payloads, err := loadStaticTechnicalHints(fakeTechnicalHintAssets{
		"general-tips.json": `[{"id":"panel-focus","content":"Right-click a player row."}]`,
		"panel-hints.json":  `[{"id":"death-recap","panelID":"death_log","content":"Inspect events before a death."}]`,
		"blog-posts.json":   `[{"id":"focus-mode","title":"Focus mode","description":"Hide everything else.","tag":"Feature","icon":"spell_holy_mindvision","publishedAt":"2026-10-16"}]`,
	})
	require.NoError(t, err)
	require.Equal(t, []chroniclesdk.TechnicalHint{
		{
			ID: "tip-panel-focus", Kind: chroniclesdk.TechnicalHintKindTip,
			Title: "Panel focus", Body: "Right-click a player row.",
			Href: "/technical#chronicle-tips", Tags: []string{"tip"},
		},
		{
			ID: "panel-death-recap", Kind: chroniclesdk.TechnicalHintKindPanel,
			Title: "Death log", Body: "Inspect events before a death.",
			Href: "/technical#panel-insights", ActionLabel: "See panel insights",
			Panel: "death_log", Tags: []string{"panel", "death_log"},
		},
		{
			ID: "blog-focus-mode", Kind: chroniclesdk.TechnicalHintKindBlog,
			Title: "Focus mode", Body: "Hide everything else.",
			Href: "/blog/focus-mode", ActionLabel: "Read the article",
			Icon: "spell_holy_mindvision", BlogID: "focus-mode", Tags: []string{"blog", "Feature"},
		},
	}, payloads)
}

func TestMostActiveInstancesBodyOmitsZeroRows(t *testing.T) {
	t.Parallel()

	body := mostActiveInstancesBody([]database.TechnicalHintMostActiveInstancesRow{
		{InstanceName: "Molten Core", RunCount: 2},
		{InstanceName: "", RunCount: 5},
		{InstanceName: "Blackwing Lair", RunCount: 0},
	})
	require.Equal(t, "Molten Core (2 runs) in the last 24 hours.", body)
}
