package combatant

import (
	"fmt"
	"strings"
	"time"

	"github.com/chronicle/golangformat/golang/wowlogs/guid"
)

type GUID struct {
	Name   string
	Seen   time.Time
	IsSelf bool
	GID    guid.GUID
}

// 11/18 07:21:41.353  COMBATANT_GUID: 18.11.25 07:21:41&Gxss&0x00000000000DA902
func ParseCombatantGUID(content string) (GUID, error) {
	var empty GUID

	if !strings.HasPrefix(content, "COMBATANT_GUID:") {
		return empty, fmt.Errorf("not a COMBATANT_GUID message")
	}

	info := strings.Split(strings.TrimPrefix(content, "COMBATANT_GUID: "), "&")
	if len(info) < 4 {
		return empty, fmt.Errorf("insufficient arguments in COMBATANT_INFO message, got %d, want at least 4", len(info))
	}

	timestamp, name, isSelf, gidStr := info[0], info[1], info[2], info[3]

	ts, err := time.Parse(dateFormat, timestamp)
	if err != nil {
		return empty, fmt.Errorf("invalid timestamp format in COMBATANT_INFO message: %v", err)
	}

	gid, err := guid.FromString(gidStr)
	if err != nil {
		return empty, fmt.Errorf("invalid GUID format in COMBATANT_INFO message: %v", err)
	}

	return GUID{
		Name:   name,
		Seen:   ts,
		IsSelf: isSelf == "1",
		GID:    gid,
	}, nil
}
