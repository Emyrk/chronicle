package servicelogger

import (
	"testing"

	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/testutil"
)

func NewTestLogger(t *testing.T, broker *services.Services) *Service {
	srv := New(broker)
	srv.logger = testutil.Logger(t)
	return srv
}
