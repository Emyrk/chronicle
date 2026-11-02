package servicerankings

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"
)

type stageStore struct {
	database.Store
	tenant, generation uuid.UUID
	cp                 database.RatingRebuildCheckpoint
	revision           int64
	runs               []uuid.UUID
	staged             []string
	failMetric         string
	advances           int
	aborted            bool
}

func (s *stageStore) InTx(_ context.Context, fn func(database.Store) error, _ *pgx.TxOptions) error {
	before, advances, aborted, cp := append([]string(nil), s.staged...), s.advances, s.aborted, s.cp
	if err := fn(s); err != nil {
		s.staged, s.advances, s.aborted, s.cp = before, advances, aborted, cp
		return err
	}
	return nil
}
func (s *stageStore) GetRatingRebuildCheckpoint(_ context.Context, p database.GetRatingRebuildCheckpointParams) (database.RatingRebuildCheckpoint, error) {
	if p.GenerationID != s.generation || p.TenantID != s.tenant {
		panic("unexpected checkpoint")
	}
	return s.cp, nil
}
func (s *stageStore) GetRatingConfigRevision(context.Context, uuid.UUID) (int64, error) {
	return s.revision, nil
}
func (s *stageStore) ListRatingStageRunsForTenant(_ context.Context, p database.ListRatingStageRunsForTenantParams) ([]uuid.UUID, error) {
	if p.AfterRunID != uuid.Nil || p.BatchSize != ratingStagePageSize {
		panic("unexpected page")
	}
	return s.runs, nil
}
func (s *stageStore) StageRatingPlayerRuns(_ context.Context, p database.StageRatingPlayerRunsParams) (int64, error) {
	if p.Metric == s.failMetric {
		return 0, errors.New("injected stage failure")
	}
	s.staged = append(s.staged, p.Metric)
	return int64(len(p.RunIds)), nil
}
func (s *stageStore) StageRatingGuildRuns(_ context.Context, p database.StageRatingGuildRunsParams) (int64, error) {
	s.staged = append(s.staged, "guild")
	return int64(len(p.RunIds)), nil
}
func (s *stageStore) AdvanceRatingRebuildCheckpoint(_ context.Context, p database.AdvanceRatingRebuildCheckpointParams) (int64, error) {
	if p.ExpectedPhase != s.cp.Phase || string(p.ExpectedCursor) != string(s.cp.Cursor) {
		return 0, nil
	}
	s.advances++
	s.cp.Cursor = p.NextCursor
	s.cp.Phase = p.NextPhase
	return 1, nil
}
func (s *stageStore) AbortRatingRebuild(context.Context, database.AbortRatingRebuildParams) (int64, error) {
	s.aborted = true
	return 1, nil
}

func newStageStore() *stageStore {
	tenant, generation := uuid.New(), uuid.New()
	return &stageStore{tenant: tenant, generation: generation, revision: 3, cp: database.RatingRebuildCheckpoint{
		TenantID: tenant, GenerationID: generation, ConfigRevision: 3, Phase: "runs", Cursor: []byte(`{}`),
		SourceCutoff: database.Timestamptz(time.Now().UTC()),
	}, runs: []uuid.UUID{uuid.New()}}
}

func TestRatingStageRunPageCheckpoint(t *testing.T) {
	t.Parallel()
	s := newStageStore()
	staged, err := stageRatingEvidencePage(t.Context(), s, s.tenant, s.generation)
	require.NoError(t, err)
	require.False(t, staged)
	require.Equal(t, []string{"dps", "hps", "guild"}, s.staged)
	require.Equal(t, 1, s.advances)
	require.Contains(t, string(s.cp.Cursor), s.runs[0].String())
}
func TestRatingStageFailureDoesNotAdvance(t *testing.T) {
	t.Parallel()
	s := newStageStore()
	s.failMetric = "hps"
	_, err := stageRatingEvidencePage(t.Context(), s, s.tenant, s.generation)
	require.ErrorContains(t, err, "injected stage failure")
	require.Zero(t, s.advances)
	require.Empty(t, s.staged)
	s.failMetric = ""
	staged, err := stageRatingEvidencePage(t.Context(), s, s.tenant, s.generation)
	require.NoError(t, err)
	require.False(t, staged)
	require.Equal(t, 1, s.advances)
	require.Equal(t, []string{"dps", "hps", "guild"}, s.staged)
}
func TestRatingStageStaleConfigurationAborts(t *testing.T) {
	t.Parallel()
	s := newStageStore()
	s.revision++
	_, err := stageRatingEvidencePage(t.Context(), s, s.tenant, s.generation)
	require.ErrorContains(t, err, "configuration changed")
	require.True(t, s.aborted)
	require.Empty(t, s.staged)
	require.Zero(t, s.advances)
}

func TestRatingStageGuildRenownEndsAtProjection(t *testing.T) {
	t.Parallel()
	s := newStageStore()
	s.cp.Phase = "guild_renown"
	require.NoError(t, finishRatingStage(t.Context(), s, s.cp))
	require.Equal(t, "players", s.cp.Phase)
	require.Equal(t, 1, s.advances)
}
