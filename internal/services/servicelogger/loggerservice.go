package servicelogger

import (
	"context"
	"io"
	"log/slog"
	"os"
	"strconv"

	"github.com/Emyrk/chronicle/internal/services"
	"github.com/google/uuid"
	"github.com/rs/zerolog"
	slogzerolog "github.com/samber/slog-zerolog/v2"

	"github.com/coder/serpent"
)

var _ services.Servicer = (*Service)(nil)

func Logger(broker *services.Services) *slog.Logger {
	ls := services.MustGet[*Service](broker)
	return ls.logger
}

func OnLogger() string {
	return (&Service{}).Name()
}

type Service struct {
	logger *slog.Logger
	broker *services.Services
}

func New(broker *services.Services) *Service {
	return &Service{
		logger: nil,
		broker: broker,
	}
}

func (s *Service) Name() string {
	return services.ServiceLogger
}
func (s *Service) Configures() []string { return []string{} }
func (s *Service) DependsOn() []string  { return []string{} }

func (s *Service) Start(ctx context.Context) error {
	var out io.Writer = zerolog.ConsoleWriter{Out: os.Stderr}
	if ok, _ := strconv.ParseBool(os.Getenv("CHRONICLE_JSON_LOGS")); ok {
		out = os.Stderr
	}

	zl := zerolog.New(out)
	logger := slog.New(slogzerolog.Option{Level: slog.LevelDebug, Logger: &zl}.NewZerologHandler())
	s.logger = logger.With(slog.String("deployment_id", uuid.NewString()))
	return nil
}

func (s *Service) Close(_ context.Context) error {
	return nil
}

func (s *Service) Options() serpent.OptionSet {
	return serpent.OptionSet{}
}
