package cli

import (
	"context"
	"fmt"
	"path/filepath"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/coder/serpent"
)

func init() {
	serverWorldImporters["octo"] = importWorldOcto
}

// importWorldOcto imports world data for OctoWoW.
// OctoWoW shares the same world data as Turtle WoW.
func importWorldOcto(ctx context.Context, pool *pgxpool.Pool, inv *serpent.Invocation, opts ImportWorldOptions) error {
	dataDir := turtleDataDir // same world dump as turtle

	detected, err := detectFiles(dataDir)
	if err != nil {
		return fmt.Errorf("detecting files: %w", err)
	}
	if len(detected) == 0 {
		return fmt.Errorf("no world data JSON files detected in %s", dataDir)
	}

	for file, table := range detected {
		_, _ = fmt.Fprintf(inv.Stderr, "detected: %s -> %s\n", file, table)
	}

	for file, table := range detected {
		filePath := filepath.Join(dataDir, file)
		n, err := importTable(ctx, pool, table, filePath, opts.DatasetID)
		if err != nil {
			return fmt.Errorf("importing %s: %w", table, err)
		}
		_, _ = fmt.Fprintf(inv.Stderr, "imported %s: %d rows\n", table, n)
	}

	return nil
}
