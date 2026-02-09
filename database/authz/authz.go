package authz

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/Emyrk/chronicle/database"
	"github.com/authzed/gochugaru/client"
	"github.com/authzed/gochugaru/rel"
)

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
}

func New(ctx context.Context, opts Options) (*Authz, error) {
	spice, err := client.NewSystemTLS(opts.GRPCURL, opts.PreSharedKey)
	if err != nil {
		return nil, fmt.Errorf("init authz client: %w", err)
	}

	return &Authz{
		spice:  spice,
		logger: opts.Logger,
		db:     opts.DB,
	}, nil
}

func (a *Authz) Foo() {
	var txn rel.Txn

	//txn.Touch()
	//rel.FromObjects()
}
