package cli

import (
	"fmt"
	"path/filepath"

	"github.com/Emyrk/chronicle/database/gamedb/dbcdb"

	"github.com/coder/serpent"
)

func DerivedStaticsCmd() *serpent.Command {
	var assetsDir string
	var dbcPath string
	var server string

	return &serpent.Command{
		Use:   "derived-statics",
		Short: "Generate derived static JSON assets.",
		Options: serpent.OptionSet{
			{
				Name:        "assets-dir",
				Description: "Output directory for generated JSON asset files.",
				Flag:        "assets-dir",
				Value:       serpent.StringOf(&assetsDir),
			},
			DBCOption(&dbcPath),
			ServerOption(&server),
		},
		Handler: func(inv *serpent.Invocation) error {
			if assetsDir == "" {
				return fmt.Errorf("--assets-dir is required")
			}

			resolved, err := ResolveDBCPath(dbcPath, server)
			if err != nil {
				return err
			}
			wc, err := dbcdb.New(resolved)
			if err != nil {
				return fmt.Errorf("(derived statics) open wow client: %w", err)
			}

			if err := generateClassSpells(wc, assetsDir); err != nil {
				return fmt.Errorf("generate class spells: %w", err)
			}
			if err := generatePetTargetingAbilities(wc, assetsDir); err != nil {
				return fmt.Errorf("generate pet targeting abilities: %w", err)
			}
			// Talent trees and parser spell metadata are imported into dataset
			// tables by `dbcdata import` rather than generated as static files.

			return nil
		},
	}
}

func generateClassSpells(wc *dbcdb.WoWClient, assetsDir string) error {
	data, err := collectSpellsByClass(wc)
	if err != nil {
		return err
	}

	return writeJSON(filepath.Join(assetsDir, "class-spells.json"), data)
}
