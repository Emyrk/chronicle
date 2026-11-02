package servicerankings

import (
	"context"
	"errors"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/riverqueue/river"
	"github.com/stretchr/testify/require"
)

type renownRepairStore struct {
	database.Store
	tenant        uuid.UUID
	ids           []uuid.UUID
	player, guild map[uuid.UUID]bool
	queries       []database.ListRenownBackfillRunIDsParams
}

func (s *renownRepairStore) ListRenownBackfillRunIDs(_ context.Context, arg database.ListRenownBackfillRunIDsParams) ([]uuid.UUID, error) {
	s.queries = append(s.queries, arg)
	if arg.TenantID != s.tenant {
		return nil, errors.New("wrong tenant")
	}
	var page []uuid.UUID
	for _, id := range s.ids {
		if id.String() > arg.AfterRunID.String() && len(page) < int(arg.BatchSize) {
			page = append(page, id)
		}
	}
	return page, nil
}
func (s *renownRepairStore) BackfillRenownFactsForRuns(_ context.Context, ids []uuid.UUID) (int64, error) {
	var added int64
	for _, id := range ids {
		if !s.player[id] {
			added++
			s.player[id] = true
		}
	}
	return added, nil
}
func (s *renownRepairStore) BackfillGuildRenownFactsForRuns(_ context.Context, arg database.BackfillGuildRenownFactsForRunsParams) (int64, error) {
	if arg.TenantID != s.tenant {
		return 0, errors.New("wrong tenant")
	}
	var added int64
	for _, id := range arg.RunIds {
		if !s.guild[id] {
			added++
			s.guild[id] = true
		}
	}
	return added, nil
}

func TestRenownRepairResumesPagesAndRetriesIdempotently(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	tenant := uuid.New()
	s := &renownRepairStore{tenant: tenant, ids: []uuid.UUID{
		uuid.MustParse("00000000-0000-0000-0000-000000000001"),
		uuid.MustParse("00000000-0000-0000-0000-000000000002"),
		uuid.MustParse("00000000-0000-0000-0000-000000000003"),
	}, player: make(map[uuid.UUID]bool), guild: make(map[uuid.UUID]bool)}
	var next ArgsRepairRenownFacts
	failOnce := true
	w := &WorkerRepairRenownFacts{Store: s, pageSize: 2, enqueue: func(_ context.Context, args ArgsRepairRenownFacts) error {
		if failOnce {
			failOnce = false
			return errors.New("enqueue failed")
		}
		next = args
		return nil
	}}
	start := ArgsRepairRenownFacts{TenantID: tenant}
	run := func(args ArgsRepairRenownFacts) error {
		return w.Work(ctx, &river.Job[ArgsRepairRenownFacts]{Args: args})
	}
	require.ErrorContains(t, run(start), "enqueue failed")
	require.Len(t, s.player, 2)
	require.Len(t, s.guild, 2)
	// A restarted worker retries the same page; the facts do not duplicate.
	require.NoError(t, run(start))
	require.Equal(t, s.ids[1], next.AfterRunID)
	require.Equal(t, tenant, next.TenantID)
	require.NoError(t, run(next))
	require.Len(t, s.player, 3)
	require.Len(t, s.guild, 3)
	require.Equal(t, s.ids[1], s.queries[2].AfterRunID)
	require.Len(t, s.queries, 3, "short final page does not enqueue a successor")
}

func TestRenownRepairExactPageBoundaryTerminates(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	id := uuid.New()
	s := &renownRepairStore{ids: []uuid.UUID{id}, player: make(map[uuid.UUID]bool), guild: make(map[uuid.UUID]bool)}
	var next ArgsRepairRenownFacts
	w := &WorkerRepairRenownFacts{Store: s, pageSize: 1, enqueue: func(_ context.Context, args ArgsRepairRenownFacts) error { next = args; return nil }}
	require.NoError(t, w.Work(ctx, &river.Job[ArgsRepairRenownFacts]{}))
	require.Equal(t, id, next.AfterRunID)
	require.NoError(t, w.Work(ctx, &river.Job[ArgsRepairRenownFacts]{Args: next}))
	require.Len(t, s.queries, 2)
	require.Len(t, s.player, 1)
}
