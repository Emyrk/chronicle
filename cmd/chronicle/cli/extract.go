package cli

import (
	"bufio"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/lines"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"

	"github.com/coder/serpent"
)

func ExtractCmd() *serpent.Command {
	cmd := &serpent.Command{
		Use: "extract <file>",
		Children: []*serpent.Command{
			ExtractByTime(),
			ExtractByUtility(),
		},
	}

	return cmd
}

// TODO: This is jank
func ExtractByUtility() *serpent.Command {
	cmd := &serpent.Command{
		Use:     "utility <file>",
		Options: serpent.OptionSet{},
		Handler: func(i *serpent.Invocation) error {
			ctx := i.Context()
			logger := getLogger(i)

			files, err := openFileReaders(i.Args[0])
			if err != nil {
				return err
			}
			defer func() { closeFiles(files...) }()
			input := bufio.NewScanner(files[0])

			p := vanilla.Parser{}

			liner := lines.NewLiner()
			for input.Scan() {
				if ctx.Err() != nil {
					return ctx.Err()
				}

				txt := input.Text()
				ts, content, err := liner.Line(txt)
				if err != nil {
					logger.Warn("skipping failed line", slog.String("line", txt), slog.String("error", err.Error()))
					continue
				}

				msgs, err := p.ParseContent(nil, ts, content)
				if err != nil {
					logger.Warn("skipping failed parse", slog.String("line", txt), slog.String("error", err.Error()))
					continue
				}
				if len(msgs) == 0 {
					continue
				}

				if len(msgs) == 1 {
					_, ok := msgs[0].(*messages.SkippedMessage)
					if ok {
						continue
					}
				}

				_, _ = fmt.Fprintln(i.Stdout, liner.FmtLine(ts, content))
				//fmt.Println(reflect.TypeOf(msgs[0]).String())
			}

			return nil
		},
	}
	return cmd
}

func ExtractByTime() *serpent.Command {
	var (
		begin  string
		end    string
		useUTC bool
	)
	cmd := &serpent.Command{
		// chronicle extract time ignoredlogs/raid/WoWRawCombatLog.txt --start 14:12:40 --end 14:15:18
		Use: "time <file>",
		Options: serpent.OptionSet{
			{
				Name:        "use-utc",
				Description: "Interpret begin and end times as UTC instead of local time.",
				Required:    false,
				Flag:        "use-utc",
				Value:       serpent.BoolOf(&useUTC),
			},
			{
				Name:        "begin",
				Description: "Start time for extraction (inclusive).",
				Required:    true,
				Flag:        "begin",
				Value:       serpent.StringOf(&begin),
			},
			{
				Name:        "end",
				Description: "End time for extraction (exclusive).",
				Required:    true,
				Flag:        "end",
				Value:       serpent.StringOf(&end),
			},
		},
		Handler: func(i *serpent.Invocation) error {
			ctx := i.Context()
			logger := getLogger(i)

			loc := time.Local
			if useUTC {
				loc = time.UTC
			}

			setDate := sync.Once{}
			start, err := time.ParseInLocation("15:04:05", begin, loc)
			if err != nil {
				return fmt.Errorf("invalid begin time format: %w", err)
			}
			finish, err := time.ParseInLocation("15:04:05", end, loc)
			if err != nil {
				return fmt.Errorf("invalid end time format: %w", err)
			}

			logger.Info(fmt.Sprintf("Extracting lines between %s and %s (UTC: %t) for %s",
				start.Format("15:04:05"),
				finish.Format("15:04:05"),
				useUTC,
				finish.Sub(start).String(),
			))

			if finish.Before(start) {
				return fmt.Errorf("begin time must be before end time")
			}

			files, err := openFileReaders(i.Args[0])
			if err != nil {
				return err
			}
			defer func() { closeFiles(files...) }()
			input := bufio.NewScanner(files[0])

			liner := lines.NewLiner().WithoutTimeAdjustments()
			for input.Scan() {
				if ctx.Err() != nil {
					return ctx.Err()
				}

				txt := input.Text()
				ts, content, err := liner.Line(txt)
				if err != nil {
					logger.Warn("skipping failed line", slog.String("line", txt), slog.String("error", err.Error()))
					continue
				}

				setDate.Do(func() {
					year, month, day := ts.Date()
					start = time.Date(year, month, day, start.Hour(), start.Minute(), start.Second(), 0, loc)
					finish = time.Date(year, month, day, finish.Hour(), finish.Minute(), finish.Second(), 0, loc)
					logger.Info("set date",
						slog.Time("start", start),
						slog.Time("finish", finish),
					)
				})

				if ts.Before(start) {
					continue
				}

				if ts.After(finish) {
					logger.Info("extraction complete", slog.Time("end_time", ts))
					break
				}

				_, _ = fmt.Fprintln(i.Stdout, liner.FmtLine(ts, content))
			}

			return nil
		},
	}
	return cmd
}
