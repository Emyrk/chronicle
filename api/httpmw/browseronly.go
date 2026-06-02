package httpmw

import (
	"net/http"
	"net/url"
	"strings"
)

// BrowserOnly rejects requests that do not originate from a browser.
// It uses the Sec-Fetch-Site header, which is a forbidden header that browsers
// set automatically and JavaScript cannot override. Non-browser clients (curl,
// scripts, bots) won't send it, so they are rejected.
func BrowserOnly(accessURL *url.URL) func(next http.Handler) http.Handler {
	isDev := strings.Contains(accessURL.Host, "localhost") || strings.Contains(accessURL.String(), "192.168.1")

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
			if site == "" || site == "cross-site" {
				// TODO: Standardize this more
				origin := r.Header.Get("Origin")
				switch strings.TrimSuffix(origin, "/") {
				case "https://jollygrin.github.io":
				case "https://chronicleclassic.com":
				case "https://wiki.chronicleclassic.com":
				default:
					http.Error(w, "Forbidden, only browser requests from https://chronicleclassic.com are allowed", http.StatusForbidden)
					return
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}
