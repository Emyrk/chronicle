package main

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
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
		demo(),
		jsonDump(),
	)
	return cmd
}

func jsonDump() *serpent.Command {
	var dbcPath string
	return &serpent.Command{
		Use:   "dump",
		Short: "Dump.",
		Options: serpent.OptionSet{
			{
				Name:        "dbc",
				Description: "Path to WoW client directory.",
				Flag:        "dbc",
				Value:       serpent.StringOf(&dbcPath),
				Default:     "/home/steven/Games/turtlewow/drive_c/Program Files (x86)/TurtleWoW",
			},
		},
		Handler: func(inv *serpent.Invocation) error {
			wc, err := dbcdb.New(dbcPath)
			if err != nil {
				return fmt.Errorf("open wow client: %w", err)
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
	return &serpent.Command{
		Use:   "demo",
		Short: "Demo.",
		Options: serpent.OptionSet{
			{
				Name:        "dbc",
				Description: "Path to WoW client directory.",
				Flag:        "dbc",
				Value:       serpent.StringOf(&dbcPath),
				Default:     "/home/steven/Games/turtlewow/drive_c/Program Files (x86)/TurtleWoW",
			},
		},
		Handler: func(inv *serpent.Invocation) error {
			wc, err := dbcdb.New(dbcPath)
			if err != nil {
				return fmt.Errorf("open wow client: %w", err)
			}

			spdb, err := wc.Spells()
			if err != nil {
				return fmt.Errorf("read spells: %w", err)
			}

			spdb.Range(func(cursor *dbdefs.Ent_Spell) bool {
				sp := chrondbc.SpellFromDB(cursor)
				if sp.Attrs.Has(chrondbc.AttrEx3_BlockableSpell) && !sp.AttackOutcome().Has(chrondbc.AttackOutcomeBlock) {
					fmt.Println(sp.Name_lang.String(), sp.ID, "is blockable")
				}
				return true
			})

			//_ = spdb.Range(func(cursor *dbdefs.Ent_SpellAuraNames) bool {
			//	fmt.Println(cursor.EnumID, cursor.Name_lang.String())
			//	return true
			//})

			spell, err := spdb.ID(44095)
			if err != nil {
				return fmt.Errorf("spell not found")
			}
			d, _ := json.Marshal(spell)
			fmt.Println(string(d))
			//c := make(map[int]int)
			//err = spdb.Range(func(cursor *dbdefs.Ent_Spell) bool {
			//	c[len(cursor.Reagent)]++

			//if cursor.Name_lang.String() == "Renew" {
			//	d, _ := json.Marshal(cursor)
			//	fmt.Println(string(d))
			//}
			//if len(cursor.Effect) != 3 {
			//	fmt.Println(cursor.Name_lang.String(), cursor.ID, cursor.Effect)
			//}
			//if len(cursor.ShapeshiftMask) > 1 {
			//	for i, e := range cursor.ShapeshiftMask {
			//		if i > 0 && e > highest {
			//			highest = e
			//		}
			//		if e != 0 {
			//			fmt.Println(cursor.ShapeshiftMask)
			//			fmt.Println(cursor.Name_lang.String(), cursor.ID, e)
			//			break
			//		}
			//	}
			//}
			//if len(cursor.Reagent) != 0 {
			//	for _, r := range cursor.Reagent {
			//		if r != 0 {
			//			fmt.Println(cursor.Name_lang.String(), cursor.ID, cursor.Reagent)
			//			d, _ := json.Marshal(cursor)
			//			fmt.Println(string(d))
			//			break
			//		}
			//	}
			//}
			//if cursor.ProcFlags > 0 {
			//	fmt.Println(cursor.ProcFlags)
			//	d, _ := json.Marshal(cursor)
			//	fmt.Println(string(d))
			//}
			//	return true
			//})
			//fmt.Println(c)

			if err != nil {
				return fmt.Errorf("iterate spells: %w", err)
			}

			//r, err := wc.SpellFocusObject()
			//if err != nil {
			//	return fmt.Errorf("read spells: %w", err)
			//}
			//
			//err = r.Range(func(cursor *dbdefs.Ent_SpellFocusObject) bool {
			//	//d, _ := json.Marshal(cursor)
			//	//fmt.Println(string(d))
			//	return true
			//})
			//if err != nil {
			//	return fmt.Errorf("iterate spells: %w", err)
			//}
			//fmt.Println(r.Len())

			return nil
		},
	}
}
