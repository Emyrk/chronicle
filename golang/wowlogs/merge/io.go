package merge

import (
	"bufio"
	"io"
	"time"

	"github.com/Emyrk/chronicle/golang/wowlogs/lines"
)

func FromIOReader(lines *lines.Liner, m io.Reader) Scan {
	scanner := bufio.NewScanner(m)
	return func() (time.Time, string, error) {
		if !scanner.Scan() {
			return time.Time{}, "", io.EOF
		}

		return lines.Line(scanner.Text())
	}
}
