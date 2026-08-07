package realmclock

import (
	"fmt"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/types"
)

const (
	PrefixClockInfo = "CLOCK_INFO:"
)

func IsClockInfo(content string) (string, bool) {
	return types.Is(PrefixClockInfo, content)
}

type Info struct {
	LocalTime time.Time
	UTCTime   time.Time
	Offset    time.Duration
}

// FromUnixOffset builds realm clock information from a Unix timestamp and a
// signed local offset in minutes east of UTC. Combat-log timestamps are local
// wall-clock values represented in time.UTC, so Offset is the duration needed
// to convert those values to UTC.
func FromUnixOffset(unixSeconds int64, utcOffsetMinutes int) Info {
	utcTime := time.Unix(unixSeconds, 0).UTC()
	localOffset := time.Duration(utcOffsetMinutes) * time.Minute
	return Info{
		LocalTime: utcTime.Add(localOffset),
		UTCTime:   utcTime,
		Offset:    -localOffset,
	}
}

func ParseClockInfo(content string) (Info, error) {
	trimmed, ok := IsClockInfo(content)
	if !ok {
		return Info{}, fmt.Errorf("not a CLOCK_INFO message")
	}

	parts := strings.Split(trimmed, "&")
	if len(parts) < 2 {
		return Info{}, fmt.Errorf("insufficient arguments in CLOCK_INFO message, got %d, want at least 2", len(parts))
	}
	local, utc := parts[0], parts[1]

	localTime, err := time.ParseInLocation(types.AddonDateFormat, local, time.UTC)
	if err != nil {
		return Info{}, fmt.Errorf("invalid date format %q: %w", local, err)
	}

	utcTime, err := time.ParseInLocation(types.AddonDateFormat, utc, time.UTC)
	if err != nil {
		return Info{}, fmt.Errorf("invalid date format %q: %w", utc, err)
	}

	difference := (utcTime.Truncate(time.Minute)).Sub(localTime.Truncate(time.Minute))

	return Info{
		LocalTime: localTime,
		UTCTime:   utcTime,
		Offset:    difference,
	}, nil
}

func (ci *Info) Adjust(local time.Time) (utc time.Time) {
	return local.Add(ci.Offset)
}

func (ci *Info) String() string {
	return fmt.Sprintf("CLOCK_INFO: %s&%s", ci.LocalTime.Format(types.AddonDateFormat), ci.UTCTime.Format(types.AddonDateFormat))
}

func (ci *Info) ParseAddonDate(dateStr string) (time.Time, error) {
	ts, err := time.ParseInLocation(types.AddonDateFormat, dateStr, time.UTC)
	if err != nil {
		return time.Time{}, err
	}

	if ci == nil {
		return ts, nil
	}

	return ci.Adjust(ts), nil
}
