package database_test

import (
	"testing"

	"github.com/Emyrk/chronicle/database"
)

const testDBURL = "postgresql://postgres:postgres@localhost:5433/chronicle?sslmode=disable"

// TestWithMaxConns pins the pool bound. Without it the pgx default
// (max(4, numCPU)) is shared by the API and every background worker, so a few
// slow queries can starve the whole process.
func TestWithMaxConns(t *testing.T) {
	t.Parallel()

	cfg, _, err := database.PoolConfig(nil, testDBURL, database.WithMaxConns(20))
	if err != nil {
		t.Fatalf("pool config: %v", err)
	}
	if cfg.MaxConns != 20 {
		t.Errorf("MaxConns = %d, want 20", cfg.MaxConns)
	}
}

func TestWithMaxConnsZeroKeepsDefault(t *testing.T) {
	t.Parallel()

	def, _, err := database.PoolConfig(nil, testDBURL)
	if err != nil {
		t.Fatalf("pool config: %v", err)
	}

	cfg, _, err := database.PoolConfig(nil, testDBURL, database.WithMaxConns(0))
	if err != nil {
		t.Fatalf("pool config: %v", err)
	}
	if cfg.MaxConns != def.MaxConns {
		t.Errorf("MaxConns = %d, want the pgx default %d", cfg.MaxConns, def.MaxConns)
	}
}

// TestWithMaxConnsRespectsConnString lets a deployment tune the pool through
// the Postgres URL without also passing a flag.
func TestWithMaxConnsRespectsConnString(t *testing.T) {
	t.Parallel()

	cfg, _, err := database.PoolConfig(nil, testDBURL+"&pool_max_conns=7", database.WithMaxConns(20))
	if err != nil {
		t.Fatalf("pool config: %v", err)
	}
	if cfg.MaxConns != 7 {
		t.Errorf("MaxConns = %d, want 7 from the connection string", cfg.MaxConns)
	}
}
