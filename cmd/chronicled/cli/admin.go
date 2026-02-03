package cli

import (
	"fmt"

	"github.com/Emyrk/chronicle/database/spice"
	"github.com/google/uuid"

	"github.com/coder/serpent"
)

func SetAdmin() *serpent.Command {
	var (
		spiceDBURL  string
		postgresURL string
	)

	cmd := &serpent.Command{
		Use:        "admin",
		Middleware: serpent.RequireNArgs(1),
		Hidden:     true,
		Options: serpent.OptionSet{
			{
				Name:        "Postgres URL",
				Description: "Postgres URL to connect to.",
				Required:    false,
				Flag:        "postgres-url",
				Env:         "CHRONICLE_POSTGRES_URL",
				Default:     "postgresql://postgres:postgres@localhost:5433/chronicle?sslmode=disable",
				Value:       serpent.StringOf(&postgresURL),
			},
			{
				Name:        "SpiceDB URL",
				Description: "SpiceDB to connect to.",
				Required:    false,
				Flag:        "spicedb-url",
				Env:         "CHRONICLE_SPICEDB_URL",
				Default:     "localhost:50051",
				Value:       serpent.StringOf(&spiceDBURL),
			},
		},
		Handler: func(i *serpent.Invocation) error {
			ctx := i.Context()
			logger := getLogger(i)

			db, err := Database(ctx, logger, postgresURL)
			if err != nil {
				return err
			}

			sdb, err := spice.New(ctx, &spice.Options{
				GRPCURL: spiceDBURL,
				Logger:  logger,
				Store:   db,
				Debug:   true,
			})
			if err != nil {
				return fmt.Errorf("connect to spicedb: %w", err)
			}

			user, err := uuid.Parse(i.Args[0])
			if err != nil {
				return fmt.Errorf("parse user id: %w", err)
			}

			return sdb.MakeOwner(ctx, user)
		},
	}

	return cmd
}
