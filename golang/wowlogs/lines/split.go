package lines

import (
	"strconv"
	"strings"
	"time"
)

type Liner struct {
	Year int
}

func NewLiner(year int) Liner {
	return Liner{Year: year}
}

func (l Liner) Line(line string) (time.Time, string, error) {
	parts := strings.SplitN(line, " ", 3)

	// Set the year
	year := strconv.Itoa(l.Year)
	ts, err := time.Parse("2006 01/02 15:04:05.000", year+" "+parts[0]+" "+parts[1])
	if err != nil {
		return time.Time{}, "", err
	}

	return ts, parts[2], nil
}

func LogLine(year int, line string) (time.Time, string, error) {
	l := NewLiner(year)
	return l.Line(line)
}
