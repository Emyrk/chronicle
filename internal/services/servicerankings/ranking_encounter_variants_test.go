package servicerankings

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/require"
)

func TestRankingEncounterVariants(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		name, raw, want   string
		instances, bosses []string
		invalid           bool
	}{
		{name: "combined omitted"},
		{name: "Thorim normal", raw: `{"Thorim":"normal"}`, want: `{"Thorim":"normal"}`, instances: []string{"Ulduar"}, bosses: []string{"Thorim"}},
		{name: "Thorim hard", raw: `{"Thorim":"hard"}`, want: `{"Thorim":"hard"}`, instances: []string{"Ulduar"}, bosses: []string{"Thorim"}},
		{name: "Thorim rejects medium", raw: `{"Thorim":"medium"}`, instances: []string{"Ulduar"}, bosses: []string{"Thorim"}, invalid: true},
		{name: "Thorim wrong instance", raw: `{"Thorim":"hard"}`, instances: []string{"Naxxramas"}, bosses: []string{"Thorim"}, invalid: true},
		{name: "Thorim independent selection", raw: `{"Thorim":"normal","Hodir":"hard"}`, want: `{"Hodir":"hard","Thorim":"normal"}`, instances: []string{"Ulduar"}, bosses: []string{"Thorim", "Hodir"}},
		{name: "Assembly normal", raw: `{"Assembly of Iron":"normal"}`, want: `{"Assembly of Iron":"normal"}`, instances: []string{"Ulduar"}, bosses: []string{"Assembly of Iron"}},
		{name: "Assembly medium", raw: `{"Assembly of Iron":"medium"}`, want: `{"Assembly of Iron":"medium"}`, instances: []string{"Ulduar"}, bosses: []string{"Assembly of Iron"}},
		{name: "Assembly hard", raw: `{"Assembly of Iron":"hard"}`, want: `{"Assembly of Iron":"hard"}`, instances: []string{"Ulduar"}, bosses: []string{"Assembly of Iron"}},
		{name: "Yogg-Saron rejects medium", raw: `{"Yogg-Saron":"medium"}`, instances: []string{"Ulduar"}, bosses: []string{"Yogg-Saron"}, invalid: true},
		{name: "Hodir rejects medium", raw: `{"Hodir":"medium"}`, instances: []string{"Ulduar"}, bosses: []string{"Hodir"}, invalid: true},
		{name: "XT-002 Deconstructor rejects medium", raw: `{"XT-002 Deconstructor":"medium"}`, instances: []string{"Ulduar"}, bosses: []string{"XT-002 Deconstructor"}, invalid: true},
		{name: "General Vezax rejects medium", raw: `{"General Vezax":"medium"}`, instances: []string{"Ulduar"}, bosses: []string{"General Vezax"}, invalid: true},
		{name: "Assembly of Iron rejects lights_0", raw: `{"Assembly of Iron":"lights_0"}`, instances: []string{"Ulduar"}, bosses: []string{"Assembly of Iron"}, invalid: true},
		{name: "Assembly of Iron rejects combined", raw: `{"Assembly of Iron":"combined"}`, instances: []string{"Ulduar"}, bosses: []string{"Assembly of Iron"}, invalid: true},
		{name: "Yogg 0 Light", raw: `{"Yogg-Saron":"lights_0"}`, want: `{"Yogg-Saron":"lights_0"}`, instances: []string{"Ulduar"}, bosses: []string{"Yogg-Saron"}},
		{name: "Yogg 1 Light", raw: `{"Yogg-Saron":"lights_1"}`, want: `{"Yogg-Saron":"lights_1"}`, instances: []string{"Ulduar"}, bosses: []string{"Yogg-Saron"}},
		{name: "Yogg 2 Light", raw: `{"Yogg-Saron":"lights_2"}`, want: `{"Yogg-Saron":"lights_2"}`, instances: []string{"Ulduar"}, bosses: []string{"Yogg-Saron"}},
		{name: "Yogg 3 Light", raw: `{"Yogg-Saron":"lights_3"}`, want: `{"Yogg-Saron":"lights_3"}`, instances: []string{"Ulduar"}, bosses: []string{"Yogg-Saron"}},
		{name: "Yogg 4 Light", raw: `{"Yogg-Saron":"lights_4"}`, want: `{"Yogg-Saron":"lights_4"}`, instances: []string{"Ulduar"}, bosses: []string{"Yogg-Saron"}},
		{name: "Yogg rejects binary tier", raw: `{"Yogg-Saron":"hard"}`, instances: []string{"Ulduar"}, bosses: []string{"Yogg-Saron"}, invalid: true},
		{name: "Hodir rejects light tier", raw: `{"Hodir":"lights_0"}`, instances: []string{"Ulduar"}, bosses: []string{"Hodir"}, invalid: true},
		{name: "combined empty map", raw: "{}"},
		{name: "hard mixed selection", raw: ` { "Hodir" : "hard" } `, want: `{"Hodir":"hard"}`, instances: []string{"Ulduar"}, bosses: []string{"Hodir", "Freya"}},
		{name: "two exact bosses", raw: `{"XT-002 Deconstructor":"normal","Hodir":"hard"}`, want: `{"Hodir":"hard","XT-002 Deconstructor":"normal"}`, instances: []string{"Ulduar"}, bosses: []string{"Hodir", "XT-002 Deconstructor"}},
		{name: "normal", raw: `{"Hodir":"normal"}`, want: `{"Hodir":"normal"}`, instances: []string{"Ulduar"}, bosses: []string{"Hodir"}},
		{name: "Vezax normal", raw: `{"General Vezax":"normal"}`, want: `{"General Vezax":"normal"}`, instances: []string{"Ulduar"}, bosses: []string{"General Vezax"}},
		{name: "Vezax hard", raw: `{"General Vezax":"hard"}`, want: `{"General Vezax":"hard"}`, instances: []string{"Ulduar"}, bosses: []string{"General Vezax"}},
		{name: "Vezax wrong instance", raw: `{"General Vezax":"hard"}`, instances: []string{"Naxxramas"}, bosses: []string{"General Vezax"}, invalid: true},
		{name: "Vezax invalid tier", raw: `{"General Vezax":"elite"}`, instances: []string{"Ulduar"}, bosses: []string{"General Vezax"}, invalid: true},
		{name: "unselected", raw: `{"Hodir":"hard"}`, instances: []string{"Ulduar"}, bosses: []string{"Freya"}, invalid: true},
		{name: "unscoped", raw: `{"Hodir":"hard"}`, bosses: []string{"Hodir"}, invalid: true},
		{name: "wrong instance", raw: `{"Hodir":"hard"}`, instances: []string{"Naxxramas"}, bosses: []string{"Hodir"}, invalid: true},
		{name: "multiple instances", raw: `{"Hodir":"hard"}`, instances: []string{"Ulduar", "Naxxramas"}, bosses: []string{"Hodir"}, invalid: true},
		{name: "unsupported boss", raw: `{"Freya":"hard"}`, instances: []string{"Ulduar"}, bosses: []string{"Freya"}, invalid: true},
		{name: "combined value invalid", raw: `{"Hodir":"combined"}`, instances: []string{"Ulduar"}, bosses: []string{"Hodir"}, invalid: true},
		{name: "null", raw: "null", invalid: true},
		{name: "array", raw: "[]", invalid: true},
		{name: "wrong value type", raw: `{"Hodir":1}`, invalid: true},
		{name: "malformed", raw: "{", invalid: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			q := url.Values{}
			if tc.raw != "" {
				q.Set("encounter_variants", tc.raw)
			}
			r := httptest.NewRequest(http.MethodGet, "/?"+q.Encode(), nil)
			w := httptest.NewRecorder()
			got, ok := rankingEncounterVariants(w, r, tc.instances, tc.bosses)
			require.Equal(t, !tc.invalid, ok)
			if tc.invalid {
				require.Equal(t, http.StatusBadRequest, w.Code)
			} else {
				require.Equal(t, tc.want, string(got))
			}
		})
	}
}

