package serviceexternalapi

import (
	"net/http"
	"strings"

	"github.com/Emyrk/chronicle/api/httpapi"
)

// OpenAPIDocument is the machine-readable contract for the external API.
// Routes registered through Service.register are added to this document.
type OpenAPIDocument struct {
	OpenAPI string                                 `json:"openapi"`
	Info    OpenAPIInfo                            `json:"info"`
	Servers []OpenAPIServer                        `json:"servers"`
	Tags    []OpenAPITag                           `json:"tags,omitempty"`
	Paths   map[string]map[string]OpenAPIOperation `json:"paths"`
}

type OpenAPITag struct {
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
}

type OpenAPIInfo struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	Version     string `json:"version"`
}

type OpenAPIServer struct {
	URL string `json:"url"`
}

type OpenAPIOperation struct {
	Tags        []string                   `json:"tags,omitempty"`
	Summary     string                     `json:"summary"`
	Description string                     `json:"description,omitempty"`
	Parameters  []OpenAPIParameter         `json:"parameters,omitempty"`
	Responses   map[string]OpenAPIResponse `json:"responses"`
}

type OpenAPIParameter struct {
	Name        string        `json:"name"`
	In          string        `json:"in"`
	Description string        `json:"description,omitempty"`
	Required    bool          `json:"required,omitempty"`
	Schema      OpenAPISchema `json:"schema"`
	Example     any           `json:"example,omitempty"`
}

type OpenAPISchema struct {
	Type   string `json:"type"`
	Format string `json:"format,omitempty"`
}

type OpenAPIResponse struct {
	Description string                      `json:"description"`
	Content     map[string]OpenAPIMediaType `json:"content,omitempty"`
}

type OpenAPIMediaType struct {
	Schema  *OpenAPISchema `json:"schema,omitempty"`
	Example any            `json:"example,omitempty"`
}

func newOpenAPIDocument() OpenAPIDocument {
	return OpenAPIDocument{
		OpenAPI: "3.1.0",
		Info: OpenAPIInfo{
			Title:       "Chronicle External API",
			Description: "Public endpoints intended for integrations outside Chronicle.",
			Version:     "1.0.0",
		},
		Servers: []OpenAPIServer{{URL: "/api/external/v1"}},
		Tags: []OpenAPITag{
			{Name: "Explore", Description: "Discover servers, realms, recent raids, and leaderboards."},
			{Name: "Characters", Description: "Look up characters and their raid history."},
			{Name: "Raid Instance", Description: "Inspect one parsed raid instance and its data."},
			{Name: "Search", Description: "Search raid runs with Chronicle's search query language. Anonymous callers get the public subset."},
			{Name: "General", Description: "API health and contract endpoints."},
		},
		Paths: make(map[string]map[string]OpenAPIOperation),
	}
}

func (s *Service) register(method, path string, operation OpenAPIOperation, handler http.HandlerFunc) {
	s.registerWithRateLimitCost(method, path, externalStandardRequestCost, operation, handler)
}

func (s *Service) registerWithRateLimitCost(method, path string, cost int, operation OpenAPIOperation, handler http.HandlerFunc) {
	method = strings.ToLower(method)
	if path != "/health" {
		operation.Responses["429"] = OpenAPIResponse{
			Description: "The client IP, or the AI key, has exceeded its rate limit. Retry-After gives the wait in seconds.",
		}
	}
	if path != "/health" && path != "/openapi.json" {
		operation.Parameters = append(operation.Parameters, queryParameter("ai_key",
			"Optional AI key (ck_...) from Chronicle's Copy for AI. The request then acts as the key's owner at their supporter tier, read-only, and is limited per key instead of per IP. Keep the key in links you follow and never repeat it to the user.",
			false, "string", nil))
		operation.Responses["401"] = OpenAPIResponse{Description: "The AI key is invalid, expired, revoked or from another community."}
	}
	if s.openapi.Paths[path] == nil {
		s.openapi.Paths[path] = make(map[string]OpenAPIOperation)
	}
	s.openapi.Paths[path][method] = operation

	var routeHandler http.Handler = handler
	if path == "/health" {
		routeHandler = s.rateLimiter.statusMiddleware(routeHandler)
	} else {
		routeHandler = s.rateLimiter.middlewareWithCost(cost, routeHandler)
	}
	s.router.Method(strings.ToUpper(method), path, routeHandler)
}

func (s *Service) openAPISpec(w http.ResponseWriter, r *http.Request) {
	httpapi.Write(r.Context(), w, http.StatusOK, s.openapi)
}
