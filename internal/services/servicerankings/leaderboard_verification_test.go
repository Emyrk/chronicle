package servicerankings

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chronauth/claims"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database"
	"github.com/authzed/gochugaru/consistency"
	"github.com/authzed/gochugaru/rel"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type fakeRankingsLeaderboardAuthorizer struct {
	allowed      bool
	err          error
	calls        int
	relationship rel.Relationship
}

func (f *fakeRankingsLeaderboardAuthorizer) CheckOne(_ context.Context, _ *consistency.Strategy, relationship rel.Interface) (bool, error) {
	f.calls++
	f.relationship = relationship.Relationship()
	return f.allowed, f.err
}

func leaderboardTestRow(playerName string) database.RankingsLeaderboardSlowRow {
	return database.RankingsLeaderboardSlowRow{
		EncounterName:  "Lucifron, Magmadar",
		InstanceName:   "Molten Core",
		PlayerGuid:     "Player-00000001",
		PlayerName:     playerName,
		PlayerClass:    "DEATH_KNIGHT",
		PlayerSpec:     "Frost",
		PlayerSubSpec:  "Two Handed",
		PlayerRole:     "dps",
		PlayerLevel:    60,
		DifficultyName: "Raid",
		MaxPlayers:     40,
		RealmID:        uuid.MustParse("11111111-1111-1111-1111-111111111111"),
		RealmName:      "Tel'Abim",
		GuildName:      "Example Guild",
		DamageDone:     120000,
		HealingDone:    500,
		AbsorbedDone:   100,
		DurationSecs:   120,
		Dps:            1000,
		Hps:            5,
		AvgIlvl:        64,
		TalentLayout:   "123}456}789",
		LogHashedSlug:  "example-log",
		KilledAt:       pgtype.Timestamptz{Time: time.Date(2026, time.September, 11, 12, 0, 0, 0, time.UTC), Valid: true},
		TotalCount:     1,
	}
}

func authenticatedLeaderboardContext() context.Context {
	return chronauth.WithClaims(context.Background(), &claims.Claims{Subject: uuid.New()})
}

func TestHandleLeaderboardVerificationAuthorization(t *testing.T) {
	t.Parallel()

	for _, tc := range []struct {
		name       string
		ctx        context.Context
		authorizer *fakeRankingsLeaderboardAuthorizer
		wantStatus int
	}{
		{name: "unauthenticated", ctx: context.Background(), authorizer: &fakeRankingsLeaderboardAuthorizer{allowed: true}, wantStatus: http.StatusUnauthorized},
		{name: "forbidden", ctx: authenticatedLeaderboardContext(), authorizer: &fakeRankingsLeaderboardAuthorizer{}, wantStatus: http.StatusForbidden},
		{name: "authorization error", ctx: authenticatedLeaderboardContext(), authorizer: &fakeRankingsLeaderboardAuthorizer{err: errors.New("spicedb unavailable")}, wantStatus: http.StatusInternalServerError},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			store := &fakeRankingsLeaderboardStore{}
			req := httptest.NewRequest(http.MethodGet, "/leaderboard?verify=true", nil).WithContext(tc.ctx)
			rec := httptest.NewRecorder()

			handleLeaderboardWithDependencies(store, tc.authorizer, nil, nil, false, rec, req)

			assert.Equal(t, tc.wantStatus, rec.Code)
			assert.Equal(t, "private, no-store", rec.Header().Get("Cache-Control"))
			assert.Zero(t, store.fastCalls)
			assert.Zero(t, store.slowCalls)
			if tc.name == "unauthenticated" {
				assert.Zero(t, tc.authorizer.calls)
			} else {
				assert.Equal(t, 1, tc.authorizer.calls)
			}
		})
	}
}

