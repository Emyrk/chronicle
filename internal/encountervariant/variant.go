// Package encountervariant defines exact cohort keys, independent of raid size
// and difficulty. Keeper identities and tooltip text never enter cohort keys.
package encountervariant

func Valid(key string) bool {
	switch key {
	case "normal", "hard", "lights_0", "lights_1", "lights_2", "lights_3", "lights_4":
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
		return key != "normal" && key != "hard"
	case "Hodir", "XT-002 Deconstructor", "General Vezax":
		return key == "normal" || key == "hard"
	default:
		return false
	}
}
