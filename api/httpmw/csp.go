package httpmw

import (
	"net/http"
	"strings"
)

// ContentSecurityPolicy sets the Content-Security-Policy header on all responses.
// Ad-enabled site responses permit HTTPS advertising resources because NitroPay
// can select demand partners dynamically. Other responses retain the strict policy.
func ContentSecurityPolicy(adsEnabled func(*http.Request) bool) func(next http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			httpsSource := ""
			scriptAdSources := ""
			styleAdSources := ""
			fontAdSources := ""
			mediaSources := "media-src 'self'"
			if adsEnabled != nil && adsEnabled(r) {
				httpsSource = " https:"
				scriptAdSources = " 'unsafe-eval' https:"
				styleAdSources = " https:"
				fontAdSources = " https:"
				mediaSources = "media-src 'self' data: blob: https:"
			}

			policy := strings.Join([]string{
				"default-src 'self'",
				"script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob: https://www.googletagmanager.com https://www.google-analytics.com https://www.youtube.com https://static.cloudflareinsights.com" + scriptAdSources,
				"style-src 'self' 'unsafe-inline'" + styleAdSources,
				"font-src 'self'" + fontAdSources,
				"img-src 'self' data: blob: https://www.googletagmanager.com https://cdn.brandfetch.io https://icons.chronicleclassic.com https://cdn.discordapp.com https://i.imgur.com https://avatars.githubusercontent.com" + httpsSource,
				mediaSources,
				"connect-src 'self' blob: https://raw.githubusercontent.com https://www.googletagmanager.com https://www.google-analytics.com https://region1.google-analytics.com https://analytics.google.com https://www.google.com https://icons.chronicleclassic.com https://models.chronicleclassic.com" + httpsSource,
				"worker-src 'self' blob:",
				"frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com" + httpsSource,
				"frame-ancestors 'none'",
			}, "; ")

			w.Header().Set("Content-Security-Policy", policy)
			next.ServeHTTP(w, r)
		})
	}
}
