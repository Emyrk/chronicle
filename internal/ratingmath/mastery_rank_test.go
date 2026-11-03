package ratingmath

import (
	"context"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func TestEdgeOfMadnessMasteryRankCredit(t *testing.T) {
	t.Parallel()
	policy := database.RatingGroupPolicy{PeriodDays: 7, HalfLifeDays: 1, BestWeight: .4, FormWeight: .4, FloorWeight: .2, FullRankKills: 5, RankOneWeight: .6}
	asOf := time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC)
	observation := ParseObservation{Score: 80, KilledAt: asOf.Add(-time.Hour), ID: uuid.MustParse("00000000-0000-0000-0000-000000000001").String()}
	for _, tc := range []struct {
		instance, boss string
		wantRank       float64
	}{
		{"Zul'Gurub", "Gri'lek", 80},
		{"Zul'Gurub", "Hazza'rah", 80},
		{"Zul'Gurub", "Renataki", 80},
		{"Zul'Gurub", "Wushoolay", 80},
		{"Zul'Gurub", "High Priestess Jeklik", 48},
		{"Molten Core", "Gri'lek", 48},
	} {
		t.Run(tc.instance+"/"+tc.boss, func(t *testing.T) {
			t.Parallel()
			// Both direct rebuilds use ScoreMastery with this rank-credit policy.
			direct, err := ScoreMastery([]ParseObservation{observation}, MasteryPolicy{
				BestWeight: policy.BestWeight, FormWeight: policy.FormWeight,
				FloorWeight: policy.FloorWeight, RankWeight: masteryRankWeight(policy, tc.instance, tc.boss),
			})
			require.NoError(t, err)
			require.Equal(t, 80.0, direct.Mastery)
			require.InDelta(t, tc.wantRank, direct.Ranked, 1e-9)
			require.Equal(t, 1, direct.EligibleKills)

			// The staged writer must agree for both subject kinds and windows.
			for _, kind := range []string{"player", "guild"} {
				for _, window := range []string{"all_time", "period"} {
					t.Run(kind+"/"+window, func(t *testing.T) {
						t.Parallel()
						subjectID, metric := "player", "dps"
						if kind == "guild" {
							subjectID, metric = "00000000-0000-0000-0000-000000000002", "none"
						}
						subject := MasterySubject{GenerationID: uuid.MustParse("00000000-0000-0000-0000-000000000003"), TenantID: uuid.MustParse("00000000-0000-0000-0000-000000000004"), SubjectKind: kind,
							RealmID: uuid.MustParse("00000000-0000-0000-0000-000000000005"), SubjectID: subjectID, InstanceName: tc.instance, EncounterName: tc.boss,
							PerformanceMetric: metric, WindowKind: window}
						fake := &masteryFakeStore{checkpoint: database.RatingRebuildCheckpoint{Phase: "mastery_pending", Cursor: []byte(`{}`), AsOf: database.Timestamptz(asOf)}}
						row := database.ListRatingMasteryPlayerPageRow{LockedParse: pgtype.Float8{Float64: observation.Score, Valid: true}, KilledAt: database.Timestamptz(observation.KilledAt), RunID: uuid.MustParse(observation.ID)}
						if kind == "player" {
							fake.player = []database.ListRatingMasteryPlayerPageRow{row}
						} else {
							fake.guild = []database.ListRatingMasteryGuildPageRow{database.ListRatingMasteryGuildPageRow(row)}
						}
						start := asOf.AddDate(0, 0, -7)
						if window == "all_time" {
							start = time.Date(2, 1, 1, 0, 0, 0, 0, time.UTC)
						}
						var staged MasteryResult
						for step := 0; step < 4; step++ {
							result, complete, err := AdvanceMasterySubject(context.Background(), fake, subject, asOf, start, policy, []byte(`{}`), []byte(`{"done":true}`), func(_ context.Context, _ database.Store, got MasteryResult) error {
								staged = got
								return nil
							})
							require.NoError(t, err)
							if complete {
								require.Equal(t, staged, result)
								break
							}
						}
						require.Equal(t, "complete", fake.state.Pass)
						require.Equal(t, direct, staged)
					})
				}
			}
		})
	}
}
