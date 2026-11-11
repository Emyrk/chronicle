package synthetic

import (
	"fmt"
	"sort"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/zoner"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

// CaptureLastDamageReferences covers only Slain's pointer cache, not its zone
// state or the full pipeline. Capture order is deterministic by target GUID.
func (s *SlainDetective) CaptureLastDamageReferences(capture func(guid.GUID, *messages.Damage) (string, error)) (map[guid.GUID]string, error) {
	if s.lastDamage == nil {
		return nil, nil
	}
	keys := make([]guid.GUID, 0, len(s.lastDamage))
	for key := range s.lastDamage {
		keys = append(keys, key)
	}
	sort.Slice(keys, func(i, j int) bool { return keys[i] < keys[j] })
	refs := make(map[guid.GUID]string, len(keys))
	for _, key := range keys {
		if capture == nil {
			return nil, fmt.Errorf("missing slain capture callback")
		}
		p, err := capture(key, s.lastDamage[key])
		if err != nil {
			return nil, err
		}
		if p == "" {
			return nil, fmt.Errorf("empty slain damage reference")
		}
		refs[key] = p
	}
	return refs, nil
}

// NewSlainDetectiveFromReferences restores an isolated owner with a caller-owned
// fresh zone state. Zone capture/restore remains outside this narrow adapter.
func NewSlainDetectiveFromReferences(location *zoner.Location, refs map[guid.GUID]string, resolve func(string) (*messages.Damage, error)) (*SlainDetective, error) {
	if location == nil {
		return nil, fmt.Errorf("fresh zone state required")
	}
	s := &SlainDetective{currentZone: location, lastDamage: make(map[guid.GUID]*messages.Damage, len(refs))}
	for target, p := range refs {
		if resolve == nil || p == "" {
			return nil, fmt.Errorf("missing slain damage resolver or reference")
		}
		d, err := resolve(p)
		if err != nil {
			return nil, err
		}
		if d == nil || d.Target != target {
			return nil, fmt.Errorf("invalid slain cached damage for %s", target)
		}
		s.lastDamage[target] = d
	}
	return s, nil
}
