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

	// Difficulty fields (populated by companion addon on 3.3.5a).
	DifficultyIndex   int    // 1=10N, 2=25N, 3=10H, 4=25H
	DifficultyName    string // e.g. "25 Player"
	MaxPlayers        int    // max players for the instance
	DynamicDifficulty int    // 0=Normal, 1=Heroic (ICC-style toggle)
	SubZone           string // current subzone name
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

// ZoneChangeResult describes what changed when processing a new zone message.
type ZoneChangeResult int

const (
	// NoChange means the zone message carried no new information.
	NoChange ZoneChangeResult = iota
	// ZoneChanged means the player moved to a different zone (name or instanceID differs).
	ZoneChanged
	// DifficultyChanged means the zone is the same but difficulty/size changed
	// (e.g. switching from 10-man to 25-man). This should trigger a new hookable instance.
	DifficultyChanged
	// InfoUpdated means the zone is the same and difficulty info was previously
	// absent but is now provided (late-arriving info). The current instance should
	// adopt the new info without creating a new hookable.
	InfoUpdated
)

// HasDifficulty returns true if difficulty/size information has been set.
func (z Zone) HasDifficulty() bool {
	return z.MaxPlayers > 0 || z.DifficultyName != ""
}

// DifficultyDiffers returns true when both zones have difficulty metadata and
// their difficulty settings differ.
func (z Zone) DifficultyDiffers(b Zone) bool {
	return z.HasDifficulty() && b.HasDifficulty() && !z.DifficultyEquals(b)
}

// DifficultyEquals returns true if z and b have identical difficulty settings.
func (z Zone) DifficultyEquals(b Zone) bool {
	return z.DifficultyIndex == b.DifficultyIndex &&
		z.MaxPlayers == b.MaxPlayers
	// TODO: What to do with dynamic difficulty?
}
