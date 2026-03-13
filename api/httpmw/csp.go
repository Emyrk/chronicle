package httpmw

import (
	"net/http"
	"strings"
)

// ContentSecurityPolicy sets the Content-Security-Policy header on all responses.
func ContentSecurityPolicy() func(next http.Handler) http.Handler {
	policy := strings.Join([]string{
		"default-src 'self'",
		"script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com https://tweakcn.com https://www.youtube.com https://static.cloudflareinsights.com",
		"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
		"font-src 'self' https://fonts.gstatic.com",
		"img-src 'self' data: blob: https://cdn.brandfetch.io https://icons.chronicleclassic.com",
		"connect-src 'self' https://www.google-analytics.com https://region1.google-analytics.com https://icons.chronicleclassic.com",
		"worker-src 'self' blob:",
		"frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com",
		"frame-ancestors 'none'",
	}, "; ")

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Security-Policy", policy)
			next.ServeHTTP(w, r)
		})
	}
}
