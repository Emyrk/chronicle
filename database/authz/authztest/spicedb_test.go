package authztest_test

import (
	"context"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database/authz/authztest"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/authzed/gochugaru/consistency"
	"github.com/authzed/gochugaru/rel"
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

// Run concurrently with the other helpers to exercise named-container startup.
func TestSharedSpiceDBIsolation(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	first := authztest.MustNewSpiceDB(t)
	second := authztest.MustNewSpiceDB(t)
	require.Equal(t, first.GRPCAddr, second.GRPCAddr)
	require.Equal(t, first.HTTPAddr, second.HTTPAddr)
	require.NotEqual(t, first.PresharedKey, second.PresharedKey)

	firstClient, err := first.Client()
	require.NoError(t, err)
	secondClient, err := second.Client()
	require.NoError(t, err)
	_, err = firstClient.WriteSchema(ctx, "definition first {}")
	require.NoError(t, err)
	_, err = secondClient.WriteSchema(ctx, "definition second {}")
	require.NoError(t, err)

	firstSchema, _, err := firstClient.ReadSchema(ctx)
	require.NoError(t, err)
	require.Contains(t, firstSchema, "definition first")
	require.NotContains(t, firstSchema, "definition second")
	secondSchema, _, err := secondClient.ReadSchema(ctx)
	require.NoError(t, err)
	require.Contains(t, secondSchema, "definition second")
	require.NotContains(t, secondSchema, "definition first")

	// Explicit tokens share a datastore, and readiness must not overwrite it.
	shared := authztest.MustNewSpiceDB(t, authztest.WithPresharedKey(first.PresharedKey))
	sharedClient, err := shared.Client()
	require.NoError(t, err)
	sharedSchema, _, err := sharedClient.ReadSchema(ctx)
	require.NoError(t, err)
	require.Equal(t, firstSchema, sharedSchema)

	// Closing any handle must not remove the shared container or its data.
	require.NoError(t, first.Close())
	require.NoError(t, first.Close())
	require.NoError(t, second.Close())
	afterClose := authztest.MustNewSpiceDB(t, authztest.WithPresharedKey(first.PresharedKey))
	require.Equal(t, first.GRPCAddr, afterClose.GRPCAddr)
	afterClient, err := afterClose.Client()
	require.NoError(t, err)
	afterSchema, _, err := afterClient.ReadSchema(ctx)
	require.NoError(t, err)
	require.Equal(t, firstSchema, afterSchema)
}

func TestSharedSpiceDBRelationshipIsolation(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	first := authztest.MustNewClient(t)
	second := authztest.MustNewClient(t)
	const schema = `
		definition user {}
		definition document {
			relation viewer: user
			permission view = viewer
		}
	`
	_, err := first.WriteSchema(ctx, schema)
	require.NoError(t, err)
	_, err = second.WriteSchema(ctx, schema)
	require.NoError(t, err)

	viewer := rel.MustFromTriple("document:readme", "viewer", "user:alice")
	var txn rel.Txn
	txn.Create(viewer)
	_, err = first.Write(ctx, txn)
	require.NoError(t, err)
	allowed, err := first.CheckOne(ctx, consistency.Full(), viewer)
	require.NoError(t, err)
	require.True(t, allowed)
	allowed, err = second.CheckOne(ctx, consistency.Full(), viewer)
	require.NoError(t, err)
	require.False(t, allowed)
}

func TestDedicatedSpiceDB(t *testing.T) {
	t.Parallel()
	shared := authztest.MustNewSpiceDB(t)
	dedicated, err := authztest.NewSpiceDB(t, authztest.WithDedicatedContainer())
	require.NoError(t, err)
	t.Cleanup(func() { require.NoError(t, dedicated.Close()) })
	require.NotEqual(t, shared.GRPCAddr, dedicated.GRPCAddr)
	require.NotEqual(t, shared.HTTPAddr, dedicated.HTTPAddr)
}
