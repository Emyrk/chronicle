package cli

import (
	"fmt"
	"os"
	"strconv"

	"github.com/Emyrk/chronicle/combatlog/parser/types"

	"github.com/coder/serpent"
)

func HitType() *serpent.Command {
	cmd := &serpent.Command{
		Use:        "hittype <number>",
		Aliases:    []string{"hit"},
		Middleware: serpent.RequireNArgs(1),
		Options:    []serpent.Option{},
		Handler: func(i *serpent.Invocation) error {
			ht, err := strconv.ParseUint(i.Args[0], 10, 64)
			if err != nil {
				return fmt.Errorf("parsing hittype %s: %w", i.Args[0], err)
			}

			htt := types.HitType(uint32(ht))
			_, _ = fmt.Fprintf(os.Stdout, "HitType: %d\n", htt)
			printType := func(n string, flag types.HitType) {
				out := ""
				if htt.Has(flag) {
					out = "true"
				}
				_, _ = fmt.Fprintf(os.Stdout, "%14s: %s\n", n, out)
			}

			printType("None", types.HitTypeNone)
			printType("Hit", types.HitTypeHit)
			printType("Offhand", types.HitTypeOffHand)
			printType("Mainhand", types.HitTypeMainHand)
			printType("Hit", types.HitTypeHit)
			printType("Crit", types.HitTypeCrit)
			printType("PartialResist", types.HitTypePartialResist)
			printType("FullResist", types.HitTypeFullResist)
			printType("Miss", types.HitTypeMiss)
			printType("PartialAbsorb", types.HitTypePartialAbsorb)
			printType("FullAbsorb", types.HitTypeFullAbsorb)
			printType("Glancing", types.HitTypeGlancing)
			printType("Crushing", types.HitTypeCrushing)
			printType("Evade", types.HitTypeEvade)
			printType("Dodge", types.HitTypeDodge)
			printType("Parry", types.HitTypeParry)
			printType("Immune", types.HitTypeImmune)
			printType("Environment", types.HitTypeEnvironment)
			printType("Deflect", types.HitTypeDeflect)
			printType("Interrupt", types.HitTypeInterrupt)
			printType("PartialBlock", types.HitTypePartialBlock)
			printType("FullBlock", types.HitTypeFullBlock)
			printType("Split", types.HitTypeSplit)
			printType("Reflect", types.HitTypeReflect)
			printType("Periodic", types.HitTypePeriodic)

			return nil
		},
	}
	return cmd
}

func SchoolType() *serpent.Command {
	cmd := &serpent.Command{
		Use:        "schooltype <number>",
		Aliases:    []string{"school"},
		Middleware: serpent.RequireNArgs(1),
		Options:    []serpent.Option{},
		Handler: func(i *serpent.Invocation) error {
			ht, err := strconv.ParseUint(i.Args[0], 10, 64)
			if err != nil {
				return fmt.Errorf("parsing hittype %s: %w", i.Args[0], err)
			}

			htt := types.School(uint32(ht))
			_, _ = fmt.Fprintf(os.Stdout, "HitType: %d\n", htt)
			printType := func(n string, flag types.School) {
				out := ""
				if htt.Has(flag) {
					out = "true"
				}
				_, _ = fmt.Fprintf(os.Stdout, "%14s: %s\n", n, out)
			}

			printType("None", types.PhysicalSchool)
			printType("Hit", types.HolySchool)
			printType("Offhand", types.FireSchool)
			printType("Hit", types.NatureSchool)
			printType("Crit", types.FrostSchool)
			printType("PartialResist", types.ShadowSchool)
			printType("FullResist", types.ArcaneSchool)

			return nil
		},
	}
	return cmd
}
