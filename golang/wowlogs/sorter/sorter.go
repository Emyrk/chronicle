package sorter

import (
	"bufio"
	"context"
	"io"
	"log/slog"
	"slices"
	"time"

	"github.com/Emyrk/chronicle/golang/wowlogs/lines"
)

type SortSummary struct {
	Earliest time.Time
	Latest   time.Time
	Total    int
}

type logLine struct {
	Date    time.Time
	Content string
}

func SortLogs(ctx context.Context, logger *slog.Logger, input io.Reader, output io.Writer) (SortSummary, error) {
	sum := SortSummary{}
	buffer := make([]logLine, 0)
	liner := lines.NewLiner()
	sc := bufio.NewScanner(input)
	for sc.Scan() {
		if ctx.Err() != nil {
			return sum, ctx.Err()
		}

		txt := sc.Text()
		ts, content, err := liner.Line(txt)
		if err != nil {
			logger.Warn("skipping failed line", slog.String("line", txt), slog.String("error", err.Error()))
			continue
		}
		buffer = append(buffer, logLine{
			Date:    ts,
			Content: content,
		})

		if ts.Before(sum.Earliest) || sum.Earliest.IsZero() {
			sum.Earliest = ts
		}

		if ts.After(sum.Latest) {
			sum.Latest = ts
		}
		sum.Total++
	}

	slices.SortFunc(buffer, func(a, b logLine) int {
		return int(a.Date.UnixMilli() - b.Date.UnixMilli())
	})

	for _, line := range buffer {
		if ctx.Err() != nil {
			return sum, ctx.Err()
		}

		_, err := output.Write([]byte(liner.FmtLine(line.Date, line.Content)))
		if err != nil {
			return sum, err
		}
		_, _ = output.Write([]byte("\n"))
	}

	return sum, nil
}
