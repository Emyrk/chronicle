// Package authztest provides helpers for spinning up an in-memory SpiceDB
// server for unit testing.
package authztest

import (
	"context"
	"fmt"
	"net"
	"strconv"
	"testing"
	"time"

	"github.com/authzed/gochugaru/client"
	"github.com/ory/dockertest/v3"
	"github.com/ory/dockertest/v3/docker"
	"golang.org/x/xerrors"

	"github.com/coder/retry"
)

const (
	spiceDBImage   = "authzed/spicedb"
	spiceDBVersion = "v1.38.0"
	// DefaultPresharedKey is the preshared key used for testing.
	// In serve-testing mode, any key works, but we use a consistent one.
	DefaultPresharedKey = "chronicle-test-key"
)

// SpiceDB represents a running SpiceDB test server.
type SpiceDB struct {
	// GRPCAddr is the address of the gRPC server (e.g., "localhost:50051").
	GRPCAddr string
	// HTTPAddr is the address of the HTTP server (e.g., "localhost:8443").
	HTTPAddr string
	// PresharedKey is the key to use for authentication.
	PresharedKey string

	pool     *dockertest.Pool
	resource *dockertest.Resource
}

// Options configures the SpiceDB test server.
type Options struct {
	// GRPCPort is the port to use for gRPC. If 0, a random port is allocated.
	GRPCPort int
	// HTTPPort is the port to use for HTTP. If 0, a random port is allocated.
	HTTPPort int
	// PresharedKey is the key to use for authentication. Defaults to DefaultPresharedKey.
	PresharedKey string
}

type Option func(*Options)

// WithGRPCPort sets the gRPC port for the SpiceDB server.
func WithGRPCPort(port int) Option {
	return func(o *Options) {
		o.GRPCPort = port
	}
}

// WithHTTPPort sets the HTTP port for the SpiceDB server.
func WithHTTPPort(port int) Option {
	return func(o *Options) {
		o.HTTPPort = port
	}
}

// WithPresharedKey sets the preshared key for authentication.
func WithPresharedKey(key string) Option {
	return func(o *Options) {
		o.PresharedKey = key
	}
}

// NewSpiceDB starts a new in-memory SpiceDB server using Docker.
// The server runs in "serve-testing" mode which provides isolated datastores
// per client-supplied auth token.
//
// Call Close() when done to clean up the container.
func NewSpiceDB(t testing.TB, opts ...Option) (*SpiceDB, error) {
	t.Helper()

	o := &Options{
		PresharedKey: DefaultPresharedKey,
	}
	for _, opt := range opts {
		opt(o)
	}

	pool, err := dockertest.NewPool("")
	if err != nil {
		return nil, xerrors.Errorf("create docker pool: %w", err)
	}

	// Configure port bindings
	grpcPortBinding := strconv.Itoa(o.GRPCPort)
	httpPortBinding := strconv.Itoa(o.HTTPPort)

	runOptions := dockertest.RunOptions{
		Repository: spiceDBImage,
		Tag:        spiceDBVersion,
		Cmd:        []string{"serve-testing"},
		PortBindings: map[docker.Port][]docker.PortBinding{
			"50051/tcp": {{
				HostIP:   "0.0.0.0",
				HostPort: grpcPortBinding,
			}},
			"8443/tcp": {{
				HostIP:   "0.0.0.0",
				HostPort: httpPortBinding,
			}},
		},
	}

	resource, err := pool.RunWithOptions(&runOptions, func(config *docker.HostConfig) {
		config.AutoRemove = true
		config.RestartPolicy = docker.RestartPolicy{Name: "no"}
	})
	if err != nil {
		return nil, xerrors.Errorf("start spicedb container: %w", err)
	}

	// Get the actual ports assigned
	grpcHostPort := resource.GetHostPort("50051/tcp")
	httpHostPort := resource.GetHostPort("8443/tcp")

	grpcHost, grpcPort, err := net.SplitHostPort(grpcHostPort)
	if err != nil {
		_ = pool.Purge(resource)
		return nil, xerrors.Errorf("parse grpc host port: %w", err)
	}

	spicedb := &SpiceDB{
		GRPCAddr:     net.JoinHostPort(grpcHost, grpcPort),
		HTTPAddr:     httpHostPort,
		PresharedKey: o.PresharedKey,
		pool:         pool,
		resource:     resource,
	}

	// Wait for SpiceDB to be ready
	if err := spicedb.waitForReady(t); err != nil {
		_ = pool.Purge(resource)
		return nil, xerrors.Errorf("wait for spicedb ready: %w", err)
	}

	return spicedb, nil
}

