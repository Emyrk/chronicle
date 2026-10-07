// Package servicegithub provides Chronicle's server-side GitHub API client.
package servicegithub

import (
	"context"
	"errors"
	"net/http"

	"github.com/Emyrk/chronicle/internal/services"
	"github.com/coder/serpent"
)

const githubAPIHost = "api.github.com"

var _ services.Servicer = (*Service)(nil)

func GitHub(broker *services.Services) *Service {
	return services.MustGet[*Service](broker)
}

func OnGitHub() string {
	return (&Service{}).Name()
}

type Service struct {
	clientID      string
	clientSecret  string
	baseTransport http.RoundTripper
	client        *http.Client
}

func New(_ *services.Services) *Service {
	return &Service{}
}

func (s *Service) Name() string         { return services.ServiceGitHub }
func (s *Service) Configures() []string { return nil }
func (s *Service) DependsOn() []string  { return nil }

func (s *Service) Start(_ context.Context) error {
	if (s.clientID == "") != (s.clientSecret == "") {
		return errors.New("GitHub OAuth App client ID and client secret must be configured together")
	}

	transport := s.baseTransport
	if transport == nil {
		transport = http.DefaultTransport
	}
	if s.clientID != "" {
		transport = &oauthAppTransport{
			base:         transport,
			clientID:     s.clientID,
			clientSecret: s.clientSecret,
		}
	}
	s.client = &http.Client{Transport: transport}
	return nil
}

func (s *Service) Close(_ context.Context) error { return nil }

func (s *Service) Client() *http.Client {
	if s.client == nil {
		panic("GitHub service has not started")
	}
	return s.client
}

func (s *Service) Options() serpent.OptionSet {
	return serpent.OptionSet{
		{
			Name:        "GitHub OAuth App Client ID",
			Description: "Optional OAuth App client ID used for higher-rate GitHub public API requests.",
			Required:    false,
			Flag:        "github-oauth-client-id",
			Env:         "CHRONICLE_GITHUB_OAUTH_CLIENT_ID",
			Default:     "",
			Value:       serpent.StringOf(&s.clientID),
		},
		{
			Name:        "GitHub OAuth App Client Secret",
			Description: "Optional OAuth App client secret used for higher-rate GitHub public API requests.",
			Required:    false,
			Flag:        "github-oauth-client-secret",
			Env:         "CHRONICLE_GITHUB_OAUTH_CLIENT_SECRET",
			Default:     "",
			Value:       serpent.StringOf(&s.clientSecret),
		},
	}
}

type oauthAppTransport struct {
	base         http.RoundTripper
	clientID     string
	clientSecret string
}

func (t *oauthAppTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	clone := req.Clone(req.Context())
	clone.Header = req.Header.Clone()
	if req.URL.Scheme == "https" && req.URL.Hostname() == githubAPIHost {
		clone.SetBasicAuth(t.clientID, t.clientSecret)
	} else {
		clone.Header.Del("Authorization")
	}
	return t.base.RoundTrip(clone)
}
