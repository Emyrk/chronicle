package unitinfo

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/golang/wowlogs/guid"
	"github.com/Emyrk/chronicle/golang/wowlogs/types"
)

const (
	PrefixUnitInfo = "UNIT_INFO:"
)

func IsUnitInfo(content string) (string, bool) {
	return types.Is(PrefixUnitInfo, content)
}

type Info struct {
	Seen         time.Time
	Guid         guid.GUID
	IsPlayer     bool
	Name         string
	CanCooperate bool
	Owner        *guid.GUID
}

// TODO:
// - UnitIsTapped? (tagged)
// - UnitIsPlusMob? (elite)
func ParseUnitInfo(content string) (Info, error) {
	trimmed, ok := IsUnitInfo(content)
	if !ok {
		return Info{}, fmt.Errorf("not a UNIT_INFO message")
	}

	// UnitPlayerOrPetInParty?
	// UnitPlayerOrPetInRaid?

	// <seen>&<guid>&<name>&<can_cooperator>&<owner>
	parts := strings.Split(trimmed, "&")

	if len(parts) < 5 {
		return Info{}, fmt.Errorf("insufficient arguments in UNIT_INFO message, got %d, want at least 5", len(parts))
	}

	ts, guidStr, isPlayerStr, name, coop, owner := parts[0], parts[1], parts[2], parts[3], parts[4], parts[5]
	seen, err := time.Parse(types.AddonDateFormat, ts)
	if err != nil {
		return Info{}, fmt.Errorf("invalid date format %q: %w", ts, err)
	}

	isPlayer, err := strconv.ParseBool(isPlayerStr)
	if err != nil {
		return Info{}, fmt.Errorf("invalid isPlayer flag %q: %w", isPlayerStr, err)
	}

	gid, err := guid.FromString(guidStr)
	if err != nil {
		return Info{}, fmt.Errorf("invalid guid format %q: %w", guidStr, err)
	}

	// UnitIsFriend?
	// UnitIsEnemy?
	canCoop, err := strconv.ParseBool(coop)
	if err != nil {
		return Info{}, fmt.Errorf("invalid coop flag %q: %w", coop, err)
	}

	var ownerID *guid.GUID
	if owner != "nil" {
		id, err := guid.FromString(owner)
		if err != nil {
			return Info{}, fmt.Errorf("invalid owner guid format %q: %w", owner, err)
		}
		ownerID = &id
	}

	return Info{
		Seen:         seen,
		Guid:         gid,
		IsPlayer:     isPlayer,
		Name:         name,
		CanCooperate: canCoop,
		Owner:        ownerID,
	}, nil
}

func (u *Info) IsMe() bool {
	return u.IsPlayer
}
