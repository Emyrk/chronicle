package api

import (
	"net/http"
	"net/url"
)

func adsTxtHandler(canonicalURL *url.URL) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if canonicalURL == nil {
			http.NotFound(w, r)
			return
		}
		http.Redirect(w, r, canonicalURL.String(), http.StatusTemporaryRedirect)
	}
}
