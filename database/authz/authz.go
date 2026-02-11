package authz

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz/policy"
	v1 "github.com/authzed/authzed-go/proto/authzed/api/v1"
	"github.com/authzed/gochugaru/client"
	"github.com/authzed/gochugaru/rel"
	"github.com/jackc/pgx/v5"
)

var _ database.StoreQueries = (*Authz)(nil)

type Options struct {
	GRPCURL      string
	PreSharedKey string
	Logger       *slog.Logger
	DB           database.Store
}

type Authz struct {
	spice  *client.Client
	logger *slog.Logger
	db     database.Store

	*interceptor
}

func New(ctx context.Context, opts Options) (*Authz, error) {
	var spice *client.Client
	var err error
	if strings.Contains(opts.GRPCURL, "localhost") {
		spice, err = client.NewPlaintext(opts.GRPCURL, opts.PreSharedKey)
	} else {
		spice, err = client.NewSystemTLS(opts.GRPCURL, opts.PreSharedKey)
	}
	if err != nil {
		return nil, fmt.Errorf("init authz client: %w", err)
	}

	_, err = spice.WriteSchema(ctx, policy.Schema)
	if err != nil {
		return nil, fmt.Errorf("write schema: %w", err)
	}

	z := &Authz{
		spice:  spice,
		logger: opts.Logger,
		db:     opts.DB,
	}

	// By default, writes do not happen in a transaction.
	z.interceptor = &interceptor{
		Authorizer: z,
		store:      z.db,
	}

	return z, nil
}

func (z *Authz) Close() error {
	return nil
}

func (z *Authz) Ping(ctx context.Context) (time.Duration, error) {
	return z.db.Ping(ctx)
}

var _ Authorizer = (*AuthzTX)(nil)

type AuthzTX struct {
	parent    *Authz
	tx        database.Store
	relations rel.Txn

	*interceptor
}

func (z *Authz) wrap(tx database.Store) *AuthzTX {
	spiceTx := &AuthzTX{
		parent:    z,
		tx:        tx,
		relations: rel.Txn{},
	}

	spiceTx.interceptor = &interceptor{
		Authorizer: spiceTx,
		store:      spiceTx,
	}

	return spiceTx
}

func (z *Authz) InTx(f func(tx *AuthzTX) error, opts *pgx.TxOptions) error {
	var wrapped *AuthzTX
	txErr := z.db.InTx(func(nestedTX database.Store) error {
		wrapped = z.wrap(nestedTX)
		return f(wrapped)
	}, opts)

	if txErr != nil {
		reverts := rel.Txn{}
		for _, update := range wrapped.relations.V1Updates {
			switch update.GetOperation() {
			case v1.RelationshipUpdate_OPERATION_TOUCH:
				reverts.Delete(*rel.FromV1Proto(update.Relationship))
			case v1.RelationshipUpdate_OPERATION_DELETE:
				reverts.Create(*rel.FromV1Proto(update.Relationship))
			case v1.RelationshipUpdate_OPERATION_CREATE:
				reverts.Delete(*rel.FromV1Proto(update.Relationship))
			}
		}
		_, revertErr := z.spice.Write(context.Background(), reverts)
		if revertErr != nil {
			z.logger.Error("failed to revert authz transaction after error", "revertErr", revertErr, "originalErr", txErr)
		}
		return txErr
	}

	return nil
}

func (z *AuthzTX) Ping(ctx context.Context) (time.Duration, error) {
	return z.parent.Ping(ctx)
}

func (z *AuthzTX) Close() error {
	return z.parent.Close()
}

func (z *AuthzTX) InTx(f func(database.Store) error, _ *pgx.TxOptions) error {
	// Already in a transaction
	return f(z)
}
