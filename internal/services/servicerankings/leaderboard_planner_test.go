package servicerankings

import (
	"context"
	"errors"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type fakeRankingsLeaderboardStore struct {
	eligibility    database.RankingsLeaderboardFastEligibilityRow
	eligibilityErr error
	fastRows       []database.RankingsLeaderboardFastRow
	fastErr        error
	slowRows       []database.RankingsLeaderboardSlowRow
	slowErr        error
	eligibilityArg database.RankingsLeaderboardFastEligibilityParams
	fastArg        database.RankingsLeaderboardFastParams
	slowArg        database.RankingsLeaderboardSlowParams
	fastCalls      int
	slowCalls      int
}

func (f *fakeRankingsLeaderboardStore) RankingsLeaderboardFastEligibility(_ context.Context, arg database.RankingsLeaderboardFastEligibilityParams) (database.RankingsLeaderboardFastEligibilityRow, error) {
	f.eligibilityArg = arg
	return f.eligibility, f.eligibilityErr
}

func (f *fakeRankingsLeaderboardStore) RankingsLeaderboardFast(_ context.Context, arg database.RankingsLeaderboardFastParams) ([]database.RankingsLeaderboardFastRow, error) {
	f.fastCalls++
	f.fastArg = arg
	return f.fastRows, f.fastErr
}

func (f *fakeRankingsLeaderboardStore) RankingsLeaderboardSlow(_ context.Context, arg database.RankingsLeaderboardSlowParams) ([]database.RankingsLeaderboardSlowRow, error) {
	f.slowCalls++
	f.slowArg = arg
	return f.slowRows, f.slowErr
}

func TestRankingsLeaderboardPlannerFallbackReasons(t *testing.T) {
	t.Parallel()

	for _, tc := range []struct {
		name        string
		params      database.RankingsLeaderboardSlowParams
		eligibility database.RankingsLeaderboardFastEligibilityRow
		fastErr     error
		wantReason  string
	}{
		{name: "since", params: database.RankingsLeaderboardSlowParams{SinceDays: 30}, wantReason: "unsupported_since"},
		{name: "missing", eligibility: database.RankingsLeaderboardFastEligibilityRow{MissingRunCount: 1, EncountersMatch: true}, wantReason: "missing_summary"},
		{name: "stale run", eligibility: database.RankingsLeaderboardFastEligibilityRow{StaleRunCount: 1, EncountersMatch: true}, wantReason: "stale_summary"},
		{name: "stale player", eligibility: database.RankingsLeaderboardFastEligibilityRow{StalePlayerCount: 1, EncountersMatch: true}, wantReason: "stale_summary"},
		{name: "dirty", eligibility: database.RankingsLeaderboardFastEligibilityRow{DirtyRunCount: 1, EncountersMatch: true}, wantReason: "dirty_summary"},
		{name: "orphan", eligibility: database.RankingsLeaderboardFastEligibilityRow{OrphanRunCount: 1, EncountersMatch: true}, wantReason: "orphan_summary"},
		{name: "nonstandard", eligibility: database.RankingsLeaderboardFastEligibilityRow{NonstandardRunCount: 1, EncountersMatch: true}, wantReason: "nonstandard_encounters"},
		{name: "subset", eligibility: database.RankingsLeaderboardFastEligibilityRow{}, wantReason: "encounter_subset"},
		{name: "eligibility error", eligibility: database.RankingsLeaderboardFastEligibilityRow{EncountersMatch: true}, wantReason: "eligibility_error"},
		{name: "fast error", eligibility: database.RankingsLeaderboardFastEligibilityRow{EncountersMatch: true}, fastErr: errors.New("fast failed"), wantReason: "fast_query_error"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			store := &fakeRankingsLeaderboardStore{
				eligibility: tc.eligibility, fastErr: tc.fastErr,
				slowRows: []database.RankingsLeaderboardSlowRow{{PlayerGuid: "slow"}},
			}
			if tc.name == "eligibility error" {
				store.eligibilityErr = errors.New("plan failed")
			}
			rows, metadata, err := rankingsLeaderboard(context.Background(), store, nil, nil, tc.params)
			require.NoError(t, err)
			assert.Equal(t, leaderboardQueryMetadata{Path: "slow", Reason: tc.wantReason}, metadata)
			assert.Equal(t, 1, store.slowCalls)
			require.Len(t, rows, 1)
			assert.Equal(t, "slow", rows[0].PlayerGuid)
		})
	}
}

func TestRankingsLeaderboardPlannerFastTenantAndRoot(t *testing.T) {
	t.Parallel()

	params := database.RankingsLeaderboardSlowParams{
		Metric: "hps", InstanceNames: []string{"Molten Core"}, EncounterNames: []string{"Lucifron"},
		DifficultyNames: []string{"Raid"}, RealmNames: []string{"Tel'Abim"},
		Class: "PRIEST", Spec: "Holy", SubSpec: "Disc", Role: "heal", HideUnknowns: true,
		FilterMaxPlayers: 40, QueryLimit: 10, QueryOffset: 5,
	}
	for _, tc := range []struct {
		name     string
		ctx      context.Context
		tenantID uuid.UUID
		filter   bool
	}{
		{name: "root", ctx: context.Background()},
		{name: "tenant", ctx: servicetenant.WithTenantID(context.Background(), uuid.New()), filter: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			store := &fakeRankingsLeaderboardStore{
				eligibility: database.RankingsLeaderboardFastEligibilityRow{SourceRunCount: 2, EncountersMatch: true},
				fastRows:    []database.RankingsLeaderboardFastRow{{PlayerGuid: "fast", TotalCount: 1}},
			}
			if tc.filter {
				tc.tenantID = servicetenant.TenantIDFromContext(tc.ctx)
			}
			rows, metadata, err := rankingsLeaderboard(tc.ctx, store, nil, nil, params)
			require.NoError(t, err)
			assert.Equal(t, leaderboardQueryMetadata{Path: "fast", Reason: "eligible"}, metadata)
			assert.Zero(t, store.slowCalls)
			require.Len(t, rows, 1)
			assert.Equal(t, "fast", rows[0].PlayerGuid)
			assert.Equal(t, tc.filter, store.eligibilityArg.FilterTenant)
			assert.Equal(t, tc.filter, store.fastArg.FilterTenant)
			assert.Equal(t, tc.tenantID, store.eligibilityArg.TenantID)
			assert.Equal(t, tc.tenantID, store.fastArg.TenantID)
			assert.Equal(t, params.EncounterNames, store.eligibilityArg.EncounterNames)
			assert.Equal(t, params.QueryLimit, store.fastArg.QueryLimit)
			assert.Equal(t, params.QueryOffset, store.fastArg.QueryOffset)
		})
	}
}
