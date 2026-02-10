package serviceauthz

import (
	"context"
	"testing"

	"github.com/Emyrk/chronicle/database/authz/authztest"
	"github.com/Emyrk/chronicle/internal/services"
	"github.com/stretchr/testify/require"
)

type TestAuthz struct {
	*Service
	t *testing.T
}

func NewTestAuthz(t *testing.T, broker *services.Services) *Service {
	db, err := authztest.NewSpiceDB(t)
	require.NoError(t, err)

	srv := New(broker)
	srv.grpcURL = db.GRPCAddr
	srv.presharedKey = db.PresharedKey

	t.Cleanup(func() {
		_ = srv.Close(context.Background())
		_ = db.Close()
	})
	return srv
}
