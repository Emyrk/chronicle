package simulation

import (
	"github.com/Emyrk/chronicle/simulation/combat"
	"github.com/Emyrk/chronicle/simulation/gamedata"
)

// CharacterConfig defines the input for a simulated character.
type CharacterConfig struct {
	Race    int32            `json:"race"`
	Class   int32            `json:"class"`
	Level   int32            `json:"level"`
	Gear    map[int32]int32  `json:"gear"`    // slot → itemID
	Talents map[int32]int32  `json:"talents"` // talentSpellID → points
	Buffs   []int32          `json:"buffs"`   // active buff spell IDs
}

// BuildCombatUnit creates a CombatUnit by aggregating base stats + gear.
func BuildCombatUnit(config CharacterConfig, data gamedata.DataProvider) *combat.CombatUnit {
	unit := &combat.CombatUnit{
		Level:       config.Level,
		IsPlayer:    true,
		WeaponSkill: config.Level * 5,
		PowerType:   gamedata.PowerMana,
	}

	// 1. Base stats from race/class/level
	if base, ok := data.GetPlayerBaseStats(config.Race, config.Class, config.Level); ok {
		unit.Health = base.Health
		unit.MaxHealth = base.Health
		unit.Power = base.Mana
		unit.MaxPower = base.Mana
		applyBaseStats(unit, config.Class, base)
	} else {
		// Fallback: reasonable level 60 defaults
		unit.Health = 3000
		unit.MaxHealth = 3000
		unit.Power = 4000
		unit.MaxPower = 4000
	}

	// 2. Aggregate gear stats
	for _, itemID := range config.Gear {
		if itemID == 0 {
			continue
		}
		item, ok := data.GetItem(itemID)
		if !ok {
			continue
		}
		applyItemStats(unit, &item)
	}

	return unit
}

func applyBaseStats(unit *combat.CombatUnit, class int32, base gamedata.PlayerBaseStats) {
	str := base.Strength
	agi := base.Agility

	// Stamina → HP (first 20 stamina = 1 HP each, rest = 10 HP each)
	sta := base.Stamina
	if sta > 20 {
		unit.Health += 20 + (sta-20)*10
		unit.MaxHealth += 20 + (sta-20)*10
	} else {
		unit.Health += sta
		unit.MaxHealth += sta
	}

	// Intellect → Mana (first 20 int = 1 mana each, rest = 15 mana each)
	intel := base.Intellect
	if intel > 20 {
		unit.Power += 20 + (intel-20)*15
		unit.MaxPower += 20 + (intel-20)*15
	} else {
		unit.Power += intel
		unit.MaxPower += intel
	}

	// Strength → AP (warriors/paladins get 2 AP per str, others 1)
	switch class {
	case 1, 2: // warrior, paladin
		unit.AttackPower += str * 2
	default:
		unit.AttackPower += str
	}

	// Agility → AP for rogues/hunters, crit for all
	switch class {
	case 3: // hunter
		unit.RangedAP += agi
		unit.AttackPower += agi
	case 4: // rogue
		unit.AttackPower += agi
	}

	// Agility → crit (approx 20 agi per 1% crit, varies by class)
	unit.CritChance += float64(agi) / 20.0

	// Intellect → spell crit (approx 59.5 int per 1% for mage)
	unit.SpellCrit += float64(intel) / 59.5
}

func applyItemStats(unit *combat.CombatUnit, item *gamedata.ItemData) {
	// Armor
	unit.Armor += item.Armor

	// Resistances
	for i := 0; i < 6; i++ {
		unit.Resistances[i] += item.Resistances[i]
	}

	// Stat bonuses
	for _, stat := range item.Stats {
		if stat.Type == 0 && stat.Value == 0 {
			continue
		}
		switch stat.Type {
		case gamedata.ItemModStrength:
			unit.AttackPower += stat.Value // simplified: 1 str = 1 AP
		case gamedata.ItemModAgility:
			unit.CritChance += float64(stat.Value) / 20.0
		case gamedata.ItemModStamina:
			unit.Health += stat.Value * 10
			unit.MaxHealth += stat.Value * 10
		case gamedata.ItemModIntellect:
			unit.Power += stat.Value * 15
			unit.MaxPower += stat.Value * 15
			unit.SpellCrit += float64(stat.Value) / 59.5
		case gamedata.ItemModSpirit:
			// Spirit: mana regen (handled elsewhere)
		case gamedata.ItemModHitRating:
			unit.HitChance += float64(stat.Value)
			unit.SpellHit += float64(stat.Value)
		case gamedata.ItemModCritRating:
			unit.CritChance += float64(stat.Value)
			unit.SpellCrit += float64(stat.Value)
		case gamedata.ItemModAttackPower:
			unit.AttackPower += stat.Value
		case gamedata.ItemModRangedAttackPower:
			unit.RangedAP += stat.Value
		case gamedata.ItemModSpellPower:
			unit.SpellPower[0] += stat.Value // all-schools
		}
	}

	// Weapon damage
	if item.Delay > 0 {
		for _, dmg := range item.Damage {
			if dmg.Min == 0 && dmg.Max == 0 {
				continue
			}
			if dmg.DamageType == 0 { // physical
				// Determine slot by inventory type
				switch item.InventoryType {
				case gamedata.InvTypeWeapon, gamedata.InvTypeMainHand, gamedata.InvType2HWeapon:
					unit.MHDmgMin += float64(dmg.Min)
					unit.MHDmgMax += float64(dmg.Max)
					unit.MHSpeedMs = item.Delay
				case gamedata.InvTypeOffHand:
					unit.OHDmgMin += float64(dmg.Min)
					unit.OHDmgMax += float64(dmg.Max)
					unit.OHSpeedMs = item.Delay
				}
			}
		}
	}
}

// BuildTargetUnit creates a CombatUnit from creature data.
func BuildTargetUnit(c *gamedata.CreatureData) *combat.CombatUnit {
	defSkill := c.DefenseSkill
	if defSkill == 0 {
		defSkill = c.Level * 5
	}
	return &combat.CombatUnit{
		Level:        c.Level,
		Health:       c.Health,
		MaxHealth:    c.Health,
		Power:        c.Mana,
		MaxPower:     c.Mana,
		Armor:        c.Armor,
		Resistances:  c.Resistances,
		DefenseSkill: defSkill,
		IsPlayer:     false,
		CreatureType: c.CreatureType,
	}
}
