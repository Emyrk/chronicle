package serviceog

import (
	"context"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/internal/tenantcache"
)

// The first request after a deploy must get the real card, not the brand card:
// crawlers keep the first embed they see.
func TestLoadOGCacheWaitsOnColdCache(t *testing.T) {
	t.Parallel()
	var cache tenantcache.Cache[int]
	r := httptest.NewRequest("GET", "/leaderboards/career", nil)
	got := loadOGCache(r, nil, &cache, func(context.Context) (int, error) { return 7, nil })
	require.Equal(t, 7, got)
}

func TestLoadOGCacheTimesOut(t *testing.T) {
	t.Parallel()
	var cache tenantcache.Cache[int]
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	r := httptest.NewRequest("GET", "/leaderboards/career", nil).WithContext(ctx)
	release := make(chan struct{})
	t.Cleanup(func() { close(release) })
	got := loadOGCache(r, nil, &cache, func(context.Context) (int, error) {
		<-release
		return 7, nil
	})
	require.Zero(t, got, "a slow fetch falls back to the brand card")
}
