package serviceaccessurl

import (
	"context"

	"github.com/Emyrk/chronicle/internal/services"

	"github.com/coder/serpent"
)

var _ services.Servicer = (*Service)(nil)

func AccessURL(broker *services.Services) string {
	srv := services.MustGet[*Service](broker)
	return srv.accessURL
}

func OnAccessURL() string { return (&Service{}).Name() }

type Service struct {
	broker    *services.Services
	accessURL string
}

func New(broker *services.Services) *Service {
	return &Service{broker: broker}
}

func (s *Service) Name() string                  { return services.ServiceAccessURL }
func (s *Service) Configures() []string          { return []string{} }
func (s *Service) DependsOn() []string           { return []string{} }
func (s *Service) Start(_ context.Context) error { return nil }
func (s *Service) Close(_ context.Context) error { return nil }

func (s *Service) Options() serpent.OptionSet {
	return serpent.OptionSet{
		{
			Name:        "access-url",
			Description: "Access url to access the server from outside the cluster.",
			Required:    false,
			Flag:        "access-url",
			Env:         "CHRONICLE_ACCESS_URL",
			Default:     "http://localhost:4000",
			Value:       serpent.StringOf(&s.accessURL),
		},
	}
}