// waitForReady waits for SpiceDB to be ready to accept connections.
func (s *SpiceDB) waitForReady(t testing.TB) error {
	t.Helper()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	var lastErr error
	for r := retry.New(100*time.Millisecond, 15*time.Second); r.Wait(ctx); {
		// Try to establish a gRPC connection
		cli, err := client.NewPlaintext(s.GRPCAddr, s.PresharedKey)
		if err != nil {
			lastErr = err
			t.Logf("waiting for spicedb: connection failed: %v", err)
			continue
		}

		// Try a simple operation to verify the server is ready
		_, err = cli.WriteSchema(ctx, "definition user {}")
		if err != nil {
			lastErr = err
			t.Logf("waiting for spicedb: write schema failed: %v", err)
			continue
		}

		// Success!
		return nil
	}

	if lastErr != nil {
		return xerrors.Errorf("timeout waiting for spicedb: %w", lastErr)
	}
	return xerrors.Errorf("timeout waiting for spicedb")
}

// Close stops and removes the SpiceDB container.
func (s *SpiceDB) Close() error {
	if s.pool != nil && s.resource != nil {
		return s.pool.Purge(s.resource)
	}
	return nil
}

// Client returns a new gochugaru client connected to this SpiceDB instance.
func (s *SpiceDB) Client() (*client.Client, error) {
	return client.NewPlaintext(s.GRPCAddr, s.PresharedKey)
}

// NewClient is a convenience function that starts SpiceDB and returns a client.
// It registers cleanup with t.Cleanup().
func NewClient(t testing.TB, opts ...Option) (*client.Client, error) {
	t.Helper()

	spicedb, err := NewSpiceDB(t, opts...)
	if err != nil {
		return nil, err
	}

	t.Cleanup(func() {
		_ = spicedb.Close()
	})

	return spicedb.Client()
}

// MustNewClient is like NewClient but fails the test on error.
func MustNewClient(t testing.TB, opts ...Option) *client.Client {
	t.Helper()

	cli, err := NewClient(t, opts...)
	if err != nil {
		t.Fatalf("failed to create spicedb client: %v", err)
	}
	return cli
}

// MustNewSpiceDB is like NewSpiceDB but fails the test on error.
// It also registers cleanup with t.Cleanup().
func MustNewSpiceDB(t testing.TB, opts ...Option) *SpiceDB {
	t.Helper()

	spicedb, err := NewSpiceDB(t, opts...)
	if err != nil {
		t.Fatalf("failed to start spicedb: %v", err)
	}

	t.Cleanup(func() {
		_ = spicedb.Close()
	})

	return spicedb
}

// NewSpiceDBWithAddress is a helper that returns both the SpiceDB instance
// and a formatted address suitable for the authz.Options.GRPCUrl field.
// It uses t.Cleanup() to register cleanup automatically.
func NewSpiceDBWithAddress(t testing.TB, opts ...Option) (grpcURL string, presharedKey string) {
	t.Helper()

	spicedb := MustNewSpiceDB(t, opts...)
	// The authz package expects "localhost:port" format for plaintext connections
	host, port, _ := net.SplitHostPort(spicedb.GRPCAddr)
	if host == "" || host == "0.0.0.0" {
		host = "localhost"
	}
	return fmt.Sprintf("%s:%s", host, port), spicedb.PresharedKey
}
