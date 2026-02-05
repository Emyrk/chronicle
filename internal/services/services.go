package services

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/natessilva/dag"

	"github.com/coder/serpent"
)

type Ready <-chan struct{}

func MakeReady() chan struct{} {
	c := make(chan struct{})
	return c
}

type Servicer interface {
	Name() string

	DependsOn() []string
	Options() serpent.OptionSet
	Start(ctx context.Context) (Ready, error)
	Close() error
}

func MustGet[T Servicer](broker *Services) T {
	srv, err := Get[T](broker)
	if err != nil {
		panic(err)
	}
	return srv
}

func Get[T Servicer](broker *Services) (T, error) {
	var zero T

	srv, err := broker.Get(zero.Name())
	if err != nil {
		return zero, err
	}
	typed, ok := srv.(T)
	if !ok {
		var zero T
		return zero, fmt.Errorf("service %q is not of expected type", zero.Name())
	}
	return typed, nil
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

func (s *Services) Register(srvs ...Servicer) error {
	for _, srv := range srvs {
		if err := s.register(srv); err != nil {
			return err
		}
	}
	return nil
}

func (s *Services) register(srv Servicer) error {
	_, ok := s.services[srv.Name()]
	if ok {
		return errors.New("service already exists")
	}

	s.services[srv.Name()] = srv
	return nil
}

func (s *Services) Get(name string) (Servicer, error) {
	srv, ok := s.services[name]
	if !ok {
		return nil, fmt.Errorf("service %q not found", name)
	}
	return srv, nil
}

func (s *Services) OptionSet() serpent.OptionSet {
	var opts serpent.OptionSet
	for _, srv := range s.services {
		opts = append(opts, srv.Options()...)
	}
	return opts
}

// Start launches all registered services in dependency order.
// First build the dependency graph. Each service has a `dependsOn` method that returns
// the strings it depends on. Anything without a dependency can be started first.
//
// When starting a service, it is ready when the returned Ready channel is closed.
// If the context is cancelled before the Ready channel is closed, let the service
// handle it, and still wait on Ready.
func (s *Services) Start(ctx context.Context, logger *slog.Logger) error {
	var r dag.Runner

	for name, srv := range s.services {
		srv := srv // capture for closure
		r.AddVertex(name, func() error {
			logger.Info("starting service", slog.String("name", name))
			readyCh, err := srv.Start(ctx)
			if err != nil {
				return fmt.Errorf("start service %q: %w", srv.Name(), err)
			}

			select {
			case <-readyCh:
			case <-ctx.Done():
				deadline, cancel := context.WithTimeout(context.Background(), time.Second*3)
				defer cancel()
				select {
				case <-readyCh:
				case <-deadline.Done():
					return fmt.Errorf("service %q did not become ready before context was done: %w", srv.Name(), ctx.Err())
				}
			}

			return nil
		})
	}

	for name, srv := range s.services {
		for _, dep := range srv.DependsOn() {
			r.AddEdge(dep, name) // dep must complete before name
		}
	}

	logger.Info("starting services")
	return r.Run()
}
