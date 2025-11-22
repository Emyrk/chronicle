package cli

import (
	"fmt"
	"os"

	"github.com/Emyrk/chronicle/golang/wowlogs/merge"

	"github.com/coder/serpent"
)

func MergeCmd() *serpent.Command {
	var (
		outputPath string
		noFilter   bool
	)

	cmd := &serpent.Command{
		Use:        "merge <file> <file>",
		Middleware: serpent.RequireNArgs(2),
		Options: []serpent.Option{
			{
				Name:          "Output Path",
				Flag:          "output",
				FlagShorthand: "o",
				Description:   "Path to output merged file.",
				Required:      false,
				Value:         serpent.StringOf(&outputPath),
			},
			{
				Name:          "No Filter",
				Flag:          "no-filter",
				FlagShorthand: "n",
			},
		},
		Handler: func(i *serpent.Invocation) error {
			ctx := i.Context()
			logger := getLogger(i)
			m := merge.NewMerger(logger)

			a, b := i.Args[0], i.Args[1]
			first, err := os.OpenFile(a, os.O_RDONLY, 0644)
			if err != nil {
				return fmt.Errorf("opening file: %w", err)
			}

			second, err := os.OpenFile(b, os.O_RDONLY, 0644)
			if err != nil {
				return fmt.Errorf("opening file: %w", err)
			}

			wr := i.Stdout
			if outputPath != "" {
				wr, err = os.OpenFile(outputPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
				if err != nil {
					return fmt.Errorf("opening output file %s: %w", outputPath, err)
				}
			}

			return m.MergeLogs(ctx, first, second, wr)
		},
	}
	return cmd
}
