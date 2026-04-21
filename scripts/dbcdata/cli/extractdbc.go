package cli

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/Emyrk/chronicle/database/gamedb/dbcdb"

	"github.com/coder/serpent"
)

func ExtractDBCCmd() *serpent.Command {
	var dbcPath string
	var server string
	var outDir string

	return &serpent.Command{
		Use:   "extract-dbc",
		Short: "Extract raw DBC files from a WoW client directory.",
		Options: serpent.OptionSet{
			DBCOption(&dbcPath),
			ServerOption(&server),
			{
				Name:        "out",
				Description: "Output directory for extracted DBC files.",
				Flag:        "out",
				Value:       serpent.StringOf(&outDir),
			},
		},
		Handler: func(inv *serpent.Invocation) error {
			if outDir == "" {
				return fmt.Errorf("--out is required")
			}

			resolved, err := ResolveDBCPath(dbcPath, server)
			if err != nil {
				return err
			}
			wc, err := dbcdb.New(resolved)
			if err != nil {
				return fmt.Errorf("(extract dbc) open wow client: %w", err)
			}

			if err := extractSpellDBC(wc, outDir); err != nil {
				return fmt.Errorf("extract spell.dbc: %w", err)
			}

			return nil
		},
	}
}

func extractSpellDBC(wc *dbcdb.WoWClient, outDir string) error {
	data, err := wc.SpellDBCBytes()
	if err != nil {
		return err
	}

	if err := os.MkdirAll(outDir, 0o755); err != nil {
		return err
	}

	return os.WriteFile(filepath.Join(outDir, "Spell.dbc"), data, 0o644)
}
