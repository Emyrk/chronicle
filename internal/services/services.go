package services

import (
	"context"
	"errors"
	"log/slog"

	"github.com/coder/serpent"
)

type Servicer interface {
	Name() string

	DependsOn() []string
	Options() serpent.OptionSet
	Start(ctx context.Context) error
	Close() error
}

type Services struct {
	services map[string]Servicer
}

func New() *Services {
	return &Services{
		services: make(map[string]Servicer),
	}
}

func NamedLogger(logger *slog.Logger, name string) *slog.Logger {
	return logger.With(slog.String("service", name))
}

func (s *Services) Register(srv Servicer) error {
	_, ok := s.services[srv.Name()]
	if ok {
		return errors.New("service already exists")
	}

	s.services[srv.Name()] = srv
	return nil
}

func (s *Services) Start() error {
	// Find the depends-on order and start services accordingly
	return nil
}
