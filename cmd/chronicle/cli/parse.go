package cli

import (
	"bytes"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/combatlog/consumers"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/logfile"
	"github.com/Emyrk/chronicle/combatlog/parser/merge"
	"github.com/Emyrk/chronicle/combatlog/parser/sorter"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/parserv2"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/consumeeach"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/creatures"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/zoner"
	"github.com/Emyrk/chronicle/database/gamedb"
	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/services/servicelogger"
	"github.com/Emyrk/chronicle/internal/services/servicewowdb"

	"github.com/coder/serpent"
)

func defaultSpellDBCPath() string {
	return "./assets/" + services.ServerName + "/Spell.dbc"
}

func ParseV2Cmd() *serpent.Command {
	var (
		dumpMetrics bool
	)

	srvs := services.New()
	err := srvs.Register(
		servicelogger.New(srvs),
		servicewowdb.New(srvs),
	)
	if err != nil {
		panic(fmt.Sprintf("register service: %v", err))
	}
	optionSet := srvs.OptionSet()

	profileOpt, profileMW := ProfileCommand()
	optionSet = append(optionSet, serpent.OptionSet{
		{
			Name:        "dump-metrics",
			Description: "Print metrics information after parsing.",
			Required:    false,
			Flag:        "metrics",
			Value:       serpent.BoolOf(&dumpMetrics),
		},
		profileOpt,
	}...)

	cmd := &serpent.Command{
		Use:        "parsev2 <file>",
		Middleware: serpent.Chain(serpent.RequireNArgs(1), profileMW),
		Options:    optionSet,
		Handler: func(i *serpent.Invocation) error {
			ctx := i.Context()
			logger := getLogger(i)
			err := srvs.Start(ctx, logger)
			if err != nil {
				return fmt.Errorf("starting services: %w", err)
			}

			files, err := openFileReaders(i.Args[0])
			if err != nil {
				return err
			}
			defer func() { closeFiles(files...) }()

			p, err := parserv2.New(logger, files[0], servicewowdb.WoWDB(srvs).GameDB(), nil)
			if err != nil {
				return fmt.Errorf("creating parser: %w", err)
			}

			output := encounters.New(ctx, logger)
			c := consumers.New(logger, output)
			err = c.ConsumeAll(ctx, p)
			if err != nil {
				return err
			}

			for _, inst := range output.Instances {
				logger.Info("Parsed instance",
					slog.String("name", inst.Name()),
				)

				enc, err := inst.Finalize(ctx)
				if err != nil {
					return fmt.Errorf("finalizing instance %q: %w", inst.Name(), err)
				}
				for _, e := range enc.Encounters {
					fmt.Println(e.NamedString(output.Units))
				}
			}

			consumerLog := logger.With("component", "consumers")
			for k, v := range c.Times() {
				consumerLog = consumerLog.With(slog.String(k+"_duration", v.String()))
			}
			consumerLog.Info("Consumer processing times")

			//mets := p.Metrics()
			//logger.Info("Parsing complete",
			//	slog.Int64("total_lines_parsed", mets.TotalLinesParsed),
			//	slog.String("total_parse_duration", mets.TotalParseDuration.String()),
			//	slog.String("average_line_parse_duration", (mets.TotalParseDuration/time.Duration(mets.TotalLinesParsed)).String()),
			//	slog.String("total_unmatched_time", mets.UnmatchedTime.String()),
			//)
			//if dumpMetrics {
			//	fmt.Println(mets.Format())
			//}
			return nil
		},
	}

	return cmd
}

