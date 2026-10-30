package chronauth

import (
	"net/http"
	"net/url"
	"strings"
)

// logoutSameOrigin protects cookie-backed logout even from another subdomain
// (Sec-Fetch-Site: same-site). Bearer-only clients have no ambient credentials.
func logoutSameOrigin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if bearerToken(r) != "" && len(r.Cookies()) == 0 {
			next.ServeHTTP(w, r)
			return
		}

		origin := r.Header.Get("Origin")
		if origin != "" {
			parsed, err := url.Parse(origin)
			scheme := "http"
			if r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https") {
				scheme = "https"
			}
			if err == nil && parsed.User == nil && parsed.Path == "" && parsed.RawQuery == "" && parsed.Fragment == "" &&
				strings.EqualFold(parsed.Scheme, scheme) && strings.EqualFold(parsed.Host, r.Host) {
				next.ServeHTTP(w, r)
				return
			}
		} else if r.Header.Get("Sec-Fetch-Site") == "same-origin" {
			next.ServeHTTP(w, r)
			return
		}

		http.Error(w, "Forbidden", http.StatusForbidden)
	})
}
