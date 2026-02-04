package services

import (
	"context"
	"errors"
	"log/slog"

	"github.com/coder/serpent"
)

type Ready chan<- chan struct{}

type Servicer interface {
	Name() string

	DependsOn() []string
	Options() serpent.OptionSet
	Start(ctx context.Context) (Ready, error)
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
	// First build the dependency graph. Each service has a `dependsOn` method that returns
	// the strings it depends on. Anything without a dependency can be started first.
	//
	// When starting a service, it is ready when the returned Ready channel is closed.
	// If the context is cancelled before the Ready channel is closed, let the service
	// handle it, and still wait on Ready.
	return nil
}