func ParseCmd() *serpent.Command {
	var (
		dumpMetrics bool
	)
	profileOpt, profileMW := ProfileCommand()
	cmd := &serpent.Command{
		Use:        "parse <file> <file>",
		Middleware: serpent.Chain(serpent.RequireNArgs(2), profileMW),
		Options: serpent.OptionSet{
			profileOpt,
			{
				Name:        "dump-metrics",
				Description: "Print metrics information after parsing.",
				Required:    false,
				Flag:        "metrics",
				Value:       serpent.BoolOf(&dumpMetrics),
			},
		},
		Handler: func(i *serpent.Invocation) error {
			ctx := i.Context()
			logger := getLogger(i)

			files, err := openFileReaders(i.Args[0], i.Args[1])
			if err != nil {
				return err
			}
			defer func() { closeFiles(files...) }()

			m := vanilla.Merger(logger)
			liner, scan, err := m.LineScanner(ctx, nil, logfile.New(nil, files[0]), logfile.New(nil, files[1]))
			if err != nil {
				return err
			}

			p := vanilla.NewFromScanner(logger, liner, scan, nil)
			output := encounters.New(ctx, logger)
			c := consumers.New(logger, output)
			err = c.ConsumeAll(ctx, p)
			if err != nil {
				return err
			}

			for _, inst := range output.Instances {
				logger.Info("Parsed instance",
					slog.String("name", inst.Name()),
				)

				enc, err := inst.Finalize(ctx)
				if err != nil {
					return fmt.Errorf("finalizing instance %q: %w", inst.Name(), err)
				}
				for _, e := range enc.Encounters {
					fmt.Println(e.NamedString(output.Units))
				}
			}

			consumerLog := logger.With("component", "consumers")
			for k, v := range c.Times() {
				consumerLog = consumerLog.With(slog.String(k+"_duration", v.String()))
			}
			consumerLog.Info("Consumer processing times")

			mets := p.Metrics()
			logger.Info("Parsing complete",
				slog.Int64("total_lines_parsed", mets.TotalLinesParsed),
				slog.String("total_parse_duration", mets.TotalParseDuration.String()),
				slog.String("average_line_parse_duration", (mets.TotalParseDuration/time.Duration(mets.TotalLinesParsed)).String()),
				slog.String("total_unmatched_time", mets.UnmatchedTime.String()),
			)
			if dumpMetrics {
				fmt.Println(mets.Format())
			}
			return nil
		},
	}

	return cmd
}

func CreaturesCmd() *serpent.Command {
	dumpSpells := false
	cmd := &serpent.Command{
		Options: serpent.OptionSet{
			{
				Name:        "Dump Spells",
				Description: "Print spells cast by each unit after parsing.",
				Required:    false,
				Flag:        "dump-spells",
				Value:       serpent.BoolOf(&dumpSpells),
			},
		},
		Use:        "creatures <file> [file]",
		Middleware: serpent.RequireRangeArgs(1, 2),
		Handler: func(i *serpent.Invocation) error {
			ctx := i.Context()
			logger := getLogger(i)

			files, err := openFileReaders(i.Args...)
			if err != nil {
				return err
			}
			defer func() { closeFiles(files...) }()

			var p consumers.Advancer
			if len(files) == 1 {
				// v2 parser for single file
				wowDB, err := gamedb.New(ctx, gamedb.Options{
					SpellsDBCPath: defaultSpellDBCPath(),
				})
				if err != nil {
					return fmt.Errorf("creating wowdb: %w", err)
				}
				p, err = parserv2.New(logger, files[0], wowDB, nil)
				if err != nil {
					return fmt.Errorf("creating parser: %w", err)
				}
			} else {
				// v1 parser with merging for two files
				fileOne := &bytes.Buffer{}
				sum, ri1, err := sorter.SortLogs(ctx, logger, files[0], fileOne)
				if err != nil {
					return fmt.Errorf("sorting logs: %w", err)
				}

				fileTwo := &bytes.Buffer{}
				sum2, ri2, err := sorter.SortLogs(ctx, logger, files[1], fileTwo)
				if err != nil {
					return fmt.Errorf("sorting logs: %w", err)
				}

				ri := ri1
				if ri == nil {
					ri = ri2
				}

				m := vanilla.Merger(logger)
				liner, scan, err := m.LineScanner(ctx, ri, logfile.New(&sum.IsRaw, fileOne), logfile.New(&sum2.IsRaw, fileTwo))
				if err != nil {
					return err
				}

				p = vanilla.NewFromScanner(logger, liner, scan, nil)
			}

			output := creatures.New(logger)
			err = output.Consume(ctx, p)
			if err != nil {
				return err
			}

			for z, units := range output.ZonedUnits {
				zoneSpells := make(map[string]struct{})
				fmt.Printf("Zone: %s with %d spells\n", z, len(output.ZoneSpells[z]))
				for id, name := range units {
					fmt.Printf("  %d: %q, // %d times\n", id, name, len(output.UnitQuantity[id]))
					if dumpSpells {
						if spells, ok := output.UnitSpells[id]; ok {
							fmt.Printf("    Spells cast:\n")
							for spell := range spells {
								zoneSpells[spell] = struct{}{}
								fmt.Printf("      %s\n", spell)
							}
						}
					}
					if dumpSpells {
						fmt.Printf("  Zone %s had spell cast:\n", z)
						for spellName := range zoneSpells {
							fmt.Printf("      %s\n", spellName)
						}
					}
				}
				fmt.Println()

				if len(output.UnknownUnits[z]) > 0 {
					fmt.Println("Unknown units:")
					for entryID, count := range output.UnknownUnits[z] {
						fmt.Printf("  %d: %d\n", entryID, count)
					}
				}
			}

			return nil
		},
	}

	return cmd
}

