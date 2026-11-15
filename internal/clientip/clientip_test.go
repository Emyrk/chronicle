package clientip_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/internal/clientip"
)

func TestResolverIP(t *testing.T) {
	t.Parallel()

	request := func(remote string, headers map[string]string) *http.Request {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.RemoteAddr = remote
		for k, v := range headers {
			req.Header.Set(k, v)
		}
		return req
	}

	tests := []struct {
		name     string
		resolver clientip.Resolver
		remote   string
		headers  map[string]string
		want     string
	}{
		{
			name:     "cloudflare header wins when trusted",
			resolver: clientip.Resolver{TrustCloudflare: true},
			remote:   "10.0.0.1:1234",
			headers:  map[string]string{"CF-Connecting-IP": "203.0.113.7", "X-Forwarded-For": "198.51.100.9, 10.0.0.2"},
			want:     "203.0.113.7",
		},
		{
			name:     "forged forwarded-for does not change bucket when cloudflare header present",
			resolver: clientip.Resolver{TrustCloudflare: true},
			remote:   "10.0.0.1:1234",
			headers:  map[string]string{"CF-Connecting-IP": "203.0.113.7", "X-Forwarded-For": "1.2.3.4"},
			want:     "203.0.113.7",
		},
		{
			name:     "cloudflare ipv6 is normalized",
			resolver: clientip.Resolver{TrustCloudflare: true},
			remote:   "10.0.0.1:1234",
			headers:  map[string]string{"CF-Connecting-IP": " 2001:DB8::1 "},
			want:     "2001:db8::1",
		},
		{
			name:     "cloudflare header ignored when not trusted",
			resolver: clientip.Resolver{},
			remote:   "10.0.0.1:1234",
			headers:  map[string]string{"CF-Connecting-IP": "203.0.113.7", "X-Forwarded-For": "198.51.100.9, 10.0.0.2"},
			want:     "198.51.100.9",
		},
		{
			name:     "cloudflare header ignored without forwarded-for when not trusted",
			resolver: clientip.Resolver{},
			remote:   "192.0.2.3:1234",
			headers:  map[string]string{"CF-Connecting-IP": "203.0.113.7"},
			want:     "192.0.2.3",
		},
		{
			name:     "invalid cloudflare header falls back to forwarded-for",
			resolver: clientip.Resolver{TrustCloudflare: true},
			remote:   "10.0.0.1:1234",
			headers:  map[string]string{"CF-Connecting-IP": "not-an-ip", "X-Forwarded-For": " 192.0.2.1, 198.51.100.2"},
			want:     "192.0.2.1",
		},
		{
			name:     "trusted but absent cloudflare header falls back to forwarded-for",
			resolver: clientip.Resolver{TrustCloudflare: true},
			remote:   "10.0.0.1:1234",
			headers:  map[string]string{"X-Forwarded-For": "192.0.2.1"},
			want:     "192.0.2.1",
		},
		{
			name:     "remote address host",
			resolver: clientip.Resolver{TrustCloudflare: true},
			remote:   "192.0.2.3:1234",
			want:     "192.0.2.3",
		},
		{
			name:     "remote address without port",
			resolver: clientip.Resolver{},
			remote:   "192.0.2.4",
			want:     "192.0.2.4",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			require.Equal(t, tt.want, tt.resolver.IP(request(tt.remote, tt.headers)))
		})
	}
}
