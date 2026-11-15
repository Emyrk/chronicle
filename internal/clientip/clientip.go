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

// ipv6BucketBits is the prefix IPv6 clients share a rate-limit bucket by: a /64 is
// what one subscriber or host is normally assigned, so per-address buckets would
// let a single client rotate through its whole prefix.
const ipv6BucketBits = 64

// Key returns the rate-limit bucket for the request's client: the IP from IP,
// with IPv4 (and IPv4-mapped IPv6) per address, native IPv6 collapsed to its /64
// ("2001:db8:1:2::/64"), and any IPv6 zone ("%eth0") dropped. A value that is
// not an IP address is returned as is, so the key is never emptier than IP.
func (c Resolver) Key(r *http.Request) string {
	raw := c.IP(r)
	addr, err := netip.ParseAddr(raw)
	if err != nil {
		return raw
	}
	addr = addr.WithZone("").Unmap()
	if addr.Is4() {
		return addr.String()
	}
	prefix, err := addr.Prefix(ipv6BucketBits)
	if err != nil {
		return addr.String()
	}
	return prefix.String()
}
