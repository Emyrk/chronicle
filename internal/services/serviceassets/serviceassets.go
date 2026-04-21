package serviceassets

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"regexp"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/services/servicelogger"

	"github.com/coder/serpent"
)

var _ services.Servicer = (*Service)(nil)

// validAssetFilename allows only kebab-case .json filenames.
var validAssetFilename = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*\.json$`)

func OnAssets() string {
	return (&Service{}).Name()
}

func Assets(broker *services.Services) *Service {
	return services.MustGet[*Service](broker)
}

type Service struct {
	broker *services.Services
	dir    string
}

func New(broker *services.Services) *Service {
	return &Service{
		broker: broker,
	}
}

func (s *Service) Name() string                  { return services.ServiceAssets }
func (s *Service) Configures() []string          { return nil }
func (s *Service) Close(_ context.Context) error { return nil }

func (s *Service) DependsOn() []string {
	return []string{
		servicelogger.OnLogger(),
	}
}

func (s *Service) Options() serpent.OptionSet {
	return serpent.OptionSet{
		{
			Name:        "assets-generated-dir",
			Description: "Directory for generated JSON asset files.",
			Flag:        "assets-generated-dir",
			Default:     "./assets/" + services.ServerName + "/generated",
			Env:         "CHRONICLE_ASSETS_GENERATED_DIR",
			Value:       serpent.StringOf(&s.dir),
		},
	}
}

func (s *Service) Start(_ context.Context) error {
	logger := servicelogger.Logger(s.broker)
	if _, err := os.Stat(s.dir); os.IsNotExist(err) {
		logger.Warn("assets generated directory does not exist",
			slog.String("dir", s.dir),
		)
	}
	return nil
}

// Dir returns the assets generated directory path (for generators).
func (s *Service) Dir() string { return s.dir }

// ReadFile reads a generated asset by filename.
func (s *Service) ReadFile(filename string) ([]byte, error) {
	return os.ReadFile(filepath.Join(s.dir, filename))
}

// ServeHTTP serves generated JSON assets at /{filename}.
// Only kebab-case .json filenames are allowed. Responses are cached for 1 day.
func (s *Service) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// Extract filename from the remaining path after mount point.
	filename := filepath.Base(r.URL.Path)
	if !validAssetFilename.MatchString(filename) {
		httpapi.Write(r.Context(), w, http.StatusNotFound, chroniclesdk.Response{
			Message: "Not found.",
		})
		return
	}

	if !filepath.IsLocal(filename) {
		httpapi.Forbidden(w, errors.New("invalid filename"))
		return
	}

	data, err := s.ReadFile(filename)
	if err != nil {
		httpapi.Write(r.Context(), w, http.StatusNotFound, chroniclesdk.Response{
			Message: "Not found.",
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "public, max-age=86400") // 1 day
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}
