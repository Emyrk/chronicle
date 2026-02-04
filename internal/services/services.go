package services

import (
	"context"
	"log/slog"

	"github.com/coder/serpent"
)

type Services struct {
}

func New() *Services {
	return &Services{}
}

type Servicer interface {
	Name() string
	DependsOn() []string

	Options() serpent.OptionSet
	Start(ctx context.Context) error
	Close() error
}

func NamedLogger(logger *slog.Logger, name string) *slog.Logger {
	return logger.With(slog.String("service", name))
}
