package ratingmath

import (
	"context"
	"errors"
	"fmt"
	"math"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

type masteryFakeStore struct {
	database.Store
	checkpoint database.RatingRebuildCheckpoint
	state      database.RatingMasteryAccumulator
	player     []database.ListRatingMasteryPlayerPageRow
	guild      []database.ListRatingMasteryGuildPageRow
	pages      int
	failCAS    bool
	writes     int
}

func (f *masteryFakeStore) InTx(_ context.Context, run func(database.Store) error, _ *pgx.TxOptions) error {
	return run(f)
}
func (f *masteryFakeStore) GetRatingRebuildCheckpoint(context.Context, database.GetRatingRebuildCheckpointParams) (database.RatingRebuildCheckpoint, error) {
	return f.checkpoint, nil
}
func (f *masteryFakeStore) InitRatingMasteryAccumulator(_ context.Context, key database.InitRatingMasteryAccumulatorParams) error {
	if f.state.Pass == "" {
		f.state.Pass = "count"
		f.state.GenerationID = key.GenerationID
	}
	return nil
}
func (f *masteryFakeStore) GetRatingMasteryAccumulator(context.Context, database.GetRatingMasteryAccumulatorParams) (database.RatingMasteryAccumulator, error) {
	return f.state, nil
}
func (f *masteryFakeStore) ListRatingMasteryPlayerPage(_ context.Context, p database.ListRatingMasteryPlayerPageParams) ([]database.ListRatingMasteryPlayerPageRow, error) {
	f.pages++
	if p.BatchSize > 200 {
		panic("unbounded page")
	}
	start := 0
	if !p.FirstPage {
		for start < len(f.player) {
			x := f.player[start]
			if x.LockedParse.Float64 > p.AfterScore || x.LockedParse.Float64 == p.AfterScore && (x.KilledAt.Time.After(p.AfterKilledAt.Time) || x.KilledAt.Time.Equal(p.AfterKilledAt.Time) && x.RunID.String() > p.AfterRunID.String()) {
				break
			}
			start++
		}
	}
	end := min(start+int(p.BatchSize), len(f.player))
	return f.player[start:end], nil
}
func (f *masteryFakeStore) ListRatingMasteryGuildPage(_ context.Context, p database.ListRatingMasteryGuildPageParams) ([]database.ListRatingMasteryGuildPageRow, error) {
	if !p.GuildID.Valid || p.BatchSize > 200 {
		panic("bad guild page")
	}
	f.pages++
	start := 0
	if !p.FirstPage {
		for start < len(f.guild) {
			x := f.guild[start]
			if x.LockedParse.Float64 > p.AfterScore || x.LockedParse.Float64 == p.AfterScore && (x.KilledAt.Time.After(p.AfterKilledAt.Time) || x.KilledAt.Time.Equal(p.AfterKilledAt.Time) && x.RunID.String() > p.AfterRunID.String()) {
				break
			}
			start++
		}
	}
	end := min(start+int(p.BatchSize), len(f.guild))
	return f.guild[start:end], nil
}
func (f *masteryFakeStore) AdvanceRatingMasteryAccumulator(_ context.Context, p database.AdvanceRatingMasteryAccumulatorParams) (int64, error) {
	if f.state.Pass != p.ExpectedPass || f.state.Version != p.ExpectedVersion {
		return 0, nil
	}
	f.state.Pass = p.NextPass
	f.state.Version++
	f.state.CursorScore = p.NextCursorScore
	f.state.CursorKilledAt = p.NextCursorKilledAt
	f.state.CursorRunID = p.NextCursorRunID
	f.state.Position = p.NextPosition
	f.state.EligibleKills = p.NextEligibleKills
	f.state.ExcludedKills = p.NextExcludedKills
	f.state.Best = p.NextBest
	f.state.LatestRetainedAt = p.NextLatestRetainedAt
	f.state.TotalWeight = p.NextTotalWeight
	f.state.CumulativeWeight = p.NextCumulativeWeight
	f.state.FloorScore = p.NextFloorScore
	f.state.FormScore = p.NextFormScore
	f.state.LastRetainedScore = p.NextLastRetainedScore
	return 1, nil
}
func (f *masteryFakeStore) AdvanceRatingRebuildCheckpoint(_ context.Context, p database.AdvanceRatingRebuildCheckpointParams) (int64, error) {
	if f.failCAS || f.checkpoint.Phase != p.ExpectedPhase || string(f.checkpoint.Cursor) != string(p.ExpectedCursor) {
		return 0, nil
	}
	f.checkpoint.Cursor = p.NextCursor
	f.checkpoint.Phase = p.NextPhase
	return 1, nil
}

func TestAdvanceMasterySubjectExactPagedReplay(t *testing.T) {
	t.Parallel()
	for _, kind := range []string{"player", "guild"} {
		t.Run(kind, func(t *testing.T) {
			t.Parallel()
			asOf := time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC)
			subjectID := "player"
			metric := "dps"
			class := "MAGE"
			if kind == "guild" {
				subjectID = uuid.NewString()
				metric = "none"
				class = ""
			}
			key := MasterySubject{GenerationID: uuid.New(), TenantID: uuid.New(), SubjectKind: kind, RealmID: uuid.New(), SubjectID: subjectID, InstanceName: "Raid", EncounterName: "Boss", DifficultyName: "Normal", MaxPlayers: 40, PlayerClass: class, PerformanceMetric: metric, WindowKind: "period"}
			policy := database.RatingGroupPolicy{PeriodDays: 13, HalfLifeDays: 1, BestWeight: .4, FormWeight: .4, FloorWeight: .2, FullRankKills: 10, RankOneWeight: .6}
			fake := &masteryFakeStore{checkpoint: database.RatingRebuildCheckpoint{Phase: "mastery_pending", Cursor: []byte(`{"subject":1}`), AsOf: database.Timestamptz(asOf)}}
			observations := make([]ParseObservation, 0, 215)
			for i := 0; i < 215; i++ {
				killed := asOf.Add(-time.Duration(215-i) * time.Hour)
				if i == 0 {
					killed = asOf
				} // excluded newest kill must not anchor recency
				id := uuid.MustParse(fmt.Sprintf("00000000-0000-0000-0000-%012x", i+1))
				score := float64(i / 5)
				observations = append(observations, ParseObservation{Score: score, KilledAt: killed, ID: id.String()})
				row := database.ListRatingMasteryPlayerPageRow{LockedParse: pgtype.Float8{Float64: score, Valid: true}, KilledAt: database.Timestamptz(killed), RunID: id}
				if kind == "player" {
					fake.player = append(fake.player, row)
				} else {
					fake.guild = append(fake.guild, database.ListRatingMasteryGuildPageRow(row))
				}
			}
			expected, err := ScoreMastery(observations, MasteryPolicy{HalfLife: 24 * time.Hour, BestWeight: policy.BestWeight, FormWeight: policy.FormWeight, FloorWeight: policy.FloorWeight, RankWeight: func(n int) float64 {
				if n >= 10 {
					return 1
				}
				return .6 + .4*float64(n-1)/9
			}})
			require.NoError(t, err)
			var got MasteryResult
			for step := 0; step < 20; step++ {
				result, complete, err := AdvanceMasterySubject(context.Background(), fake, key, asOf, asOf.AddDate(0, 0, -13), policy, []byte(`{"subject":1}`), []byte(`{"subject":2}`), func(_ context.Context, _ database.Store, r MasteryResult) error { fake.writes++; return nil })
				require.NoError(t, err)
				if complete {
					got = result
					break
				}
				// Recreate a caller after every step; persisted state is authoritative.
			}
			require.Equal(t, "complete", fake.state.Pass)
			require.Equal(t, 1, fake.writes)
			require.Equal(t, []byte(`{"subject":2}`), fake.checkpoint.Cursor)
			require.Greater(t, fake.pages, 4)
			require.Equal(t, expected.EligibleKills, got.EligibleKills)
			require.Equal(t, expected.ExcludedKills, got.ExcludedKills)
			for _, pair := range [][2]float64{{got.Best, expected.Best}, {got.Floor, expected.Floor}, {got.Form, expected.Form}, {got.Mastery, expected.Mastery}, {got.Ranked, expected.Ranked}, {got.Confidence, expected.Confidence}} {
				require.InDelta(t, pair[1], pair[0], 1e-9)
			}
			_, _, err = AdvanceMasterySubject(context.Background(), fake, key, asOf, asOf.AddDate(0, 0, -13), policy, []byte(`{"subject":1}`), []byte(`{"subject":2}`), func(context.Context, database.Store, MasteryResult) error { panic("replayed write") })
			require.ErrorIs(t, err, ErrMasteryCheckpointChanged)
		})
	}
}

