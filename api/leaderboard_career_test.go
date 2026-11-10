package api

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/internal/services/serviceratings"
)

func TestLeaderboardCareerRejectsRoot(t *testing.T) {
	t.Parallel()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/leaderboards-v2/career", nil)
	rec := httptest.NewRecorder()
	(&API{}).LeaderboardCareer(rec, req)
	require.Equal(t, http.StatusBadRequest, rec.Code)
	require.Empty(t, rec.Header().Get("Cache-Control"))
}

func TestRankCareerBoard(t *testing.T) {
	t.Parallel()
	f := func(v float64) *float64 { return &v }
	realm := uuid.New()
	entries := []serviceratings.CareerBoardEntry{
		{RealmID: realm, SubjectID: "a", Mastery: f(40), Peak: f(70), Renown: 10},
		{RealmID: realm, SubjectID: "b", Mastery: f(55), Peak: f(60), Renown: 300},
		{RealmID: realm, SubjectID: "c", Renown: 900}, // Renown only
	}
	ids := func(sort string) []string {
		var out []string
		for _, e := range serviceratings.RankCareerBoard(entries, sort) {
			out = append(out, e.SubjectID)
		}
		return out
	}
	require.Equal(t, []string{"b", "a"}, ids("mastery"), "characters without Mastery are left out")
	require.Equal(t, []string{"a", "b"}, ids("peak"))
	require.Equal(t, []string{"c", "b", "a"}, ids("renown"))
}
