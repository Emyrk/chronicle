package cli

import (
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/combatlog/consumers"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/consumeeach"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/creatures"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters"

	"github.com/coder/serpent"
)

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
			liner, scan, err := m.LineScanner(ctx, nil, files[0], files[1])
			if err != nil {
				return err
			}

			p := vanilla.NewFromScanner(logger, liner, scan)
			output := encounters.New(logger)
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
	cmd := &serpent.Command{
		Use:        "creatures <file> <file>",
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
			liner, scan, err := m.LineScanner(ctx, nil, files[0], files[1])
			if err != nil {
				return err
			}

			p := vanilla.NewFromScanner(logger, liner, scan)
			output := creatures.New(logger)
			err = output.Consume(ctx, p)
			if err != nil {
				return err
			}

			for z, units := range output.ZonedUnits {
				fmt.Println("Zone:", z)
				for id, name := range units {
					fmt.Printf("  %d: %q,\n", id, name)
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
			liner, scan, err := m.LineScanner(ctx, nil, files[0], files[1])
			if err != nil {
				return err
			}

			each := consumeeach.New(func(m messages.Message) error {
				switch ty := m.(type) {
				case messages.ResourceChange:
					if ty.SpellName != nil && *ty.SpellName == "Regrowth" {
						if ty.Amount > 5000 {
							fmt.Printf("%s Regrowth heal: %d\n", ty.Timestamp.String(), ty.Amount)
						}
					}
				case messages.Heal:

				}
				return nil
			})

			p := vanilla.NewFromScanner(logger, liner, scan)
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
	cmd := &serpent.Command{
		Use:        "hits <file> <file>",
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
			liner, scan, err := m.LineScanner(ctx, nil, files[0], files[1])
			if err != nil {
				return err
			}

			p := vanilla.NewFromScanner(logger, liner, scan)
			h := &hitTypeConsumer{}
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
	SpellName   map[string]map[types.HitType]int
	SpellSchool map[string]map[types.School]int
}

func (h *hitTypeConsumer) Process(m messages.Message) error {
	if h.SpellName == nil {
		h.SpellName = make(map[string]map[types.HitType]int)
		h.SpellSchool = make(map[string]map[types.School]int)
	}
	switch msg := m.(type) {
	case messages.Damage:
		if msg.SpellName == nil {
			return nil
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