func TestHandleLeaderboardVerificationMatchUsesIdenticalFilters(t *testing.T) {
	t.Parallel()

	slowRow := leaderboardTestRow("Example")
	store := &fakeRankingsLeaderboardStore{
		eligibility: database.RankingsLeaderboardFastEligibilityRow{EncountersMatch: true},
		fastRows:    []database.RankingsLeaderboardFastRow{database.RankingsLeaderboardFastRow(slowRow)},
		slowRows:    []database.RankingsLeaderboardSlowRow{slowRow},
	}
	authorizer := &fakeRankingsLeaderboardAuthorizer{allowed: true}
	req := httptest.NewRequest(http.MethodGet, "/leaderboard?verify=true&instance_names=Molten+Core&encounter_names=Lucifron,Magmadar&difficulty_names=Raid&realm_names=Tel%27Abim&class=DEATHKNIGHT&spec=Frost&sub_spec=Two+Handed&role=dps&hide_unknowns=true&metric=hps&max_players=40&limit=10&offset=5", nil).
		WithContext(authenticatedLeaderboardContext())
	rec := httptest.NewRecorder()

	handleLeaderboardWithDependencies(store, authorizer, nil, nil, false, rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	assert.Equal(t, "private, no-store", rec.Header().Get("Cache-Control"))
	var response chroniclesdk.RankingsLeaderboardResponse
	require.NoError(t, json.NewDecoder(rec.Body).Decode(&response))
	require.NotNil(t, response.Verification)
	assert.Equal(t, "match", response.Verification.Status)
	assert.Equal(t, "fast", response.Verification.FastQueryPath)
	assert.Zero(t, response.Verification.DifferenceCount)
	assert.Empty(t, response.Verification.Differences)
	assert.Equal(t, "chronicle", authorizer.relationship.ResourceType)
	assert.Equal(t, "chronicle", authorizer.relationship.ResourceID)
	assert.Equal(t, "admin_speedrun_requirements", authorizer.relationship.Permission())
	assert.Equal(t, int64(1), response.TotalCount)
	require.Len(t, response.Entries, 1)
	assert.Equal(t, "DEATHKNIGHT", response.Entries[0].PlayerClass)
	assert.Equal(t, 1, store.fastCalls)
	assert.Equal(t, 1, store.slowCalls)
	assert.Equal(t, store.slowArg.InstanceNames, store.fastArg.InstanceNames)
	assert.Equal(t, store.slowArg.RealmNames, store.fastArg.RealmNames)
	assert.Equal(t, store.slowArg.DifficultyNames, store.fastArg.DifficultyNames)
	assert.Equal(t, store.slowArg.Class, store.fastArg.Class)
	assert.Equal(t, store.slowArg.Spec, store.fastArg.Spec)
	assert.Equal(t, store.slowArg.SubSpec, store.fastArg.SubSpec)
	assert.Equal(t, store.slowArg.Role, store.fastArg.Role)
	assert.Equal(t, store.slowArg.HideUnknowns, store.fastArg.HideUnknowns)
	assert.Equal(t, store.slowArg.Metric, store.fastArg.Metric)
	assert.Equal(t, store.slowArg.FilterMaxPlayers, store.fastArg.FilterMaxPlayers)
	assert.Equal(t, store.slowArg.QueryLimit, store.fastArg.QueryLimit)
	assert.Equal(t, store.slowArg.QueryOffset, store.fastArg.QueryOffset)
}

func TestVerifyRankingsLeaderboardMismatchIsBoundedAndLogged(t *testing.T) {
	t.Parallel()

	fastRows := make([]database.RankingsLeaderboardFastRow, 25)
	slowRows := make([]database.RankingsLeaderboardSlowRow, 25)
	for i := range slowRows {
		slowRows[i] = leaderboardTestRow("Slow")
		slowRows[i].TotalCount = 25
		fastRow := leaderboardTestRow("Fast")
		fastRow.TotalCount = 25
		fastRows[i] = database.RankingsLeaderboardFastRow(fastRow)
	}
	var logs bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&logs, nil))
	store := &fakeRankingsLeaderboardStore{
		eligibility: database.RankingsLeaderboardFastEligibilityRow{EncountersMatch: true},
		fastRows:    fastRows,
		slowRows:    slowRows,
	}

	response := verifyRankingsLeaderboard(context.Background(), store, logger, nil, database.RankingsLeaderboardSlowParams{})

	require.NotNil(t, response.Verification)
	assert.Equal(t, "mismatch", response.Verification.Status)
	assert.Equal(t, 25, response.Verification.DifferenceCount)
	require.Len(t, response.Verification.Differences, maxLeaderboardVerificationDifferences)
	assert.Equal(t, 1, response.Verification.Differences[0].EntryIndex)
	assert.Equal(t, "player_name", response.Verification.Differences[0].Field)
	assert.Contains(t, logs.String(), "rankings leaderboard verification mismatch")
	assert.Contains(t, logs.String(), "difference_count")
	assert.Contains(t, logs.String(), "fast_duration")
	assert.Contains(t, logs.String(), "slow_duration")
}