func Zoner() *serpent.Command {
	cmd := &serpent.Command{
		Use:        "zoner <file> <file>",
		Middleware: serpent.RequireNArgs(2),
		Handler: func(i *serpent.Invocation) error {
			ctx := i.Context()
			logger := getLogger(i)

			files, err := openFileReaders(i.Args[0], i.Args[1])
			if err != nil {
				return err
			}
			defer func() { closeFiles(files...) }()

			m := vanilla.Merger(logger, merge.WithoutTimeAdjustments())
			liner, scan, err := m.LineScanner(ctx, nil, logfile.New(nil, files[0]), logfile.New(nil, files[1]))
			if err != nil {
				return err
			}
			z := zoner.NewLocation()

			var lastMessage time.Time
			var last time.Time
			each := consumeeach.New(func(m messages.Message) error {
				lastMessage = m.Date()
				switch ty := m.(type) {
				case *messages.Zone:
					was := z.Name
					if z.Process(*ty) {
						if last.IsZero() {
							last = ty.Timestamp
						}
						fmt.Printf("Zone changed (was %s): %s, in for %s\n", was, z.Name, ty.Timestamp.Sub(last).String())
						last = ty.Timestamp
					}
				}
				return nil
			})

			p := vanilla.NewFromScanner(logger, liner, scan, nil)
			err = consumers.New(logger, each).ConsumeAll(ctx, p)
			if err != nil {
				return err
			}
			fmt.Printf("last zone for %s\n", lastMessage.Sub(last).String())

			return nil
		},
	}

	return cmd
}

func RegrowthBug() *serpent.Command {
	cmd := &serpent.Command{
		Use:        "regrowth <file> <file>",
		Middleware: serpent.RequireNArgs(2),
		Handler: func(i *serpent.Invocation) error {
			ctx := i.Context()
			logger := getLogger(i)

			files, err := openFileReaders(i.Args[0], i.Args[1])
			if err != nil {
				return err
			}
			defer func() { closeFiles(files...) }()

			m := vanilla.Merger(logger)
			liner, scan, err := m.LineScanner(ctx, nil, logfile.New(nil, files[0]), logfile.New(nil, files[1]))
			if err != nil {
				return err
			}

			each := consumeeach.New(func(m messages.Message) error {
				switch ty := m.(type) {
				case *messages.ResourceChange:
					if ty.SpellName != nil && *ty.SpellName == "Regrowth" {
						if ty.Amount > 5000 {
							fmt.Printf("%s Regrowth heal: %d\n", ty.Timestamp.String(), ty.Amount)
						}
					}
				case *messages.Heal:

				}
				return nil
			})

			p := vanilla.NewFromScanner(logger, liner, scan, nil)
			err = consumers.New(logger, each).ConsumeAll(ctx, p)
			if err != nil {
				return err
			}

			return nil
		},
	}

	return cmd
}

