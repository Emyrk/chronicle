package chronicle

import (
	"context"
	"errors"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/riverqueue/river"
	"github.com/stretchr/testify/require"
)

type admissionComputeFake struct {
	river.WorkerDefaults[ArgsNativeLogParse]
	called  bool
	context context.Context
}

func (w *admissionComputeFake) Work(ctx context.Context, _ *river.Job[ArgsNativeLogParse]) error {
	w.called = true
	w.context = ctx
	return nil
}

func TestHeadlessFactoryRejectsMissingDependencies(t *testing.T) {
	t.Parallel()
	_, err := NewHeadlessParseWorker(HeadlessParseOptions{})
	require.ErrorContains(t, err, "dependencies required")
}
func TestHeadlessWorkerAdmissionBeforeCompute(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		name, jobIdentity string
		deny              bool
		wantCompute       bool
	}{
		{"compatible", "a", false, true}, {"primary unavailable", "a", true, false}, {"old job", "b", false, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			compute := &admissionComputeFake{}
			releases := 0
			admissions := 0
			worker := &HeadlessParseWorker{Worker: compute, identity: "a", admit: func(ctx context.Context, _ string) (context.Context, context.CancelFunc, error) {
				admissions++
				if tc.deny {
					return nil, nil, errors.New("primary unavailable")
				}
				ctx, cancel := context.WithCancel(ctx)
				return ctx, func() { releases++; cancel() }, nil
			}}
			err := worker.Work(t.Context(), &river.Job[ArgsNativeLogParse]{Args: ArgsNativeLogParse{BinaryIdentity: tc.jobIdentity}})
			require.Equal(t, tc.wantCompute, compute.called)
			if tc.wantCompute {
				require.NoError(t, err)
				require.Equal(t, 1, admissions)
				require.Equal(t, 1, releases)
				require.ErrorIs(t, compute.context.Err(), context.Canceled)
			} else {
				require.Error(t, err)
				require.Zero(t, releases)
				if tc.jobIdentity == "a" {
					require.Equal(t, 1, admissions)
				} else {
					require.Zero(t, admissions)
				}
			}
		})
	}
}

type nativeAcquisitionStore struct {
	database.Store
	revision int64
}

func (s nativeAcquisitionStore) GetDatasetRevision(context.Context, uuid.UUID) (int64, error) {
	return s.revision, nil
}
func TestHeadlessAcquisitionRejectsInvalidOrChangedRevision(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		name             string
		id               uuid.UUID
		captured, actual int64
		want             error
	}{
		{"missing dataset", uuid.Nil, 1, 1, errInvalidDatasetRevision},
		{"missing revision", uuid.New(), 0, 1, errInvalidDatasetRevision},
		{"changed revision", uuid.New(), 1, 2, ErrDatasetRevisionChanged},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			db, release, err := acquireNativeParseGameDB(t.Context(), nil, nativeAcquisitionStore{revision: tc.actual}, tc.id, tc.captured)
			require.ErrorIs(t, err, tc.want)
			require.Nil(t, db)
			require.Nil(t, release)
		})
	}
}
