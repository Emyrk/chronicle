package servicerankings_test

import (
	"context"
	"fmt"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// These fixtures do not start the tenant service/pool hooks. Mirror production
// tenant session setup for worker transactions without mutating global hooks
// concurrently with the package's parallel tests or weakening fixture RLS.
type tenantTransactionStore struct{ database.Store }

func (s tenantTransactionStore) InTx(ctx context.Context, fn func(database.Store) error, opts *pgx.TxOptions) error {
	return s.Store.InTx(ctx, func(tx database.Store) error {
		raw, ok := database.PGXTx(tx)
		if !ok {
			return fmt.Errorf("expected test transaction")
		}
		if servicetenant.IsBypass(ctx) {
			if _, err := raw.Exec(ctx, `SELECT set_config('app.tenant_bypass','true',true)`); err != nil {
				return err
			}
		} else if tenant := servicetenant.TenantIDFromContext(ctx); tenant != uuid.Nil {
			if _, err := raw.Exec(ctx, `SELECT set_config('app.tenant_id',$1,true)`, tenant.String()); err != nil {
				return err
			}
		}
		return fn(tx)
	}, opts)
}
