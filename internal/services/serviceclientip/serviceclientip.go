// Package serviceclientip owns the deployment setting that decides how request
// client IPs are derived for rate limiting.
package serviceclientip

import (
	"context"

	"github.com/Emyrk/chronicle/internal/clientip"
	"github.com/Emyrk/chronicle/internal/services"

	"github.com/coder/serpent"
)

var _ services.Servicer = (*Service)(nil)

// Resolver returns the configured client IP resolver.
func Resolver(broker *services.Services) clientip.Resolver {
	return services.MustGet[*Service](broker).resolver()
}

func OnClientIP() string { return (&Service{}).Name() }

type Service struct {
	broker           *services.Services
	behindCloudflare bool
}

func New(broker *services.Services) *Service {
	return &Service{broker: broker}
}

func (s *Service) Name() string                  { return services.ServiceClientIP }
func (s *Service) Configures() []string          { return nil }
func (s *Service) DependsOn() []string           { return nil }
func (s *Service) Start(_ context.Context) error { return nil }
func (s *Service) Close(_ context.Context) error { return nil }

func (s *Service) resolver() clientip.Resolver {
	return clientip.Resolver{TrustCloudflare: s.behindCloudflare}
}

func (s *Service) Options() serpent.OptionSet {
	return serpent.OptionSet{
		{
			Name:        "behind-cloudflare",
			Description: "Trust the CF-Connecting-IP header as the client IP for rate limits. Only enable when the origin is reachable solely through Cloudflare (no public platform domain, or an origin lock), otherwise clients can forge it.",
			Flag:        "behind-cloudflare",
			Env:         "CHRONICLE_BEHIND_CLOUDFLARE",
			Default:     "false",
			Value:       serpent.BoolOf(&s.behindCloudflare),
		},
	}
}
