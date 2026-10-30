package httpmw

import (
	"net/http"
	"net/url"
	"strings"
)

// BrowserOnly rejects requests that do not originate from a browser.
// It uses the Sec-Fetch-Site header, which is a forbidden header that browsers
// set automatically and JavaScript cannot override. Non-browser clients (curl,
// scripts, bots) won't send it, so they are rejected. Exact GET paths in
// allowedCrossSitePaths are exempt for browser flows such as OAuth callbacks,
// which arrive as cross-site navigations without an Origin header.
func BrowserOnly(accessURL *url.URL, allowedCrossSitePaths ...string) func(next http.Handler) http.Handler {
	isDev := strings.Contains(accessURL.Host, "localhost") || strings.Contains(accessURL.String(), "192.168.1")
	isSameOrigin := func(r *http.Request, origin string) bool {
		parsed, err := url.Parse(origin)
		if err != nil || parsed.User != nil || parsed.Host == "" {
			return false
		}
		scheme := "http"
		if r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https") {
			scheme = "https"
		}
		return strings.EqualFold(parsed.Scheme, scheme) && strings.EqualFold(parsed.Host, r.Host)
	}
	isAllowedCrossSitePath := func(path string) bool {
		for _, allowedPath := range allowedCrossSitePaths {
			if path == allowedPath {
				return true
			}
		}
		return false
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if isDev {
				next.ServeHTTP(w, r)
				return
			}

			// Bearer-token clients (CLI / programmatic) are not browsers and
			// carry no cookie, so they are not a CSRF risk. Let them through;
			// the auth middleware still validates the token.
			if r.Header.Get("Authorization") != "" {
				next.ServeHTTP(w, r)
				return
			}

			site := r.Header.Get("Sec-Fetch-Site")
			if site == "cross-site" && r.Method == http.MethodGet && isAllowedCrossSitePath(r.URL.Path) {
				next.ServeHTTP(w, r)
				return
			}
			if site == "" || site == "cross-site" {
				// WebSocket handshakes do not consistently include Fetch Metadata
				// headers, so accept a verified same-origin Origin as a fallback.
				origin := r.Header.Get("Origin")
				if isSameOrigin(r, origin) {
					next.ServeHTTP(w, r)
					return
				}
				// TODO: Standardize this more
				switch strings.TrimSuffix(origin, "/") {
				case "https://jollygrin.github.io":
				case "https://chronicleclassic.com":
				case "https://wiki.chronicleclassic.com":
				case "https://discord.com":
				default:
					http.Error(w, "Forbidden, only browser requests from https://chronicleclassic.com are allowed", http.StatusForbidden)
					return
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}
