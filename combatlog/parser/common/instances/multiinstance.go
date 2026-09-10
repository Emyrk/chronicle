package instances

import (
	"sort"

	"github.com/Emyrk/chronicle/combatlog/parser/common/encounter"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

type MultiInstanceZone struct {
	cachedOverride string
	config         map[uint32]string
}

func NewMultiInstanceZone(config map[string][]uint32) *MultiInstanceZone {
	lookup := make(map[uint32]string)
	for name, entries := range config {
		for _, entry := range entries {
			lookup[entry] = name
		}
	}

	return &MultiInstanceZone{config: lookup}
}

func (m *MultiInstanceZone) Names() []string {
	if m == nil {
		return nil
	}
	names := make(map[string]struct{})
	for _, name := range m.config {
		names[name] = struct{}{}
	}
	result := make([]string, 0, len(names))
	for name := range names {
		result = append(result, name)
	}
	sort.Strings(result)
	return result
}

func (m *MultiInstanceZone) NameForGUIDs(ids []guid.GUID) (string, bool) {
	if m == nil {
		return "", false
	}
	for _, id := range ids {
		entry, ok := id.GetEntry()
		if !ok {
			continue
		}
		if name, ok := m.config[entry]; ok {
			return name, true
		}
	}
	return "", false
}

func (m *MultiInstanceZone) Name(fights []encounter.Fight) (string, bool) {
	if m.cachedOverride != "" {
		return m.cachedOverride, true
	}

	for _, fight := range fights {
		for gid := range fight.Hostiles {
			entry, ok := gid.GetEntry()
			if !ok {
				continue
			}

			if name, ok := m.config[entry]; ok {
				m.cachedOverride = name
				return name, true
			}
		}
	}
	return "", false
}
