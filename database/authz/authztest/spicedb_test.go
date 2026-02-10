package authztest_test

import (
	"context"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database/authz/authztest"
	"github.com/stretchr/testify/require"
)

func TestNewSpiceDB(t *testing.T) {
	t.Parallel()

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	spicedb := authztest.MustNewSpiceDB(t)
	require.NotEmpty(t, spicedb.GRPCAddr)
	require.NotEmpty(t, spicedb.PresharedKey)

	// Get a client and verify it works
	cli, err := spicedb.Client()
	require.NoError(t, err)

	// Write a simple schema
	_, err = cli.WriteSchema(ctx, `
		definition user {}
		definition document {
			relation viewer: user
			permission view = viewer
		}
	`)
	require.NoError(t, err)

	t.Log("SpiceDB is running at", spicedb.GRPCAddr)
}

func TestMustNewClient(t *testing.T) {
	t.Parallel()

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	cli := authztest.MustNewClient(t)

	// Write a schema to verify the client works
	_, err := cli.WriteSchema(ctx, `definition user {}`)
	require.NoError(t, err)
}

func TestNewSpiceDBWithAddress(t *testing.T) {
	t.Parallel()

	grpcURL, psk := authztest.NewSpiceDBWithAddress(t)

	require.NotEmpty(t, grpcURL)
	require.NotEmpty(t, psk)
	require.Contains(t, grpcURL, "localhost:")
	t.Logf("gRPC URL: %s, PSK: %s", grpcURL, psk)
}
