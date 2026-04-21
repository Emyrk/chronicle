package cli

import (
	"context"
	"fmt"
	"path/filepath"

	"github.com/Emyrk/chronicle/database/gamedb/dbcdb"
	dbcdatacli "github.com/Emyrk/chronicle/scripts/dbcdata/cli"
	"github.com/coder/serpent"
	"github.com/jackc/pgx/v5/pgxpool"
)

func init() {
	serverWorldImporters["warmane"] = importWorldWarmane
}

const warmaneDataDir = "importdata/world/warmane"

// importWorldWarmane imports world data for the Warmane server (WotLK 3.3.5a).
// Items are sourced from JSON files converted from the cmangos/wotlk-db MySQL dumps.
// See scripts/convert_cmangos_sql_to_json.py for the conversion tool.
func importWorldWarmane(ctx context.Context, pool *pgxpool.Pool, inv *serpent.Invocation, _ ImportWorldOptions) error {
	dataDir := warmaneDataDir

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
		n, err := importTable(ctx, pool, table, filePath)
		if err != nil {
			return fmt.Errorf("importing %s: %w", table, err)
		}
		_, _ = fmt.Fprintf(inv.Stderr, "imported %s: %d rows\n", table, n)
	}

	wowDir := dbcdatacli.DefaultClientPath("warmane")
	if wowDir != "" {
		_, _ = fmt.Fprintf(inv.Stderr, "importing DBC data from %s\n", wowDir)
		wc, err := dbcdb.New(wowDir)
		if err != nil {
			return fmt.Errorf("opening WoW client at %s: %w", wowDir, err)
		}
		if err := importDBCTables(ctx, pool, wc, inv); err != nil {
			return fmt.Errorf("importing DBC tables: %w", err)
		}
	} else {
		_, _ = fmt.Fprintf(inv.Stderr, "no WoW client path for warmane; skipping DBC import\n")
	}

	if err := fixupMultiTierSets(ctx, pool, inv); err != nil {
		return fmt.Errorf("fixing up multi-tier sets: %w", err)
	}

	return nil
}
