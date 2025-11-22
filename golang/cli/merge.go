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
		},
		Handler: func(i *serpent.Invocation) error {
			ctx := i.Context()
			logger := getLogger(i)
			m := merge.NewMerger(logger)

			files, err := openFileReaders(i.Args[0], i.Args[1])
			if err != nil {
				return err
			}
			defer func() { closeFiles(files...) }()
			first, second := files[0], files[1]

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

func closeFiles(files ...*os.File) {
	for _, f := range files {
		_ = f.Close()
	}
}

func openFileReaders(paths ...string) ([]*os.File, error) {
	var readers []*os.File
	for _, path := range paths {
		first, err := os.OpenFile(path, os.O_RDONLY, 0644)
		if err != nil {
			closeFiles(readers...)
			return nil, fmt.Errorf("opening file: %w", err)
		}
		readers = append(readers, first)
	}

	return readers, nil
}