func TestAdvanceMasterySubjectRejectsChangedStageAndPolicy(t *testing.T) {
	t.Parallel()
	asOf := time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC)
	key := MasterySubject{GenerationID: uuid.New(), TenantID: uuid.New(), SubjectKind: "player", RealmID: uuid.New(), SubjectID: "player", InstanceName: "Raid", EncounterName: "Boss", MaxPlayers: 40, PerformanceMetric: "dps", WindowKind: "period"}
	policy := database.RatingGroupPolicy{PeriodDays: 1, HalfLifeDays: 1, BestWeight: .5, FormWeight: .3, FloorWeight: .2, FullRankKills: 5, RankOneWeight: .5}
	f := &masteryFakeStore{checkpoint: database.RatingRebuildCheckpoint{Phase: "mastery_pending", Cursor: []byte(`{}`), AsOf: database.Timestamptz(asOf)}}
	for i := range 5 {
		f.player = append(f.player, database.ListRatingMasteryPlayerPageRow{LockedParse: pgtype.Float8{Float64: float64(i), Valid: true}, KilledAt: database.Timestamptz(asOf), RunID: uuid.MustParse(fmt.Sprintf("00000000-0000-0000-0000-%012x", i+1))})
	}
	write := func(context.Context, database.Store, MasteryResult) error { return nil }
	advance := func() error {
		_, _, err := AdvanceMasterySubject(context.Background(), f, key, asOf, asOf.AddDate(0, 0, -1), policy, []byte(`{}`), []byte(`{"done":true}`), write)
		return err
	}
	require.NoError(t, advance()) // count
	original := f.player
	f.player = f.player[:4]
	require.ErrorContains(t, advance(), "changed length")
	f.player = original // latest detects deletion
	require.Equal(t, "latest", f.state.Pass)
	policy.HalfLifeDays = math.NaN()
	require.ErrorContains(t, advance(), "invalid mastery")
	f.failCAS = true
	policy.HalfLifeDays = 1
	require.True(t, errors.Is(advance(), ErrMasteryCheckpointChanged))
}
