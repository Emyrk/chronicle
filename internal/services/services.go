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
	Configures() []string

	Options() serpent.OptionSet
	Start(ctx context.Context) error
	Close(ctx context.Context) error
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
	logger   *slog.Logger
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
	s.logger = logger

	for name, srv := range s.services {
		srv := srv // capture for closure
		r.AddVertex(name, func() error {
			now := time.Now()
			err := srv.Start(ctx)
			if err != nil {
				return fmt.Errorf("start service %q: %w", srv.Name(), err)
			}

			logger.Info("service started", slog.String("name", name), slog.String("duration", time.Since(now).String()))
			return nil
		})
	}

	for name, srv := range s.services {
		for _, dep := range srv.DependsOn() {
			r.AddEdge(dep, name) // dep must complete before name
		}
		for _, cfg := range srv.Configures() {
			r.AddEdge(name, cfg) // name must complete before cfg
		}
	}

	logger.Info("starting services")
	return r.Run()
}

// Close shuts down all services in reverse dependency order.
// Services that depend on others are closed first, before their dependencies.
// All services are closed even if some fail; errors are collected and merged.
//
// The context should be used to signal a forced shutdown. A graceful
// shutdown should be handled if the close finished before the context is done.
func (s *Services) Close(ctx context.Context) error {
	var r dag.Runner

	errs := make(chan error, len(s.services))

	for name, srv := range s.services {
		srv := srv // capture for closure
		r.AddVertex(name, func() error {
			if err := srv.Close(ctx); err != nil {
				s.logger.Error("failed to close service", slog.String("name", name), slog.String("error", err.Error()))
				errs <- fmt.Errorf("close service %q: %w", srv.Name(), err)
			} else {
				s.logger.Info("closed service", slog.String("name", name))
			}

			return nil // always return nil to continue closing other services
		})
	}

	// Reverse the edges: if A depends on B, close A before B.
	for name, srv := range s.services {
		for _, dep := range srv.DependsOn() {
			r.AddEdge(name, dep) // name must close before dep
		}
	}

	_ = r.Run() // ignore dag error, we collect errors ourselves
	close(errs)

	var collected []error
	for err := range errs {
		collected = append(collected, err)
	}

	return errors.Join(collected...)
}
