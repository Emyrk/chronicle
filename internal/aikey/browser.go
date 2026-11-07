package aikey

import (
	"net/http"
	"net/url"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
)

// IsBrowser reports whether r came from a web browser. Browsers send
// Sec-Fetch-* headers on every navigation; AI fetchers and curl don't.
func IsBrowser(r *http.Request) bool {
	return r.Header.Get("Sec-Fetch-Mode") != "" || r.Header.Get("Sec-Fetch-Site") != ""
}

// HasKey reports whether r carries an ai_key query parameter, under any
// spelling the query parser accepts.
func HasKey(r *http.Request) bool {
	if r.URL.RawQuery == "" {
		return false
	}
	q, err := url.ParseQuery(r.URL.RawQuery)
	_, present := q[chroniclesdk.AIKeyQueryParam]
	// A malformed query might hide the key in a pair the parser dropped.
	return present || err != nil
}

// StripKey removes ai_key from r without checking it, and returns a writer
// that sets the privacy headers every keyed response carries. Use it to serve
// a keyed URL to a browser: the page loads, but the key never signs anyone in
// and is never charged. It returns w unchanged when r has no key.
func StripKey(w http.ResponseWriter, r *http.Request) http.ResponseWriter {
	if !HasKey(r) {
		return w
	}
	_, _ = takeKey(r)
	return newKeyedWriter(w)
}
