package serviceinstancesearch

import (
	"errors"
	"testing"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/instancesearch"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/stretchr/testify/require"
)

func TestSearchGoCaller(t *testing.T) {
	t.Parallel()
	db, _ := dbtestutil.NewDB(t)
	s := New(testutil.Logger(t), db, prometheus.NewRegistry(), nil)
	ctx := testutil.Context(t, testutil.WaitMedium)
	caller := Caller{UserID: uuid.New(), TenantID: uuid.New()}
	q := chroniclesdk.InstanceSearchQuery{}
	page, result := s.Search(ctx, caller, q)
	require.NoError(t, result.Err)
	require.NotNil(t, page.Results)
	require.Equal(t, 1, result.Cost)
	require.InDelta(t, 99, result.Status.Remaining, 0.1)
	status, _, err := s.Peek(ctx, caller)
	require.NoError(t, err)
	require.InDelta(t, 99, status.Remaining, 1)
	_, result = s.Search(servicetenant.AdminBypass(ctx), caller, q)
	require.Error(t, result.Err)
	require.Equal(t, 0, result.Cost)
	// The rejected bypass must not charge the shared bucket.
	status, _, err = s.Peek(ctx, caller)
	require.NoError(t, err)
	require.InDelta(t, 99, status.Remaining, 1)
	_, result = s.Explain(ctx, caller, q, uuid.New())
	require.ErrorIs(t, result.Err, instancesearch.ErrNotFound)
	require.Equal(t, 1, result.Cost)
	require.False(t, errors.Is(result.Err, ErrInvalid))
}
