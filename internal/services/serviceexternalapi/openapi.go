package serviceexternalapi

import (
	"net/http"
	"strings"

	"github.com/Emyrk/chronicle/api/httpapi"
)

// OpenAPIDocument is the machine-readable contract for the external API.
// Routes registered through Service.register are added to this document.
type OpenAPIDocument struct {
	OpenAPI    string                                 `json:"openapi"`
	Info       OpenAPIInfo                            `json:"info"`
	Servers    []OpenAPIServer                        `json:"servers"`
	Tags       []OpenAPITag                           `json:"tags,omitempty"`
	Paths      map[string]map[string]OpenAPIOperation `json:"paths"`
	Components OpenAPIComponents                      `json:"components"`
}

type OpenAPIComponents struct {
	SecuritySchemes map[string]OpenAPISecurityScheme `json:"securitySchemes"`
}

type OpenAPISecurityScheme struct {
	Type         string `json:"type"`
	Scheme       string `json:"scheme"`
	BearerFormat string `json:"bearerFormat,omitempty"`
	Description  string `json:"description,omitempty"`
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
	Security    []map[string][]string      `json:"security,omitempty"`
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
			{Name: "General", Description: "API health and contract endpoints."},
		},
		Paths: make(map[string]map[string]OpenAPIOperation),
		Components: OpenAPIComponents{SecuritySchemes: map[string]OpenAPISecurityScheme{
			"developerOAuth": {
				Type: "http", Scheme: "bearer", BearerFormat: "OAuth2",
				Description: "Optional developer application access token from /oauth/token. Anonymous access remains available.",
			},
		}},
	}
}

func (s *Service) register(method, path string, operation OpenAPIOperation, handler http.HandlerFunc) {
	s.registerWithRateLimitCost(method, path, externalStandardRequestCost, operation, handler)
}

func (s *Service) registerWithRateLimitCost(method, path string, cost int, operation OpenAPIOperation, handler http.HandlerFunc) {
	method = strings.ToLower(method)
	operation.Security = []map[string][]string{{}, {"developerOAuth": {}}}
	operation.Responses["401"] = OpenAPIResponse{Description: "The supplied OAuth bearer token is invalid or lacks developer API access."}
	if path != "/health" {
		operation.Responses["429"] = OpenAPIResponse{
			Description: "The client IP or developer application has exceeded the external API rate limit.",
		}
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
