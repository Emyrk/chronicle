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
	isDev := strings.Contains(accessURL.Host, "localhost")

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if isDev {
				next.ServeHTTP(w, r)
				return
			}

			site := r.Header.Get("Sec-Fetch-Site")
			if site == "" || site == "cross-site" {
				http.Error(w, "Forbidden", http.StatusForbidden)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
