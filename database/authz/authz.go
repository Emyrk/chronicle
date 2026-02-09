package authz

import (
	"context"
	"fmt"
	"log/slog"
	"strings"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/authzed/gochugaru/client"
	"github.com/authzed/gochugaru/rel"
)

const globalNamespace = "chronicle"

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

	rev, err := spice.WriteSchema(ctx, policy.Schema)
	if err != nil {
		return nil, fmt.Errorf("write schema: %w", err)
	}
	fmt.Println(rev)

	return &Authz{
		spice:  spice,
		logger: opts.Logger,
		db:     opts.DB,
	}, nil
}

func (a *Authz) Foo(ctx context.Context) {
	var txn rel.Txn
	//txn.Touch(rel.FromTuple())

	//a.spice.Write()
	var _ = txn
	//txn.Touch()
	//rel.FromObjects()
}
