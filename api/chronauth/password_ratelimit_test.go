package chronauth

import (
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/internal/clientip"
)

func TestPasswordLoginRateLimitBuckets(t *testing.T) {
	t.Parallel()

	login := func(s *Service, remote string, headers map[string]string) int {
		req := httptest.NewRequest(http.MethodPost, "/auth/password/login", strings.NewReader("not json"))
		req.RemoteAddr = remote
		for k, v := range headers {
			req.Header.Set(k, v)
		}
		rec := httptest.NewRecorder()
		s.PasswordLogin(rec, req)
		return rec.Code
	}
	newService := func(resolver clientip.Resolver) *Service {
		return &Service{clientIP: resolver, logger: slog.Default(), loginAttempts: map[string]time.Time{}}
	}

	t.Run("ipv6 shares a bucket per /64, ipv4 per address", func(t *testing.T) {
		t.Parallel()
		s := newService(clientip.Resolver{})
		require.NotEqual(t, http.StatusTooManyRequests, login(s, "[2001:db8:1:2::1]:1", nil))
		require.Equal(t, http.StatusTooManyRequests, login(s, "[2001:db8:1:2:ffff::9]:1", nil))
		require.NotEqual(t, http.StatusTooManyRequests, login(s, "[2001:db8:1:3::1]:1", nil))
		require.NotEqual(t, http.StatusTooManyRequests, login(s, "192.0.2.1:1", nil))
		require.Equal(t, http.StatusTooManyRequests, login(s, "192.0.2.1:2", nil))
		require.NotEqual(t, http.StatusTooManyRequests, login(s, "192.0.2.2:1", nil))
	})
	t.Run("a forged forwarded-for does not change the bucket behind cloudflare", func(t *testing.T) {
		t.Parallel()
		s := newService(clientip.Resolver{TrustCloudflare: true})
		require.NotEqual(t, http.StatusTooManyRequests, login(s, "10.0.0.1:1", map[string]string{"CF-Connecting-IP": "203.0.113.7", "X-Forwarded-For": "1.1.1.1"}))
		require.Equal(t, http.StatusTooManyRequests, login(s, "10.0.0.1:1", map[string]string{"CF-Connecting-IP": "203.0.113.7", "X-Forwarded-For": "2.2.2.2"}))
	})
	t.Run("without the flag the forwarded-for hop still picks the bucket", func(t *testing.T) {
		t.Parallel()
		s := newService(clientip.Resolver{})
		require.NotEqual(t, http.StatusTooManyRequests, login(s, "10.0.0.1:1", map[string]string{"CF-Connecting-IP": "203.0.113.7", "X-Forwarded-For": "1.1.1.1"}))
		require.NotEqual(t, http.StatusTooManyRequests, login(s, "10.0.0.1:1", map[string]string{"CF-Connecting-IP": "203.0.113.7", "X-Forwarded-For": "2.2.2.2"}))
	})
}
