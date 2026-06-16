package cli

import (
	"context"
	"fmt"

	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/services/servicelogger"
	"github.com/Emyrk/chronicle/internal/services/servicewowdb"

	"github.com/coder/serpent"
)

func SpellInfo() *serpent.Command {
	cmd := &serpent.Command{
		Use:     "spellinfo <subcommand>",
		Options: []serpent.Option{},
		Children: []*serpent.Command{
			SpellExtraAttack(),
			NightfallEffect(),
		},
	}
	return cmd
}

func NightfallEffect() *serpent.Command {
	srvs := services.New()
	err := srvs.Register(
		servicelogger.New(srvs),
		servicewowdb.New(srvs),
	)
	if err != nil {
		panic(fmt.Sprintf("register service: %v", err))
	}
	optionSet := srvs.OptionSet()

	optionSet = append(optionSet, serpent.OptionSet{}...)

	cmd := &serpent.Command{
		Use:     "nightfall",
		Options: optionSet,
		Handler: func(i *serpent.Invocation) error {
			ctx, cancelApp := context.WithCancel(context.Background())
			defer cancelApp()

			logger := getLogger(i)
			err := srvs.Start(ctx, logger)
			if err != nil {
				return fmt.Errorf("start services: %w", err)
			}

			wdb := servicewowdb.WoWDB(srvs).GameDB()

			nfProc, err := wdb.Spell(context.Background(), 23605)
			if err != nil {
				return err
			}

			err = wdb.RangeSpells(func(spell *chrondbc.Spell) bool {
				if nfProc.Affects(*spell) {
					fmt.Printf("%d - %s\n", spell.ID, spell.String())
				}

				return true
			})
			if err != nil {
				return err
			}
			return nil
		},
	}
	return cmd
}

func SpellExtraAttack() *serpent.Command {
	srvs := services.New()
	err := srvs.Register(
		servicelogger.New(srvs),
		servicewowdb.New(srvs),
	)
	if err != nil {
		panic(fmt.Sprintf("register service: %v", err))
	}
	optionSet := srvs.OptionSet()

	optionSet = append(optionSet, serpent.OptionSet{}...)

	cmd := &serpent.Command{
		Use:     "extra-attack",
		Options: optionSet,
		Handler: func(i *serpent.Invocation) error {
			ctx, cancelApp := context.WithCancel(context.Background())
			defer cancelApp()

			logger := getLogger(i)
			err := srvs.Start(ctx, logger)
			if err != nil {
				return fmt.Errorf("start services: %w", err)
			}

			wdb := servicewowdb.WoWDB(srvs).GameDB()
			err = wdb.RangeSpells(func(spell *chrondbc.Spell) bool {
				for _, e := range spell.Effect {
					if e == chrondbc.EffectAddExtraAttacks {
						fmt.Printf("%d - %s\n", spell.ID, spell.String())
						break
					}
				}
				return true
			})
			if err != nil {
				return err
			}
			return nil
		},
	}
	return cmd
}
