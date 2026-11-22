package modern

import (
	"context"
	"fmt"
	"io"
	"strings"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

// PlayerIdentityIndex contains only raw, parse-wide name/realm evidence. It does
// not contain combat messages, timestamps, inferred realms, or game metadata.
type PlayerIdentityIndex struct {
	realms map[guid.GUID]map[string]PlayerRealmInfo
	names  map[guid.GUID]map[string]struct{}
}

func (i *PlayerIdentityIndex) LookupPlayerRealm(id guid.GUID, name string) (string, bool) {
	if i == nil {
		return "", false
	}
	value, ok := i.realms[id][name]
	return value.RawRealm, ok
}
func (i *PlayerIdentityIndex) ObservedPlayerNames(id guid.GUID) []string {
	if i == nil {
		return nil
	}
	names := make([]string, 0, len(i.names[id]))
	for name := range i.names[id] {
		names = append(names, name)
	}
	return names
}

// NormalizePlayerName applies the same display-name normalization as Forever
// CLEU. Callers must not derive GUIDs or canonical realms from this label.
func NormalizePlayerName(name string) string { return stripRealm(name) }

// PreflightPlayerIdentities scans only identity-bearing CLEU fields. It shares
// scanning, splitting, GUID normalization and first-known-realm capture with the
// actual transformer, without decoding combat messages or consulting game data.
func PreflightPlayerIdentities(ctx context.Context, input io.Reader) (*PlayerIdentityIndex, error) {
	r := newTransformReader(input)
	r.combatLogVersion = 22
	r.playerRealms = make(map[guid.GUID]map[string]PlayerRealmInfo)
	r.playerNames = make(map[guid.GUID]map[string]struct{})
	for r.scanner.Scan() {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		line := strings.TrimSpace(r.scanner.Text())
		if line == "" || malformedPhysicalLine(line) {
			continue
		}
		separator := strings.Index(line, "  ")
		if separator < 0 {
			return nil, fmt.Errorf("identity preflight: missing CLEU separator")
		}
		fields := splitTopLevel(line[separator+2:])
		if len(fields) < 9 {
			continue
		}
		event, args := fields[0], fields[1:]
		switch event {
		case "COMBAT_LOG_VERSION", "ZONE_CHANGE", "COMBATANT_INFO", "ENCOUNTER_START", "ENCOUNTER_END", "WORLD_MARKER_PLACED", "WORLD_MARKER_REMOVED", "MAP_CHANGE", "EMOTE":
			continue
		}
		positions := []int{0, 4}
		if event == "SPELL_ABSORBED" {
			if len(args) == 18 {
				positions = append(positions, 8)
			} else if len(args) == 21 {
				positions = append(positions, 11)
			}
		}
		for _, pos := range positions {
			if !strings.HasPrefix(args[pos], "Player-") {
				continue
			}
			if _, err := r.guids.normalize(args[pos]); err != nil {
				return nil, err
			}
			r.normalizeUnitName(args[pos], args[pos+1])
		}
	}
	if err := r.scanner.Err(); err != nil {
		return nil, err
	}
	return &PlayerIdentityIndex{realms: r.playerRealms, names: r.playerNames}, nil
}
