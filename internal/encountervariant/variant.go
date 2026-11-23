// Package encountervariant defines exact cohort keys, independent of raid size
// and difficulty. Keeper identities and tooltip text never enter cohort keys.
package encountervariant

func Valid(key string) bool {
	switch key {
	case "normal", "medium", "hard", "lights_0", "lights_1", "lights_2", "lights_3", "lights_4":
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
	case "Yogg-Saron":
		switch key {
		case "lights_0", "lights_1", "lights_2", "lights_3", "lights_4":
			return true
		default:
			return false
		}
	case "Assembly of Iron":
		return key == "normal" || key == "medium" || key == "hard"
	case "Hodir", "XT-002 Deconstructor", "General Vezax":
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
