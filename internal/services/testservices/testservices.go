package testservices

import (
	"testing"

	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/services/serviceauthz"
	"github.com/Emyrk/chronicle/internal/services/servicedbstore"
	"github.com/Emyrk/chronicle/internal/services/servicelogger"
	"github.com/Emyrk/chronicle/internal/services/servicepgxpool"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/stretchr/testify/require"
)

func Authz(t *testing.T) *services.Services {
	t.Helper()

	srvs := services.New()
	err := srvs.Register(
		servicelogger.NewTestLogger(t, srvs),
		serviceauthz.NewTestAuthz(t, srvs),
		servicedbstore.New(srvs),
		servicepgxpool.NewTestPGXPool(t, srvs),
	)
	require.NoError(t, err)

	logger := servicelogger.Logger(srvs)
	ctx := testutil.Context(t, testutil.WaitShort)
	err = srvs.Start(ctx, logger)
	require.NoError(t, err)

	return srvs
}
