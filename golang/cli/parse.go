package cli

import (
	"errors"
	"fmt"
	"io"
	"log/slog"

	"github.com/Emyrk/chronicle/golang/wowlogs/vanillaparser"
	"github.com/Emyrk/chronicle/golang/wowlogs/vanillaparser/messages"

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
			for {
				if i.Context().Err() != nil {
					return i.Context().Err()
				}
				msgs, err := p.Advance()
				if err != nil {
					if vanillaparser.IsFatalError(err) {
						return fmt.Errorf("fatal parser error: %w", err)
					}
					if errors.Is(err, io.EOF) {
						break
					}
					logger.Error("Error advancing parser", slog.String("error", err.Error()))
				}
				for _, msg := range msgs {
					if up, ok := msg.(messages.UnparsedLine); ok {
						logger.Warn("Unparsed line", slog.String("line", up.Content))
					}
				}
			}

			state := p.State()
			//fmt.Println("Final parser state:")
			fmt.Println(state)

			return nil
		},
	}

	return cmd
}
