package ratingmath

import (
	"context"
	"errors"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
)

type fakeRenownBackfill struct {
	runs   []uuid.UUID
	failed uuid.UUID
	seen   []uuid.UUID
}

func (f *fakeRenownBackfill) ListRenownBackfillRunIDs(_ context.Context, arg database.ListRenownBackfillRunIDsParams) ([]uuid.UUID, error) {
	var result []uuid.UUID
	for _, id := range f.runs {
		if id.String() > arg.AfterRunID.String() {
			result = append(result, id)
			if len(result) == int(arg.BatchSize) {
				break
			}
		}
	}
	return result, nil
}

func (f *fakeRenownBackfill) BackfillRenownFactsForRun(_ context.Context, id uuid.UUID) (int64, error) {
	if id == f.failed {
		return 0, errors.New("transient failure")
	}
	f.seen = append(f.seen, id)
	return 2, nil
}

func TestBackfillRenownFactsBoundedAndResumable(t *testing.T) {
	t.Parallel()
	runs := []uuid.UUID{
		uuid.MustParse("00000000-0000-0000-0000-000000000001"),
		uuid.MustParse("00000000-0000-0000-0000-000000000002"),
		uuid.MustParse("00000000-0000-0000-0000-000000000003"),
	}
	store := &fakeRenownBackfill{runs: runs, failed: runs[1]}
	tenant := uuid.New()
	progress, err := BackfillRenownFacts(t.Context(), store, tenant, uuid.Nil, 2, 1)
	if err == nil || progress.AfterRunID != runs[0] || progress.RunsScanned != 1 || progress.FactsCreated != 2 {
		t.Fatalf("expected checkpoint after first run, got %+v, %v", progress, err)
	}
	store.failed = uuid.Nil
	progress, err = BackfillRenownFacts(t.Context(), store, tenant, progress.AfterRunID, 2, 1)
	if err != nil || progress.AfterRunID != runs[2] || progress.RunsScanned != 2 || progress.Done {
		t.Fatalf("expected bounded page ending at third run, got %+v, %v", progress, err)
	}
	progress, err = BackfillRenownFacts(t.Context(), store, tenant, progress.AfterRunID, 2, 1)
	if err != nil || !progress.Done || progress.RunsScanned != 0 {
		t.Fatalf("expected completed scan, got %+v, %v", progress, err)
	}
}

func TestBackfillRenownFactsRequiresBounds(t *testing.T) {
	t.Parallel()
	if _, err := BackfillRenownFacts(t.Context(), &fakeRenownBackfill{}, uuid.Nil, uuid.Nil, 0, 0); err == nil {
		t.Fatal("expected a validation error")
	}
}
