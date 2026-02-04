package httpmw

import (
	"net/http"

	"github.com/Emyrk/chronicle/database/spice"
	"github.com/Emyrk/chronicle/database/spice/policy"
)

func ViewRiverQueue(authz *spice.Spice) func(next http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := r.Context()
			err := authz.Check(policy.New().GlobalChronicle().CanView_queue(ctx))
			if err != nil {
				http.Error(w, "Forbidden", http.StatusForbidden)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