func TestRankingVariantQueryAmbiguity(t *testing.T) {
	t.Parallel()
	for _, q := range []url.Values{
		{"encounter_variants": {`{"Hodir":"normal"}`, `{"Hodir":"hard"}`}},
		{"encounter_variant": {"hard"}},
		{"encounter_variant": {"hard"}, "encounter_variants": {`{"Hodir":"normal"}`}},
	} {
		_, err := decodeRankingEncounterVariants(q)
		require.Error(t, err)
	}
}

func TestRankingVariantHandlersRejectBeforeQuery(t *testing.T) {
	t.Parallel()
	// Nil store proves rejected requests do not query or become cached successes.
	s := &Service{router: chi.NewRouter()}
	s.setupRoutes()
	for _, path := range []string{"leaderboard", "stats", "kill-times", "success-rates"} {
		t.Run(path, func(t *testing.T) {
			t.Parallel()
			for _, raw := range []string{`{"Freya":"hard"}`, "[]", "null", ""} {
				q := url.Values{"instance_names": {"Ulduar"}, "instance_name": {"Ulduar"}, "encounter_names": {"Hodir,Freya"}, "encounter_variants": {raw}}
				w := httptest.NewRecorder()
				s.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/"+path+"?"+q.Encode(), nil))
				require.Equal(t, http.StatusBadRequest, w.Code, raw)
				require.Empty(t, w.Header().Get("Cache-Control"))
			}
		})
	}
}

