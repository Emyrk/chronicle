package lines

import (
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/coder/quartz"
)

const (
	LogDateFormat = "01/2 15:04:05.000"
)

type Liner struct {
	Year  int
	clock quartz.Clock
}

func NewLiner() *Liner {
	return &Liner{
		clock: quartz.NewReal(),
	}
}

func (l *Liner) SetClock(clock quartz.Clock) {
	l.clock = clock
}

func (l *Liner) SetYear(year int) {
	l.Year = year
}

func (l *Liner) GetYear() int {
	return l.Year
}

func (l *Liner) guessYear(line string) error {
	// Account for timezones
	now := l.clock.Now().Add(time.Hour * 24)
	this, _, err := l.parse(now.Year(), line)
	if err != nil {
		return err
	}
	before, _, err := l.parse(now.Year()-1, line)
	if err != nil {
		return err
	}

	// now should always be in the future
	// So if a date is in the future, then that year is incorrect.
	if this.Sub(now) > 0 {
		// this is in the future, go with the prior year
		l.Year = now.Year() - 1
		return nil
	}

	// Both dates are in the past. Pick the closest one.
	toThis := now.Sub(this)
	toBefore := now.Sub(before)

	if toBefore < toThis {
		l.Year = now.Year() - 1
		return nil
	}

	l.Year = now.Year()
	return nil

	//thisToNow := now.Sub(this)
	//beforeToNow := now.Sub(before)
	//
	//if thisToNow < 0 {
	//
	//}
	//
	//var _, _ = fromThis, fromBefore
	//toThis := time.Since(this).Abs()
	//toBefore := time.Since(before).Abs()
	//
	//// Select the closest year
	//if toBefore < toThis {
	//	l.Year = now.Year() - 1
	//} else {
	//	l.Year = now.Year()
	//}
}

func (l *Liner) Line(line string) (time.Time, string, error) {
	if l.Year == 0 {
		err := l.guessYear(line)
		if err != nil {
			return time.Time{}, "", err
		}
	}

	return l.parse(l.Year, line)
}

func (l *Liner) parse(year int, line string) (time.Time, string, error) {
	parts := strings.SplitN(line, " ", 3)
	if len(parts) != 3 {
		return time.Time{}, "", errors.New("invalid line format")
	}
	ts, err := time.Parse("2006 "+LogDateFormat, strconv.Itoa(year)+" "+parts[0]+" "+parts[1])
	return ts, strings.TrimPrefix(parts[2], " "), err
}

func (l *Liner) FmtLine(ts time.Time, content string) string {
	return ts.Format(LogDateFormat) + "  " + content
}
