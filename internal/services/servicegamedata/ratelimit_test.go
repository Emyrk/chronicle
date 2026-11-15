package servicegamedata

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"golang.org/x/time/rate"

	"github.com/Emyrk/chronicle/internal/clientip"
)

func TestIPLimiterBuckets(t *testing.T) {
	t.Parallel()

	newHandler := func(resolver clientip.Resolver) http.Handler {
		// One token, effectively never refilled: the second request in a bucket is limited.
		return newIPLimiter(rate.Every(time.Hour), 1, resolver).middleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusNoContent)
		}))
	}
	do := func(h http.Handler, remote string, headers map[string]string) int {
		req := httptest.NewRequest(http.MethodGet, "/search/items", nil)
		req.RemoteAddr = remote
		for k, v := range headers {
			req.Header.Set(k, v)
		}
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec.Code
	}

	t.Run("ipv4 is bucketed per address", func(t *testing.T) {
		t.Parallel()
		h := newHandler(clientip.Resolver{})
		require.Equal(t, http.StatusNoContent, do(h, "192.0.2.1:1", nil))
		require.Equal(t, http.StatusTooManyRequests, do(h, "192.0.2.1:2", nil))
		require.Equal(t, http.StatusNoContent, do(h, "192.0.2.2:1", nil))
	})
	t.Run("ipv6 is bucketed per /64", func(t *testing.T) {
		t.Parallel()
		h := newHandler(clientip.Resolver{})
		require.Equal(t, http.StatusNoContent, do(h, "[2001:db8:1:2::1]:1", nil))
		require.Equal(t, http.StatusTooManyRequests, do(h, "[2001:db8:1:2:ffff::9]:1", nil))
		require.Equal(t, http.StatusNoContent, do(h, "[2001:db8:1:3::1]:1", nil))
	})
	t.Run("a forged forwarded-for does not change the bucket behind cloudflare", func(t *testing.T) {
		t.Parallel()
		h := newHandler(clientip.Resolver{TrustCloudflare: true})
		cf := map[string]string{"CF-Connecting-IP": "203.0.113.7"}
		require.Equal(t, http.StatusNoContent, do(h, "10.0.0.1:1", map[string]string{"CF-Connecting-IP": cf["CF-Connecting-IP"], "X-Forwarded-For": "1.1.1.1"}))
		require.Equal(t, http.StatusTooManyRequests, do(h, "10.0.0.1:1", map[string]string{"CF-Connecting-IP": cf["CF-Connecting-IP"], "X-Forwarded-For": "2.2.2.2"}))
	})
}
