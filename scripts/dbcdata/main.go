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
		cli.ExtractLoadingScreensCmd(),
		cli.ImportCmd(),
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
				if cursor.ID == 6603 {
					fmt.Println(cursor.Name_lang.String())
				}
				if cursor.Name_lang.String() == "Ice Shards" {
					fmt.Println(cursor.Description_lang.String())
				}
				return true
			})

			spdb, err := wc.LoadingScreens()
			if err != nil {
				return fmt.Errorf("read: %w", err)
			}

			_ = spdb.Range(func(cursor *dbdefs.Ent_LoadingScreens) bool {
				fmt.Println(cursor.Name, cursor.FileName)
				//for _, v := range cursor.EffectSpellClassMaskA {
				//	if v != 0 {
				//		sp := chrondbc.SpellFromDB(cursor)
				//		fmt.Println(sp.Name())
				//	}
				//}

				//sp := chrondbc.SpellFromDB(cursor)
				////if sp.Attrs.Has(chrondbc.AttrEx3_DeathPersistent) {
				////	fmt.Println(sp.Name_lang.String(), sp.ID, "is death persistent")
				////}
				//
				//for i, eff := range sp.Effect {
				//	var _ = i
				//	//if eff == chrondbc.EffectDistract {
				//	//	fmt.Println(sp.Name_lang.String(), sp.ID, "has a distract effect")
				//	//}
				//	if eff == chrondbc.EffectOpenLock {
				//		fmt.Println(sp.Name_lang.String(), sp.ID)
				//		break
				//	}
				//}

				//for _, eff := range sp.EffectAura {
				//	if eff == chrondbc.AuraEffectMechanicDurationMod || eff == chrondbc.AuraEffectModAuraDurationByDispel {
				//		fmt.Println(sp.Name_lang.String(), sp.ID, "has a duration mod dispel mechanic")
				//	}
				//}

				//if sp.Attrs.Has(chrondbc.AttrEx3_BlockableSpell) && !sp.AttackOutcome().Has(chrondbc.AttackOutcomeBlock) {
				//	fmt.Println(sp.Name_lang.String(), sp.ID, "is blockable")
				//}
				return true
			})
			//fmt.Println(masks)

			//_ = spdb.Range(func(cursor *dbdefs.Ent_SpellAuraNames) bool {
			//	fmt.Println(cursor.EnumID, cursor.Name_lang.String())
			//	return true
			//})
			//
			//spell, err := spdb.ID(44095)
			//if err != nil {
			//	return fmt.Errorf("spell not found")
			//}
			//d, _ := json.Marshal(spell)
			//fmt.Println(string(d))
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
