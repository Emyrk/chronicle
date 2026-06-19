package cli

import (
	"context"
	"fmt"
	"path/filepath"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/coder/serpent"
)

func init() {
	serverWorldImporters["kronos"] = importWorldKronos
}

const kronosDataDir = "importdata/world/kronos"

// importWorldKronos imports world data for the Kronos server (Classic 1.12).
// Items are sourced from JSON files converted from the thatsmybis/classic-wow-item-db MySQL dumps.
// See scripts/convert_cmangos_sql_to_json.py for the conversion tool.
func importWorldKronos(ctx context.Context, pool *pgxpool.Pool, inv *serpent.Invocation, opts ImportWorldOptions) error {
	dataDir := kronosDataDir

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

	// Not needed for Kronos
	//if err := fixupMultiTierSets(ctx, pool, inv); err != nil {
	//	return fmt.Errorf("fixing up multi-tier sets: %w", err)
	//}

	return nil
}
