package cli

import (
	"fmt"
	"path/filepath"

	"github.com/Emyrk/chronicle/database/gamedb/dbcdb"

	"github.com/coder/serpent"
)

func DerivedStaticsCmd() *serpent.Command {
	var goDir string
	var tsDir string
	var assetsDir string
	var dbcPath string
	var server string

	return &serpent.Command{
		Use:   "derived-statics",
		Short: "Generate spell-derived static files for Go and TypeScript.",
		Options: serpent.OptionSet{
			{
				Name:        "go-dir",
				Description: "Output directory for generated Go files.",
				Flag:        "go-dir",
				Value:       serpent.StringOf(&goDir),
			},
			{
				Name:        "ts-dir",
				Description: "Output directory for generated TypeScript files.",
				Flag:        "ts-dir",
				Value:       serpent.StringOf(&tsDir),
			},
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
			if goDir == "" {
				return fmt.Errorf("--go-dir is required")
			}
			if tsDir == "" {
				return fmt.Errorf("--ts-dir is required")
			}

			resolved, err := ResolveDBCPath(dbcPath, server)
			if err != nil {
				return err
			}
			wc, err := dbcdb.New(resolved)
			if err != nil {
				return fmt.Errorf("(derived statics) open wow client: %w", err)
			}

			if err := generateDerivedPeriodicSpells(wc, goDir, server); err != nil {
				return fmt.Errorf("generate periodic spells: %w", err)
			}
			if err := generateDerivedExtraAttacks(wc, goDir, tsDir, server); err != nil {
				return fmt.Errorf("generate extra attack spells: %w", err)
			}
			if err := generateDerivedDurationModifiers(wc, goDir, server); err != nil {
				return fmt.Errorf("generate duration modifiers: %w", err)
			}
			if err := generateClassSpells(wc, assetsDir); err != nil {
				return fmt.Errorf("generate class spells: %w", err)
			}
			if err := generatePetTargetingAbilities(wc, assetsDir); err != nil {
				return fmt.Errorf("generate pet targeting abilities: %w", err)
			}
			// Talent trees are no longer generated as a static asset; they are
			// imported into the dataset_talent_trees table via the
			// `dbcdata import` command and served from the database.

			return nil
		},
	}
}

func generateDerivedPeriodicSpells(wc *dbcdb.WoWClient, goDir string, server string) error {
	entries, err := collectPeriodicSpells(wc)
	if err != nil {
		return err
	}

	return writeTemplate(filepath.Join(goDir, "periodicspells.go"), periodicSpellsGoTemplate, serverData{Server: server, Entries: entries}, server)
}

func generateDerivedExtraAttacks(wc *dbcdb.WoWClient, goDir, tsDir string, server string) error {
	entries, err := collectExtraAttackSpells(wc)
	if err != nil {
		return err
	}

	if err := writeTemplate(filepath.Join(goDir, "extraattack.go"), extraAttacksGoTemplate, serverData{Server: server, Entries: entries}, server); err != nil {
		return err
	}

	return writeTemplate(filepath.Join(tsDir, "ExtraAttack.ts"), extraAttacksTSTemplate, entries, server)
}

func generateClassSpells(wc *dbcdb.WoWClient, assetsDir string) error {
	data, err := collectSpellsByClass(wc)
	if err != nil {
		return err
	}

	return writeJSON(filepath.Join(assetsDir, "class-spells.json"), data)
}

func generateDerivedDurationModifiers(wc *dbcdb.WoWClient, goDir string, server string) error {
	data, err := collectDurationModifiers(wc)
	if err != nil {
		return err
	}

	return writeTemplate(filepath.Join(goDir, "durationmodifiers.go"), durationModifiersGoTemplate, serverData{Server: server, Entries: data}, server)
}
