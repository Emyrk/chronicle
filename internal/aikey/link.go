package aikey

import (
	"context"
	"net"
	"net/http"
	"net/url"
	"strings"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
)

// Link adds the request's AI key to rawURL so an AI agent that follows it
// keeps its access. Use it only for links an agent follows, never for links
// meant for a person to click. Without a key, or if rawURL does not parse,
// rawURL is returned unchanged.
func Link(ctx context.Context, rawURL string) string {
	secret, _ := ctx.Value(secretContextKey{}).(string)
	if secret == "" {
		return rawURL
	}
	u, err := url.Parse(rawURL)
	if err != nil {
		return rawURL
	}
	q := u.Query()
	q.Set(chroniclesdk.AIKeyQueryParam, secret)
	u.RawQuery = q.Encode()
	return u.String()
}

// takeKey reads the first ai_key value and removes every ai_key from the
// request in place, so nothing that later logs or echoes the URL (including
// middleware that ran earlier and holds the same request) can see it.
func takeKey(r *http.Request) (string, bool) {
	if !strings.Contains(r.URL.RawQuery, chroniclesdk.AIKeyQueryParam) {
		return "", false
	}
	// The query is rebuilt from what parses, so a malformed pair that might
	// hold the key is dropped rather than kept verbatim.
	q, _ := url.ParseQuery(r.URL.RawQuery)
	values := q[chroniclesdk.AIKeyQueryParam]
	q.Del(chroniclesdk.AIKeyQueryParam)
	r.URL.RawQuery = q.Encode()
	r.RequestURI = r.URL.RequestURI()
	r.Form, r.PostForm = nil, nil
	if len(values) == 0 {
		return "", false
	}
	return values[0], true
}

// ClientIP is the most trustworthy client address the server has, used only
// for the wrong-key limiter: Cloudflare's CF-Connecting-IP (Cloudflare sets
// it and overwrites any client value), else the last X-Forwarded-For hop
// (appended by the nearest proxy, unlike the first hop, which the client
// controls), else the peer address.
func ClientIP(r *http.Request) string {
	if ip := net.ParseIP(strings.TrimSpace(r.Header.Get("CF-Connecting-IP"))); ip != nil {
		return ip.String()
	}
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		hops := strings.Split(xff, ",")
		if ip := net.ParseIP(strings.TrimSpace(hops[len(hops)-1])); ip != nil {
			return ip.String()
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
