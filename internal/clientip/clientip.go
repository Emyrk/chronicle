// Package clientip derives the originating client IP of an HTTP request for
// rate-limit keys.
package clientip

import (
	"net"
	"net/http"
	"net/netip"
	"strings"
)

// CloudflareHeader carries the real client IP when a request was proxied by
// Cloudflare. Cloudflare overwrites any client-supplied value.
const CloudflareHeader = "CF-Connecting-IP"

// Resolver derives client IPs. The zero value ignores Cloudflare headers.
type Resolver struct {
	// TrustCloudflare must only be set when every request reaches the server
	// through Cloudflare. Otherwise CF-Connecting-IP is client-controlled and
	// trusting it would let a client pick its own rate-limit bucket.
	TrustCloudflare bool
}

// IP returns, in order of preference:
//  1. CF-Connecting-IP, when TrustCloudflare is set and the header holds a valid IP.
//  2. The first X-Forwarded-For hop, as set by Chronicle's reverse proxy.
//  3. The host of RemoteAddr.
func (c Resolver) IP(r *http.Request) string {
	if c.TrustCloudflare {
		if addr, err := netip.ParseAddr(strings.TrimSpace(r.Header.Get(CloudflareHeader))); err == nil {
			return addr.Unmap().String()
		}
	}
	if forwarded := r.Header.Get("X-Forwarded-For"); forwarded != "" {
		first, _, _ := strings.Cut(forwarded, ",")
		return strings.TrimSpace(first)
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