func TestSuccessRatesRejectExactVariants(t *testing.T) {
	t.Parallel()
	for _, variant := range []string{"normal", "hard"} {
		q := url.Values{"instance_name": {"Ulduar"}, "encounter_names": {"Hodir"}, "encounter_variants": {`{"Hodir":"` + variant + `"}`}}
		w := httptest.NewRecorder()
		(&Service{}).handleSuccessRates(w, httptest.NewRequest(http.MethodGet, "/?"+q.Encode(), nil))
		require.Equal(t, http.StatusBadRequest, w.Code)
		require.Contains(t, w.Body.String(), "unsuccessful attempts are not classified")
	}
}

type variantKillTimeStore struct {
	params database.RankingsKillTimeStatsParams
}

func (s *variantKillTimeStore) RankingsKillTimeStats(_ context.Context, p database.RankingsKillTimeStatsParams) ([]database.RankingsKillTimeStatsRow, error) {
	s.params = p
	return nil, nil
}

func TestKillTimesVariantFilters(t *testing.T) {
	t.Parallel()
	store := &variantKillTimeStore{}
	q := url.Values{
		"instance_name": {"Ulduar"}, "encounter_names": {"Hodir,Freya"},
		"encounter_variants": {` { "Hodir" : "hard" } `},
		"difficulty_names":   {""}, "max_players": {"0"}, "exact_cohort": {"true"},
		"realm_names": {"Realm A,Realm B"}, "period": {"30d"},
	}
	w := httptest.NewRecorder()
	handleKillTimesWithStore(store, w, httptest.NewRequest(http.MethodGet, "/?"+q.Encode(), nil))
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	require.Equal(t, []string{"Hodir", "Freya"}, store.params.EncounterNames)
	require.Equal(t, `{"Hodir":"hard"}`, string(store.params.EncounterVariants))
	require.Equal(t, []string{""}, store.params.DifficultyNames)
	require.Equal(t, []string{"Realm A", "Realm B"}, store.params.RealmNames)
	require.True(t, store.params.ExactCohort)
	require.True(t, store.params.FilterMaxPlayers)
	require.Zero(t, store.params.MaxPlayers)
	require.Equal(t, int64(30), store.params.SinceDays)

	// A differently formatted map is the same SQL parameter identity.
	q.Set("encounter_variants", `{"Hodir":"hard"}`)
	w = httptest.NewRecorder()
	handleKillTimesWithStore(store, w, httptest.NewRequest(http.MethodGet, "/?"+q.Encode(), nil))
	require.Equal(t, http.StatusOK, w.Code)
	require.Equal(t, `{"Hodir":"hard"}`, string(store.params.EncounterVariants))
}
