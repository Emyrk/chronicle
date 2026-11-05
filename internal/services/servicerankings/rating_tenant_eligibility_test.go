package servicerankings

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

type ratingEligibilityStoreStub struct {
	enabled bool
	err     error
	calls   int
}

func (s *ratingEligibilityStoreStub) TenantRatingsEnabled(context.Context, uuid.UUID) (bool, error) {
	s.calls++
	return s.enabled, s.err
}

func TestSkipDisabledRootRatings(t *testing.T) {
	t.Parallel()
	ctx := context.Background()

	t.Run("named tenant never consults root setting", func(t *testing.T) {
		t.Parallel()
		store := &ratingEligibilityStoreStub{}
		skip, err := skipDisabledRootRatings(ctx, store, uuid.New())
		require.NoError(t, err)
		require.False(t, skip)
		require.Zero(t, store.calls)
	})

	t.Run("enabled root runs", func(t *testing.T) {
		t.Parallel()
		store := &ratingEligibilityStoreStub{enabled: true}
		skip, err := skipDisabledRootRatings(ctx, store, uuid.Nil)
		require.NoError(t, err)
		require.False(t, skip)
		require.Equal(t, 1, store.calls)
	})

	t.Run("disabled root skips", func(t *testing.T) {
		t.Parallel()
		store := &ratingEligibilityStoreStub{enabled: false}
		skip, err := skipDisabledRootRatings(ctx, store, uuid.Nil)
		require.NoError(t, err)
		require.True(t, skip)
	})

	t.Run("setting lookup error fails closed", func(t *testing.T) {
		t.Parallel()
		store := &ratingEligibilityStoreStub{err: errors.New("database unavailable")}
		skip, err := skipDisabledRootRatings(ctx, store, uuid.Nil)
		require.ErrorContains(t, err, "check root tenant rating eligibility")
		require.False(t, skip)
	})
}
