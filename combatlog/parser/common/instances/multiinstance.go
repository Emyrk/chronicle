package instances

import "github.com/Emyrk/chronicle/combatlog/parser/common/encounter"

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
