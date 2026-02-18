package unitinfo

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/types/realmclock"
	"github.com/Emyrk/chronicle/combatlog/parser/unitname"
)

const (
	PrefixUnitInfo = "UNIT_INFO:"
)

func IsUnitInfo(content string) (string, bool) {
	return types.Is(PrefixUnitInfo, content)
}

type Buff struct {
	ID           int
	Applications int
}

type Info struct {
	Seen         time.Time
	Guid         guid.GUID
	IsPlayer     bool
	Name         string
	CanCooperate bool
	Owner        *guid.GUID
	Buffs        []Buff
	Level        int
	Challenges   []string
}

// TODO:
// - UnitIsTapped? (tagged)
// - UnitIsPlusMob? (elite)
func ParseUnitInfo(ri *realmclock.Info, content string) (Info, error) {
	trimmed, ok := IsUnitInfo(content)
	if !ok {
		return Info{}, fmt.Errorf("not a UNIT_INFO message")
	}

	// UnitPlayerOrPetInParty?
	// UnitPlayerOrPetInRaid?

	// <seen>&<guid>&<name>&<can_cooperator>&<owner>
	parts := strings.Split(trimmed, "&")

	if len(parts) < 6 {
		return Info{}, fmt.Errorf("insufficient arguments in UNIT_INFO message, got %d, want at least 6", len(parts))
	}

	// TODO: LEvel and challenges
	ts, guidStr, isPlayerStr, name, coop, owner := parts[0], parts[1], parts[2], parts[3], parts[4], parts[5]
	seen, err := ri.ParseAddonDate(ts)
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
	if owner != "nil" && owner != "" {
		id, err := guid.FromString(owner)
		if err != nil {
			return Info{}, fmt.Errorf("invalid owner guid format %q: %w", owner, err)
		}
		ownerID = &id
	}

	// This feels a bit jank, but the WoW `UnitName` function can return "Unknown".
	// Unsure why, but when it does that name will be propagated up. In some cases,
	// if we know it is not a player, and it has an entry ID, we can fix the name
	// here. Maintaining a list of seen "unknowns" hopefully does not get that large.
	if name == "Unknown" && !gid.IsPlayer() && unitname.ByGUID(gid) != "" {
		name = unitname.ByGUID(gid)
	}

	info := Info{
		Seen:         seen,
		Guid:         gid,
		IsPlayer:     isPlayer,
		Name:         name,
		CanCooperate: canCoop,
		Owner:        ownerID,
	}

	if len(parts) >= 7 {
		info.Buffs, err = ParseBuffs(parts[6])
		if err != nil {
			trimmedBuffs := strings.TrimSuffix(parts[6], "na")
			if trimmedBuffs == "-1" {
				err = nil
			} else {
				// So jank, but there is a bugged version of the addon that puts the unit level
				// plus "na" in this part.
				r, err := strconv.ParseUint(strings.TrimSuffix(parts[6], "na"), 10, 64)
				if err != nil || r < 40 {
					return Info{}, fmt.Errorf("parsing buffs (%s): %w", content, err)
				}
			}
		}
	}
	if len(parts) >= 8 {
		parts[7] = strings.TrimSuffix(parts[7], "na") // Addon bug
		level, err := strconv.Atoi(parts[7])
		if err != nil {
			return Info{}, fmt.Errorf("invalid level %q: %w", parts[7], err)
		}
		info.Level = level
	}
	if len(parts) >= 9 {
		challenges := strings.Split(parts[8], ",")
		info.Challenges = challenges
	}

	return info, nil
}

func (u *Info) IsMe() bool {
	return u.IsPlayer
}

// ,21564=1,27681=1
func ParseBuffs(buffStr string) ([]Buff, error) {
	if buffStr == "" {
		return []Buff{}, nil
	}

	// A bug in a version of the addon
	buffStr = strings.TrimSuffix(buffStr, "na")
	buffs := make([]Buff, 0)
	for _, buff := range strings.Split(buffStr, ",") {
		if buff == "" {
			continue
		}
		parts := strings.Split(buff, "=")
		if len(parts) != 2 {
			return nil, fmt.Errorf("invalid buff format %q", buff)
		}
		id, err := strconv.Atoi(parts[0])
		if err != nil {
			return nil, fmt.Errorf("invalid buff ID %q: %w", parts[0], err)
		}
		applications, err := strconv.Atoi(parts[1])
		if err != nil {
			return nil, fmt.Errorf("invalid buff applications %q: %w", parts[1], err)
		}
		buffs = append(buffs, Buff{
			ID:           id,
			Applications: applications,
		})
	}
	return buffs, nil
}
