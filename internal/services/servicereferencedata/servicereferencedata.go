package servicereferencedata

import (
	"context"

	"github.com/Emyrk/chronicle/internal/referencedata"
	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/services/servicedbstore"
	"github.com/coder/serpent"
)

var _ services.Servicer = (*Service)(nil)

func ReferenceData(broker *services.Services) *Service {
	return services.MustGet[*Service](broker)
}

func OnReferenceData() string {
	return (&Service{}).Name()
}

type Service struct {
	broker  *services.Services
	enabled bool
	store   *referencedata.Store
}

func New(broker *services.Services) *Service {
	return &Service{broker: broker}
}

func (s *Service) Name() string         { return services.ServiceReferenceData }
func (s *Service) Configures() []string { return nil }
func (s *Service) DependsOn() []string  { return []string{servicedbstore.OnDatabaseStore()} }

func (s *Service) Options() serpent.OptionSet {
	return serpent.OptionSet{{
		Name:        "External Reference Data Enabled",
		Description: "Enable external player and guild reference-data infrastructure.",
		Flag:        "reference-data-enabled",
		Env:         "CHRONICLE_REFERENCE_DATA_ENABLED",
		Default:     "false",
		Value:       serpent.BoolOf(&s.enabled),
	}}
}

func (s *Service) Start(context.Context) error {
	if s.enabled {
		s.store = referencedata.NewStore(servicedbstore.DatabaseStore(s.broker))
	}
	return nil
}

func (s *Service) Close(context.Context) error { return nil }
func (s *Service) Enabled() bool               { return s.enabled }
func (s *Service) Store() *referencedata.Store { return s.store }
