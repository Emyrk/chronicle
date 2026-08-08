package totems

import (
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

type Totem struct {
	ID             uint32
	Name           string
	NormalDuration time.Duration
	// Modifier is a factor which can be applied to the totem's duration from
	// any source. Such as Totemic Mastery talent.
	Modifier   float64
	StaticBump time.Duration
}

func (tot Totem) MaxDuration() time.Duration {
	// TODO: Idk how the static bump interacts with the modifier. This is a guess.
	modified := float64(tot.NormalDuration) * (1 + tot.Modifier)
	return time.Duration(modified) + tot.StaticBump
}

func IsTotem(id guid.GUID) (Totem, bool) {
	if !id.IsCreature() {
		return Totem{}, false
	}
	entry, ok := id.GetEntry()
	if !ok {
		return Totem{}, false
	}
	return EntryIsTotem(entry)
}

func EntryIsTotem(entry uint32) (Totem, bool) {
	totem, exists := totems[entry]
	return totem, exists
}

var totems = make(map[uint32]Totem)

const (
	modifierTotemicMastery = 0.2

	staticEarthfurySetBump = time.Second * 15
	improvedFireTotems     = time.Second
)

func init() {
	register("Grounding Totem", 0,
		variant{id: 5925, duration: 45 * time.Second})

	// Talent "improved Searing Totem" does not exist in the game.
	// https://database.turtle-wow.org/?spell=16127
	// Earthfury set has a set effect for +15 seconds duration
	// https://database.turtle-wow.org/?itemset=666
	register("Searing Totem", 0,
		variant{id: 2523, duration: 30 * time.Second, staticBump: staticEarthfurySetBump},
		variant{id: 3902, duration: 35 * time.Second, staticBump: staticEarthfurySetBump},
		variant{id: 3903, duration: 40 * time.Second, staticBump: staticEarthfurySetBump},
		variant{id: 3904, duration: 45 * time.Second, staticBump: staticEarthfurySetBump},
		variant{id: 7400, duration: 50 * time.Second, staticBump: staticEarthfurySetBump},
		variant{id: 7402, duration: 55 * time.Second, staticBump: staticEarthfurySetBump},
	)

	// Fire nova totem can be faster based on "Improved Fire Totem".
	// We should watch for the damage log to kill it.
	register("Fire Nova Totem", 0,
		variant{id: 5879, duration: 5 * time.Second, staticBump: improvedFireTotems},
		variant{id: 6110, duration: 5 * time.Second, staticBump: improvedFireTotems},
		variant{id: 6111, duration: 5 * time.Second, staticBump: improvedFireTotems},
		variant{id: 7844, duration: 5 * time.Second, staticBump: improvedFireTotems},
		variant{id: 7845, duration: 5 * time.Second, staticBump: improvedFireTotems},
	)

	register("Healing Stream Totem", 0,
		variant{id: 3527, duration: 60 * time.Second},
		variant{id: 3906, duration: 60 * time.Second},
		variant{id: 3907, duration: 60 * time.Second},
		variant{id: 3908, duration: 60 * time.Second},
		variant{id: 3909, duration: 60 * time.Second},
	)

	register("Fire Resistance Totem",
		modifierTotemicMastery,
		variant{id: 5927, duration: 120 * time.Second},
		variant{id: 7424, duration: 120 * time.Second},
		variant{id: 7425, duration: 120 * time.Second},
	)

	register("Mana Spring Totem",
		modifierTotemicMastery,
		variant{id: 3573, duration: 60 * time.Second},
		variant{id: 7414, duration: 60 * time.Second},
		variant{id: 7415, duration: 60 * time.Second},
		variant{id: 7416, duration: 60 * time.Second},
		variant{id: 15489, duration: 60 * time.Second},
	)

	register("Strength of Earth Totem",
		modifierTotemicMastery,
		variant{id: 5874, duration: 120 * time.Second},
		variant{id: 5921, duration: 120 * time.Second},
		variant{id: 5922, duration: 120 * time.Second},
		variant{id: 7403, duration: 120 * time.Second},
		variant{id: 15464, duration: 120 * time.Second},
		variant{id: 15479, duration: 120 * time.Second},
	)

	register("Magma Totem",
		0,
		variant{id: 5929, duration: 20 * time.Second},
		variant{id: 7464, duration: 20 * time.Second},
		variant{id: 7465, duration: 20 * time.Second},
		variant{id: 7466, duration: 20 * time.Second},
		variant{id: 15484, duration: 20 * time.Second},
		variant{id: 31166, duration: 20 * time.Second},
		variant{id: 31167, duration: 20 * time.Second},
	)

	register("Windwall Totem",
		modifierTotemicMastery,
		variant{id: 9687, duration: 120 * time.Second},
		variant{id: 9688, duration: 120 * time.Second},
		variant{id: 9689, duration: 120 * time.Second},
	)

	register("Windfury Totem",
		modifierTotemicMastery,
		variant{id: 6112, duration: 120 * time.Second},
		variant{id: 52144, duration: 120 * time.Second},
		variant{id: 7483, duration: 120 * time.Second},
		variant{id: 7484, duration: 120 * time.Second},
	)

	register("Tremor Totem",
		modifierTotemicMastery,
		variant{id: 5913, duration: 120 * time.Second},
	)

	register("Earthbind Totem",
		modifierTotemicMastery,
		variant{id: 5913, duration: 45 * time.Second},
	)

	register("Stoneclaw Totem",
		modifierTotemicMastery,
		variant{id: 3579, duration: 15 * time.Second},
		variant{id: 3911, duration: 15 * time.Second},
		variant{id: 3912, duration: 15 * time.Second},
		variant{id: 3913, duration: 15 * time.Second},
		variant{id: 7398, duration: 15 * time.Second},
		variant{id: 7399, duration: 15 * time.Second},
	)

	register("Poison Cleaning Totem",
		modifierTotemicMastery,
		variant{id: 5923, duration: 120 * time.Second},
	)

	register("Flametongue Totem",
		modifierTotemicMastery,
		variant{id: 5950, duration: 120 * time.Second},
		variant{id: 6012, duration: 120 * time.Second},
		variant{id: 7423, duration: 120 * time.Second},
		variant{id: 10557, duration: 120 * time.Second},
	)

	// Comes from "Enamored Water Spirit" item
	// https://database.turtle-wow.org/?item=20503
	register("Ancient Mana Spring Totem", 0,
		variant{id: 15304, duration: 24 * time.Second},
	)

	// BWL has corrupted variants
	register("Corrupted", 0,
		// TODO: Idk the durations of these, or how they work.
		variant{nameOverride: "Corrupted Fire Nova Totem", id: 14662, duration: 0},
		variant{nameOverride: "Corrupted Healing Stream Totem", id: 14664, duration: 0},
		variant{nameOverride: "Corrupted Stoneskin Totem", id: 14663, duration: 0},
		variant{nameOverride: "Corrupted Totem", id: 14667, duration: 0},
		variant{nameOverride: "Corrupted Windfury Totem", id: 14666, duration: 0},
	)

	register("Powerful Healing Ward", 0,
		variant{id: 14987, duration: 60 * time.Second * 4},
	)

	register("Lava Spout Totem", 0,
		variant{id: 6017, duration: 20 * time.Second},
	)
}

// Variants are like different ranks for example
type variant struct {
	nameOverride string
	id           uint32
	duration     time.Duration
	// Some effects increase by X seconds
	staticBump time.Duration
}

func register(name string, mod float64, variants ...variant) {
	for _, v := range variants {
		actualName := name
		if v.nameOverride != "" {
			actualName = v.nameOverride
		}
		totems[v.id] = Totem{
			ID:             v.id,
			Name:           actualName,
			NormalDuration: v.duration,
			Modifier:       mod,
			StaticBump:     v.staticBump,
		}
	}
}
