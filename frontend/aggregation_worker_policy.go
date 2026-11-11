package frontend

import (
	"net/http"
	"regexp"
)

// The distinct entry name excludes the Guides Lua worker and also busts old
// one-day-cached worker responses that did not carry COEP. This worker only
// computes over posted bytes; it does not fetch cross-origin resources.
var aggregationWorkerAsset = regexp.MustCompile(`^/assets/aggregationPanelWorker-[A-Za-z0-9_-]+\.js$`)

func aggregationWorkerPolicy(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if (r.Method == http.MethodGet || r.Method == http.MethodHead) && aggregationWorkerAsset.MatchString(r.URL.Path) {
			// Apply before the ETag middleware so revalidation responses keep the policy.
			// Unlike document isolation, worker COEP is safe without a query opt-in:
			// ordinary documents remain non-isolated and can still run this worker.
			w.Header().Set("Cross-Origin-Embedder-Policy", "require-corp")
		}
		next.ServeHTTP(w, r)
	})
}
