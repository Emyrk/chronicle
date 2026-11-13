package chronicle

import (
	"context"
	"fmt"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"
)

type revisionTestStore struct {
	revision  int64
	err       error
	locked    bool
	datasetID uuid.UUID
}

func (s *revisionTestStore) GetDatasetRevision(_ context.Context, id uuid.UUID) (int64, error) {
	s.datasetID = id
	return s.revision, s.err
}
func (s *revisionTestStore) LockDatasetRevision(ctx context.Context, id uuid.UUID) (int64, error) {
	s.locked = true
	return s.GetDatasetRevision(ctx, id)
}

func TestDatasetRevisionFence(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		name     string
		revision int64
		err      error
	}{
		{name: "same revision", revision: 7},
		{name: "changed revision", revision: 8},
		{name: "lower revision also rejected", revision: 6},
		{name: "missing dataset", err: pgx.ErrNoRows},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			ctx := t.Context()
			id := uuid.New()
			db := &revisionTestStore{revision: 7}
			fence, err := captureDatasetRevision(ctx, db, id)
			require.NoError(t, err)
			require.Equal(t, id, db.datasetID)
			db.revision = tc.revision
			db.err = tc.err
			for _, check := range []func() error{func() error { return fence.check(ctx, db) }, func() error { return fence.lock(ctx, db) }} {
				err = check()
				if tc.err != nil {
					require.ErrorIs(t, err, tc.err)
				} else if tc.revision != 7 {
					require.ErrorIs(t, err, ErrDatasetRevisionChanged)
				} else {
					require.NoError(t, err)
				}
			}
			require.True(t, db.locked)
		})
	}
}

func TestCaptureDatasetRevisionMissingFails(t *testing.T) {
	t.Parallel()
	_, err := captureDatasetRevision(t.Context(), &revisionTestStore{err: pgx.ErrNoRows}, uuid.New())
	require.ErrorIs(t, err, pgx.ErrNoRows)
}

func TestDatasetRevisionInvalidIdentity(t *testing.T) {
	t.Parallel()
	t.Run("missing UUID fails before reading", func(t *testing.T) {
		t.Parallel()
		// A nil reader would panic if capture attempted any database access.
		_, err := captureDatasetRevision(t.Context(), nil, uuid.Nil)
		require.ErrorIs(t, err, errInvalidDatasetRevision)
	})
	for _, revision := range []int64{0, -1} {
		t.Run(fmt.Sprintf("captured revision %d", revision), func(t *testing.T) {
			t.Parallel()
			fence, err := captureDatasetRevision(t.Context(), &revisionTestStore{revision: revision}, uuid.New())
			require.ErrorIs(t, err, errInvalidDatasetRevision)
			require.Equal(t, datasetRevisionFence{}, fence)
		})
		t.Run(fmt.Sprintf("observed revision %d", revision), func(t *testing.T) {
			t.Parallel()
			fence := datasetRevisionFence{datasetID: uuid.New(), revision: 1}
			db := &revisionTestStore{revision: revision}
			require.ErrorIs(t, fence.check(t.Context(), db), errInvalidDatasetRevision)
			require.ErrorIs(t, fence.lock(t.Context(), db), errInvalidDatasetRevision)
			require.ErrorIs(t, fence.compare(revision, nil), errInvalidDatasetRevision)
		})
	}
	for name, fence := range map[string]datasetRevisionFence{
		"zero value":        {},
		"missing UUID":      {revision: 1},
		"zero revision":     {datasetID: uuid.New()},
		"negative revision": {datasetID: uuid.New(), revision: -1},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			// Invalid fences must fail before either database interface is called,
			// including a fabricated fence whose observed revision matches its own.
			require.ErrorIs(t, fence.check(t.Context(), nil), errInvalidDatasetRevision)
			require.ErrorIs(t, fence.lock(t.Context(), nil), errInvalidDatasetRevision)
			require.ErrorIs(t, fence.compare(fence.revision, nil), errInvalidDatasetRevision)
		})
	}
}
