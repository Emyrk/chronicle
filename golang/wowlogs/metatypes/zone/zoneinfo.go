package zone

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/golang/wowlogs/metatypes"
)

const (
	PrefixZone = "ZONE_INFO:"
)

type Zone struct {
	Seen       time.Time
	Name       string
	InstanceID uint32
}

func ParseZoneInfo(content string) (Zone, error) {
	if !strings.HasPrefix(content, PrefixZone) {
		return Zone{}, nil
	}

	trimmed := strings.TrimPrefix(content, PrefixZone+" ")
	parts := strings.Split(trimmed, "&")

	if len(parts) < 3 {
		return Zone{}, fmt.Errorf("insufficient arguments in ZONE_INFO message, got %d, want at least 3", len(parts))
	}

	ts, name, id := parts[0], parts[1], parts[2]
	seen, err := time.Parse(metatypes.DateFormat, ts)
	if err != nil {
		return Zone{}, fmt.Errorf("invalid date format %q: %w", ts, err)
	}

	instanceID, err := strconv.ParseUint(id, 10, 32)
	if err != nil {
		return Zone{}, fmt.Errorf("invalid instance ID %q: %w", id, err)
	}

	return Zone{
		Seen:       seen,
		Name:       name,
		InstanceID: uint32(instanceID),
	}, nil
}
