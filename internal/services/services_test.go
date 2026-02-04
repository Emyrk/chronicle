package services_test

import (
	"testing"

	"github.com/Emyrk/chronicle/internal/services"
)

func TestServices(t *testing.T) {
	t.Parallel()

	srvs := services.New()
	var _ = srvs
}
