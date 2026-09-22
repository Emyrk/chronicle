package main

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/Emyrk/chronicle/database/gamedb/dbcdb"
	"github.com/Emyrk/chronicle/scripts/dbcdata/cli"
	"github.com/Gophercraft/core/format/dbc/dbdefs"

	"github.com/coder/serpent"
)

func main() {
	err := rootCmd().Invoke().WithOS().Run()
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func rootCmd() *serpent.Command {
	cmd := &serpent.Command{
		Use:     "dbcdata",
		Short:   "Generate Go code from DBC files.",
		Handler: serpent.DefaultHelpFn(),
	}
	cmd.AddSubcommands(
		cli.StaticPopulateCmd(),
		cli.DerivedStaticsCmd(),
		cli.SpellTestDataCmd(),
		cli.ExtractDBCCmd(),
		cli.ExtractIconsCmd(),
		cli.ExtractWowdataIconsCmd(),
		cli.ExtractLoadingScreensCmd(),
		cli.ExtractTalentBackgroundsCmd(),
		cli.ImportCmd(),
		cli.ImportWowdataCmd(),
		demo(),
		jsonDump(),
	)
	return cmd
}

func jsonDump() *serpent.Command {
	var dbcPath string
	var server string
	return &serpent.Command{
		Use:   "dump",
		Short: "Dump.",
		Options: serpent.OptionSet{
			cli.DBCOption(&dbcPath),
			cli.ServerOption(&server),
		},
		Handler: func(inv *serpent.Invocation) error {
			resolved, err := cli.ResolveDBCPath(dbcPath, server)
			if err != nil {
				return err
			}
			wc, err := dbcdb.New(resolved)
			if err != nil {
				return fmt.Errorf("(dump) open wow client: %w", err)
			}

			var cpy []dbdefs.Ent_ItemSubClass
			id, err := wc.ItemSubClass()
			if err != nil {
				return fmt.Errorf("read spells: %w", err)
			}

			err = id.Range(func(cursor *dbdefs.Ent_ItemSubClass) bool {
				cpy = append(cpy, *cursor)
				return true
			})
			if err != nil {
				return fmt.Errorf("iterate spells: %w", err)
			}

			d, _ := json.Marshal(cpy)
			fmt.Println(string(d))
			return nil
		},
	}
}

func demo() *serpent.Command {
	var dbcPath string
	var server string
	return &serpent.Command{
		Use:   "demo",
		Short: "Demo.",
		Options: serpent.OptionSet{
			cli.DBCOption(&dbcPath),
			cli.ServerOption(&server),
		},
		Handler: func(inv *serpent.Invocation) error {
			resolved, err := cli.ResolveDBCPath(dbcPath, server)
			if err != nil {
				return err
			}
			wc, err := dbcdb.New(resolved)
			if err != nil {
				return fmt.Errorf("(demo) open wow client: %w", err)
			}

			spells, err := wc.Spells()
			if err != nil {
				return fmt.Errorf("read spells: %w", err)
			}

			_ = spells.Range(func(cursor *dbdefs.Ent_Spell) bool {
				fmt.Println(cursor.ID, cursor)
				return true
			})

			return nil
		},
	}
}
