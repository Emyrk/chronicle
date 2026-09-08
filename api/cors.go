package api

import (
	"net/http"
	"strings"

	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/go-chi/cors"
)

const (
	ExternalAPIPath = "/api/external/v1"
	SupportAPIPath  = "/api/v1/support"
)

func Cors(tenant *servicetenant.Service) func(next http.Handler) http.Handler {
	return cors.Handler(cors.Options{
		AllowOriginFunc: func(_ *http.Request, origin string) bool {
			return tenant.IsAllowedOrigin(origin)
		},
		AllowedMethods:   []string{"OPTIONS", "GET"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		AllowCredentials: true,
		MaxAge:           300,
	})
}

// ExternalCors allows browser clients from any origin to call the external API.
// Credentials remain disabled so cookies are never exposed cross-origin.
func ExternalCors() func(next http.Handler) http.Handler {
	return cors.AllowAll().Handler
}

// PublicReadCors allows any site to read explicitly public aggregate endpoints
// without exposing credentials or permitting writes.
func PublicReadCors() func(next http.Handler) http.Handler {
	return cors.Handler(cors.Options{
		AllowedOrigins: []string{"*"},
		AllowedMethods: []string{http.MethodGet, http.MethodOptions},
		AllowedHeaders: []string{"Accept", "Content-Type"},
		MaxAge:         300,
	})
}

// RouteCors selects the permissive external API policy while preserving the
// existing origin restrictions for Chronicle's browser-facing routes.
func RouteCors(tenant *servicetenant.Service) func(next http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		chronicle := Cors(tenant)(next)
		external := ExternalCors()(next)
		publicRead := PublicReadCors()(next)

		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			isExternalAPI := r.URL.Path == ExternalAPIPath || strings.HasPrefix(r.URL.Path, ExternalAPIPath+"/")
			isPublicSupportAPI := r.URL.Path == SupportAPIPath || strings.HasPrefix(r.URL.Path, SupportAPIPath+"/")
			if isExternalAPI {
				external.ServeHTTP(w, r)
				return
			}
			if isPublicSupportAPI {
				publicRead.ServeHTTP(w, r)
				return
			}
			chronicle.ServeHTTP(w, r)
		})
	}
}
