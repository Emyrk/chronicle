package ratingmath

import (
	"cmp"
	"context"
	"errors"
	"fmt"
	"math"
	"math/rand"
	"slices"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func pagedMasteryReplay(items []ParseObservation, pageSize int) MasteryReplay {
	sorted := slices.Clone(items)
	slices.SortFunc(sorted, func(a, b ParseObservation) int {
		if n := cmp.Compare(a.Score, b.Score); n != 0 {
			return n
		}
		if n := a.KilledAt.Compare(b.KilledAt); n != 0 {
			return n
		}
		return cmp.Compare(a.ID, b.ID)
	})
	return func(ctx context.Context, visit func(ParseObservation) error) error {
		for start := 0; start < len(sorted); start += pageSize {
			end := min(start+pageSize, len(sorted))
			for _, item := range sorted[start:end] {
				if err := visit(item); err != nil {
					return err
				}
			}
		}
		return nil
	}
}

func TestScoreMasteryStreamParity(t *testing.T) {
	t.Parallel()
	policy := candidateMasteryPolicy()
	now := time.Date(2026, 11, 2, 0, 0, 0, 0, time.UTC)
	cases := map[string][]ParseObservation{
		"empty": nil,
		"ties": {
			{Score: 10, KilledAt: now, ID: "b"}, {Score: 10, KilledAt: now, ID: "a"},
			{Score: 10, KilledAt: now.Add(-time.Hour), ID: "c"},
			{Score: 40, KilledAt: now, ID: "z"}, {Score: 40, KilledAt: now, ID: "a"},
		},
		"newest low excluded": {
			{Score: 1, KilledAt: now.Add(100 * 365 * 24 * time.Hour)},
			{Score: 20, KilledAt: now.Add(-24 * time.Hour)}, {Score: 30, KilledAt: now},
			{Score: 40, KilledAt: now.Add(-time.Hour)}, {Score: 50, KilledAt: now.Add(-time.Hour)},
		},
		"old weights underflow": {
			{Score: 10, KilledAt: now.Add(-100 * 365 * 24 * time.Hour)},
			{Score: 30, KilledAt: now.Add(-24 * time.Hour)}, {Score: 60, KilledAt: now},
			{Score: 80, KilledAt: now.Add(-time.Hour)}, {Score: 100, KilledAt: now},
		},
		"zero time": {
			{Score: 10, KilledAt: time.Time{}},
			{Score: 20, KilledAt: time.Time{}.Add(-time.Hour)},
		},
	}
	for _, n := range []int{1, 4, 5, 6, 9, 10, 11, 25} {
		items := make([]ParseObservation, n)
		for i := range items {
			items[i] = ParseObservation{Score: float64(10 * (i % 6)), KilledAt: now.Add(time.Duration(i%3) * time.Hour), ID: fmt.Sprint(n - i)}
		}
		cases[fmt.Sprintf("drop boundary %d", n)] = items
	}
	for name, items := range cases {
		for _, page := range []int{1, 2, 3, 7, 64} {
			t.Run(fmt.Sprintf("%s/page=%d", name, page), func(t *testing.T) {
				t.Parallel()
				want, err := ScoreMastery(items, policy)
				require.NoError(t, err)
				passes := 0
				replay := pagedMasteryReplay(items, page)
				got, err := ScoreMasteryStream(context.Background(), func(ctx context.Context, visit func(ParseObservation) error) error {
					passes++
					return replay(ctx, visit)
				}, policy)
				require.NoError(t, err)
				require.Equal(t, want, got)
				if len(items) == 0 {
					require.Equal(t, 1, passes)
				} else {
					require.Equal(t, 4, passes)
				}
			})
		}
	}
}

func TestScoreMasteryStreamDeterministicProperties(t *testing.T) {
	t.Parallel()
	rng := rand.New(rand.NewSource(41))
	policy := candidateMasteryPolicy()
	base := time.Date(2026, 11, 2, 0, 0, 0, 0, time.UTC)
	for trial := 0; trial < 300; trial++ {
		n := rng.Intn(100)
		items := make([]ParseObservation, n)
		for i := range items {
			items[i] = ParseObservation{
				Score:    float64(rng.Intn(11) * 10),
				KilledAt: base.Add(time.Duration(rng.Intn(400)-200) * 24 * time.Hour),
				ID:       fmt.Sprintf("%03d", rng.Intn(20)),
			}
		}
		want, err := ScoreMastery(items, policy)
		require.NoError(t, err)
		pageSize := 1 + rng.Intn(19)
		got, err := ScoreMasteryStream(context.Background(), pagedMasteryReplay(items, pageSize), policy)
		require.NoError(t, err, "trial %d", trial)
		require.Equal(t, want, got, "trial %d", trial)
	}
}

func TestScoreMasteryStreamErrors(t *testing.T) {
	t.Parallel()
	policy := candidateMasteryPolicy()
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	calls := 0
	got, err := ScoreMasteryStream(ctx, func(context.Context, func(ParseObservation) error) error {
		calls++
		return nil
	}, policy)
	require.ErrorIs(t, err, context.Canceled)
	require.Equal(t, MasteryResult{}, got)
	require.Zero(t, calls)

	boom := errors.New("page fetch failed")
	for failedPass := 1; failedPass <= 4; failedPass++ {
		passes := 0
		items := []ParseObservation{{Score: 10}, {Score: 20}, {Score: 30}, {Score: 40}, {Score: 50}}
		replay := pagedMasteryReplay(items, 2)
		got, err := ScoreMasteryStream(context.Background(), func(ctx context.Context, visit func(ParseObservation) error) error {
			passes++
			if passes == failedPass {
				return boom
			}
			return replay(ctx, visit)
		}, policy)
		require.ErrorIs(t, err, boom)
		require.Equal(t, MasteryResult{}, got)
	}
	_, err = ScoreMasteryStream(context.Background(), pagedMasteryReplay([]ParseObservation{{Score: math.NaN()}}, 1), policy)
	require.Error(t, err)
	_, err = ScoreMasteryStream(context.Background(), pagedMasteryReplay([]ParseObservation{{Score: 10}}, 1), MasteryPolicy{})
	require.Error(t, err)
	_, err = ScoreMasteryStream(context.Background(), func(_ context.Context, visit func(ParseObservation) error) error {
		if err := visit(ParseObservation{Score: 20}); err != nil {
			return err
		}
		return visit(ParseObservation{Score: 10})
	}, policy)
	require.ErrorContains(t, err, "sorted")

	_, err = ScoreMasteryStream(context.Background(), func(_ context.Context, visit func(ParseObservation) error) error {
		_ = visit(ParseObservation{Score: 20})
		_ = visit(ParseObservation{Score: 10}) // Ignores a callback error.
		return nil
	}, policy)
	require.ErrorContains(t, err, "sorted")

	midCtx, midCancel := context.WithCancel(context.Background())
	defer midCancel()
	got, err = ScoreMasteryStream(midCtx, func(_ context.Context, visit func(ParseObservation) error) error {
		if err := visit(ParseObservation{Score: 10}); err != nil {
			return err
		}
		midCancel()
		return visit(ParseObservation{Score: 20})
	}, policy)
	require.ErrorIs(t, err, context.Canceled)
	require.Equal(t, MasteryResult{}, got)

	passes := 0
	_, err = ScoreMasteryStream(context.Background(), func(ctx context.Context, visit func(ParseObservation) error) error {
		passes++
		if passes == 2 {
			return nil // Snapshot changed between passes.
		}
		return pagedMasteryReplay([]ParseObservation{{Score: 10}}, 1)(ctx, visit)
	}, policy)
	require.ErrorContains(t, err, "changed length")
}