func HitTypeCMD() *serpent.Command {
	var casterStr string
	cmd := &serpent.Command{
		Use: "hits <file> <file>",
		Options: serpent.OptionSet{
			{
				Name:        "caster",
				Description: "Filter by caster name.",
				Required:    false,
				Flag:        "caster",
				Value:       serpent.StringOf(&casterStr),
				Default:     "",
			},
		},
		Middleware: serpent.RequireRangeArgs(1, 2),
		Handler: func(i *serpent.Invocation) error {
			ctx := i.Context()
			logger := getLogger(i)

			files, err := openFileReaders(i.Args...)
			if err != nil {
				return err
			}
			defer func() { closeFiles(files...) }()

			var caster *guid.GUID
			if casterStr != "" {
				id, err := guid.FromString(casterStr)
				if err != nil {
					return fmt.Errorf("parsing caster GUID: %w", err)
				}
				caster = &id
			}

			var p consumers.Advancer
			if len(files) == 1 {
				wowDB, err := gamedb.New(ctx, gamedb.Options{
					SpellsDBCPath: defaultSpellDBCPath(),
				})
				if err != nil {
					return fmt.Errorf("creating wowdb: %w", err)
				}
				p, err = parserv2.New(logger, files[0], wowDB, nil)
				if err != nil {
					return fmt.Errorf("creating parser: %w", err)
				}
			} else {
				m := vanilla.Merger(logger, merge.WithoutTimeAdjustments())
				liner, scan, err := m.LineScanner(ctx, nil, logfile.New(nil, files[0]), logfile.New(nil, files[1]))
				if err != nil {
					return err
				}

				p = vanilla.NewFromScanner(logger, liner, scan, nil)
			}

			h := &hitTypeConsumer{
				caster: caster,
			}
			c := consumers.New(logger, h)
			err = c.ConsumeAll(ctx, p)
			if err != nil {
				return err
			}

			for spellName, hitTypes := range h.SpellName {
				schools := make([]string, 0, len(h.SpellSchool[spellName]))
				for school := range h.SpellSchool[spellName] {
					schools = append(schools, school.String())
				}

				fmt.Printf("Spell: %s (%s)\n", spellName, strings.Join(schools, ", "))
				for hitType, count := range hitTypes {
					fmt.Printf("  %s: %d\n", hitType.String(), count)
				}
			}

			return nil
		},
	}

	return cmd
}

type hitTypeConsumer struct {
	caster      *guid.GUID
	SpellName   map[string]map[types.HitType]int
	SpellSchool map[string]map[types.School]int
}

func (h *hitTypeConsumer) Process(m messages.Message) error {
	if h.SpellName == nil {
		h.SpellName = make(map[string]map[types.HitType]int)
		h.SpellSchool = make(map[string]map[types.School]int)
	}
	switch msg := m.(type) {
	case *messages.Heal:
		if h.caster != nil && msg.Caster != *h.caster {
			return nil
		}

		if _, ok := h.SpellName[msg.SpellName]; !ok {
			h.SpellName[msg.SpellName] = make(map[types.HitType]int)
			h.SpellSchool[msg.SpellName] = make(map[types.School]int)
		}
		h.SpellName[msg.SpellName][msg.HitType]++
	case *messages.Damage:
		if msg.SpellName == nil {
			return nil
		}
		if h.caster != nil {
			if msg.Caster == nil {
				return nil
			}
			if *msg.Caster != *h.caster {
				return nil
			}
		}

		if _, ok := h.SpellName[*msg.SpellName]; !ok {
			h.SpellName[*msg.SpellName] = make(map[types.HitType]int)
			h.SpellSchool[*msg.SpellName] = make(map[types.School]int)
		}
		h.SpellName[*msg.SpellName][msg.HitType]++
		h.SpellSchool[*msg.SpellName][msg.School]++
	}
	return nil
}
