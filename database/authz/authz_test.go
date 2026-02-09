package authz_test

import (
	"testing"

	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/stretchr/testify/require"
)

func TestAuthz(t *testing.T) {
	t.Parallel()

	logger := testutil.Logger(t)
	opts := authz.Options{
		GRPCURL:      "http://localhost:8443",
		PreSharedKey: "chronicle-dev-key",
		Logger:       logger,
	}

	az, err := authz.New(t.Context(), opts)
	require.NoError(t, err)

	az.Foo()
}
