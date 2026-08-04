package authz

import (
	"context"
	"log/slog"

	"github.com/Emyrk/chronicle/database"
	"github.com/authzed/gochugaru/rel"
)

// noopAuthorizer satisfies the Authorizer interface without calling SpiceDB.
// It is used by NewDatabaseOnly for CLI tools that only need database access.
type noopAuthorizer struct{}

func (noopAuthorizer) Write(_ context.Context, _ rel.Txn) (string, error) { return "", nil }
func (noopAuthorizer) Delete(_ context.Context, _ *rel.PreconditionedFilter) error {
	return nil
}

// NewDatabaseOnly returns an *Authz that delegates all queries to the
// underlying database.Store without requiring a SpiceDB connection. This is
// useful for offline CLI tools (e.g. resync) that run administrative queries
// but never need authorization checks.
func NewDatabaseOnly(logger *slog.Logger, db database.Store) *Authz {
	z := &Authz{
		logger: logger,
		db:     db,
	}
	z.interceptor = &interceptor{
		Authorizer: noopAuthorizer{},
		Store:      db,
	}
	return z
}
