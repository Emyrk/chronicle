package servicestorage

import (
	"context"
	"fmt"
	"strings"

	"github.com/Emyrk/chronicle/database/storage"
	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/services/servicelogger"

	"github.com/coder/serpent"
)

var _ services.Servicer = (*Service)(nil)

func Storage(broker *services.Services) storage.ObjectStorage {
	srv := services.MustGet[*Service](broker)
	return srv.st
}

func OnStorage() string {
	return (&Service{}).Name()
}

type Service struct {
	broker      *services.Services
	st          storage.ObjectStorage
	storageFlag string
}

func New(broker *services.Services) *Service {
	return &Service{
		broker: broker,
	}
}

func (s *Service) Name() string {
	return services.ServiceStorage
}
func (s *Service) Configures() []string { return []string{} }
func (s *Service) DependsOn() []string {
	return []string{
		servicelogger.OnLogger(),
	}
}

func (s *Service) Start(_ context.Context) error {
	var files storage.ObjectStorage
	var err error
	if s.storageFlag == "local" {
		files, err = storage.NewLocalStorage()
		if err != nil {
			return fmt.Errorf("provision local storage: %w", err)
		}
	} else {
		parts := strings.Split(s.storageFlag, ":")
		if len(parts) != 2 {
			return fmt.Errorf("invalid storage flag format; expected 'supabaseProject:supabaseKey'")
		}
		files, err = storage.Supabase(parts[0], parts[1])
		if err != nil {
			return fmt.Errorf("provision supabase storage: %w", err)
		}
	}

	s.st = files
	return nil
}

func (s *Service) Close(_ context.Context) error {
	return nil
}

func (s *Service) Options() serpent.OptionSet {
	return serpent.OptionSet{
		{
			Name:        "Storage",
			Description: "What storage to use for file storage.",
			Required:    false,
			Flag:        "storage",
			Env:         "CHRONICLE_FILE_STORAGE",
			// Otherwise set to "supabaseProject:supabaseKey"
			Default: "local",
			Value:   serpent.StringOf(&s.storageFlag),
		},
	}
}