func TestCompareRankingsLeaderboardsFloatTolerance(t *testing.T) {
	t.Parallel()

	fastRow := leaderboardTestRow("Example")
	slowRow := fastRow
	slowRow.DurationSecs += 0.00001
	slowRow.Dps += 0.0005
	slowRow.Hps += 0.000001
	fast := rankingsLeaderboardResponse([]database.RankingsLeaderboardSlowRow{fastRow})
	slow := rankingsLeaderboardResponse([]database.RankingsLeaderboardSlowRow{slowRow})

	count, differences := compareRankingsLeaderboards(fast, slow)

	assert.Zero(t, count)
	assert.Empty(t, differences)
}

func TestVerifyRankingsLeaderboardStatuses(t *testing.T) {
	t.Parallel()

	row := leaderboardTestRow("Example")
	for _, tc := range []struct {
		name       string
		store      *fakeRankingsLeaderboardStore
		wantStatus string
		wantPlayer string
		wantPath   string
		wantReason string
	}{
		{
			name: "fast unavailable",
			store: &fakeRankingsLeaderboardStore{
				eligibility: database.RankingsLeaderboardFastEligibilityRow{MissingRunCount: 1, EncountersMatch: true},
				slowRows:    []database.RankingsLeaderboardSlowRow{row},
			},
			wantStatus: "fast_unavailable", wantPlayer: "Example", wantPath: "slow", wantReason: "missing_summary",
		},
		{
			name: "fast error",
			store: &fakeRankingsLeaderboardStore{
				eligibility: database.RankingsLeaderboardFastEligibilityRow{EncountersMatch: true},
				fastErr:     errors.New("fast failed"),
				slowRows:    []database.RankingsLeaderboardSlowRow{row},
			},
			wantStatus: "fast_error", wantPlayer: "Example", wantPath: "fast", wantReason: "fast_query_error",
		},
		{
			name: "slow error",
			store: &fakeRankingsLeaderboardStore{
				eligibility: database.RankingsLeaderboardFastEligibilityRow{EncountersMatch: true},
				fastRows:    []database.RankingsLeaderboardFastRow{database.RankingsLeaderboardFastRow(row)},
				slowErr:     errors.New("slow failed"),
			},
			wantStatus: "slow_error", wantPlayer: "Example", wantPath: "fast",
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			response := verifyRankingsLeaderboard(context.Background(), tc.store, nil, nil, database.RankingsLeaderboardSlowParams{})
			require.NotNil(t, response.Verification)
			assert.Equal(t, tc.wantStatus, response.Verification.Status)
			assert.Equal(t, tc.wantPath, response.Verification.FastQueryPath)
			assert.Equal(t, tc.wantReason, response.Verification.FallbackReason)
			require.Len(t, response.Entries, 1)
			assert.Equal(t, tc.wantPlayer, response.Entries[0].PlayerName)
			assert.Equal(t, 1, tc.store.slowCalls)
		})
	}
}

func TestNormalLeaderboardDoesNotAuthorizeOrDisableCaching(t *testing.T) {
	t.Parallel()

	row := leaderboardTestRow("Example")
	store := &fakeRankingsLeaderboardStore{
		eligibility: database.RankingsLeaderboardFastEligibilityRow{EncountersMatch: true},
		fastRows:    []database.RankingsLeaderboardFastRow{database.RankingsLeaderboardFastRow(row)},
	}
	authorizer := &fakeRankingsLeaderboardAuthorizer{err: errors.New("must not be called")}
	req := httptest.NewRequest(http.MethodGet, "/leaderboard", nil)
	rec := httptest.NewRecorder()

	handleLeaderboardWithDependencies(store, authorizer, nil, nil, true, rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)
	assert.Empty(t, rec.Header().Get("Cache-Control"))
	assert.Zero(t, authorizer.calls)
	assert.Equal(t, 1, store.fastCalls)
	assert.Zero(t, store.slowCalls)
	assert.False(t, strings.Contains(rec.Body.String(), "verification"))
}
