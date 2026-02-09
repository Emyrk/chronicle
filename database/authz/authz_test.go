package authz_test

import (
	"testing"

	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/stretchr/testify/require"
)

func TestAuthz(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)

	logger := testutil.Logger(t)
	opts := authz.Options{
		GRPCURL:      "localhost:50051",
		PreSharedKey: "chronicle-dev-key",
		Logger:       logger,
	}

	az, err := authz.New(ctx, opts)
	require.NoError(t, err)

	az.Foo(ctx)
}
