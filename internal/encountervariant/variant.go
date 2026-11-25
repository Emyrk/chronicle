// Package encountervariant defines exact cohort keys, independent of raid size
// and difficulty. Keeper identities and tooltip text never enter cohort keys.
package encountervariant

func Valid(key string) bool {
	switch key {
	case "towers_0", "towers_1", "towers_2", "towers_3", "towers_4", "normal", "medium", "hard", "lights_0", "lights_1", "lights_2", "lights_3", "lights_4":
		return true
	default:
		return false
	}
}

func Supported(instance, boss, key string) bool {
	if instance != "Ulduar" || !Valid(key) {
		return false
	}
	switch boss {
	case "Flame Leviathan":
		return key == "towers_0" || key == "towers_1" || key == "towers_2" || key == "towers_3" || key == "towers_4"
	case "Yogg-Saron":
		switch key {
		case "lights_0", "lights_1", "lights_2", "lights_3", "lights_4":
			return true
		default:
			return false
		}
	case "Assembly of Iron":
		return key == "normal" || key == "medium" || key == "hard"
	case "Mimiron", "Hodir", "XT-002 Deconstructor", "General Vezax":
		return key == "normal" || key == "hard"
	default:
		return false
	}
}

// Tooltip is optional display metadata. It must never participate in cohort keys.
type Tooltip struct {
	Type  string  `json:"type"`
	Auras []int32 `json:"auras"`
}
