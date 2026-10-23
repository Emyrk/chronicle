package servicetenant

import (
	"context"
	"testing"

	"github.com/Emyrk/chronicle/internal/services/servicecache"
	"github.com/stretchr/testify/require"
)

func TestTenantCacheInvalidationAdapter(t *testing.T) {
	t.Parallel()

	cacheSvc := servicecache.New(nil)
	calls := 0
	require.NoError(t, registerCacheInvalidator(cacheSvc, func(context.Context) error {
		calls++
		return nil
	}))

	require.NoError(t, cacheSvc.Invalidate(context.Background(), servicecache.GlobalInvalidation(servicecache.NamespaceTenantSlugs)))
	require.Equal(t, 1, calls)
}
