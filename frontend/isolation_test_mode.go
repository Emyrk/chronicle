package frontend

import (
	"net/http"
	"regexp"
)

var isolationInstancePath = regexp.MustCompile(`^/instances/[A-Za-z0-9_-]+$`)

// Only opt in an exact instance document, before SPA fallback rewrites its path.
// This flag is a compatibility experiment, not an authorization boundary.
func instanceIsolationTest(r *http.Request) bool {
	values := r.URL.Query()["isolationTest"]
	return (r.Method == http.MethodGet || r.Method == http.MethodHead) &&
		isolationInstancePath.MatchString(r.URL.Path) && len(values) == 1 && values[0] == "1"
}
