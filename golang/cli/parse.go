package cli

import (
	"fmt"

	"github.com/Emyrk/chronicle/golang/wowlogs/vanillaparser"

	"github.com/coder/serpent"
)

func ParseCmd() *serpent.Command {
	cmd := &serpent.Command{
		Use:        "parse <file> <file>",
		Middleware: serpent.RequireNArgs(2),
		Handler: func(i *serpent.Invocation) error {
			ctx := i.Context()
			logger := getLogger(i)

			files, err := openFileReaders(i.Args[0], i.Args[1])
			if err != nil {
				return err
			}
			defer func() { closeFiles(files...) }()

			m := vanillaparser.Merger(logger)
			liner, scan, err := m.LineScanner(ctx, files[0], files[1])
			if err != nil {
				return err
			}

			p := vanillaparser.NewFromScanner(logger, liner, scan)
			_, err = p.Advance()
			if err != nil {
				return fmt.Errorf("advance parser: %w", err)
			}

			return nil
		},
	}

	return cmd
}
