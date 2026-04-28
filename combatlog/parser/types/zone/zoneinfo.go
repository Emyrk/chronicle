package zone

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/types/realmclock"
)

const (
	PrefixZone = "ZONE_INFO:"
)

func IsZoneInfo(content string) (string, bool) {
	return types.Is(PrefixZone, content)
}

type Zone struct {
	Seen         time.Time
	Name         string
	MapID        uint32
	InstanceID   uint32
	Ghost        bool
	InstanceType string
	IsInstance   bool
}

func (z Zone) ID() string {
	return fmt.Sprintf("%s:%d", z.Name, z.InstanceID)
}

func ParseZoneInfo(ri *realmclock.Info, content string) (Zone, error) {
	trimmed, ok := IsZoneInfo(content)
	if !ok {
		return Zone{}, fmt.Errorf("not a ZONE_INFO message")
	}

	parts := strings.Split(trimmed, "&")

	if len(parts) < 3 {
		return Zone{}, fmt.Errorf("insufficient arguments in ZONE_INFO message, got %d, want at least 3", len(parts))
	}

	ts, name, id := parts[0], parts[1], parts[2]
	seen, err := ri.ParseAddonDate(ts)
	if err != nil {
		return Zone{}, fmt.Errorf("invalid date format %q: %w", ts, err)
	}

	instanceID, err := strconv.ParseUint(id, 10, 32)
	if err != nil {
		return Zone{}, fmt.Errorf("invalid instance ID %q: %w", id, err)
	}

	return Zone{
		Seen:       seen,
		Name:       strings.ToLower(name),
		InstanceID: uint32(instanceID),
	}, nil
}

func (z Zone) Equal(b Zone) bool {
	return z.InstanceID == b.InstanceID && z.Name == b.Name
}
