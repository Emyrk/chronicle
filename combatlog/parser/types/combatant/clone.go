package combatant

import "slices"

// Clone detaches metadata for ownership transfer or a historical observation.
func (c Combatant) Clone() Combatant {
	c.Guild = clonePointer(c.Guild)
	c.Level = clonePointer(c.Level)
	c.Faction = clonePointer(c.Faction)
	c.GearSetups = CloneGear(c.GearSetups)
	c.Talents = CloneTalents(c.Talents)
	c.Glyphs = clonePointer(c.Glyphs)
	if c.Glyphs != nil {
		c.Glyphs.Groups = slices.Clone(c.Glyphs.Groups)
	}
	c.V22 = clonePointer(c.V22)
	if c.V22 != nil {
		c.V22.Spirit = clonePointer(c.V22.Spirit)
		c.V22.AdditionalUnknownStat = clonePointer(c.V22.AdditionalUnknownStat)
	}
	return c
}

func CloneGear(gear []GearItem) []GearItem {
	gear = slices.Clone(gear)
	for i := range gear {
		g := &gear[i]
		g.EnchantID = clonePointer(g.EnchantID)
		g.TempEnchantID = clonePointer(g.TempEnchantID)
		g.TransmogID = clonePointer(g.TransmogID)
		g.BonusIDs = slices.Clone(g.BonusIDs)
		g.Gems = slices.Clone(g.Gems)
	}
	return gear
}

func CloneTalents(t *Talents) *Talents {
	t = clonePointer(t)
	if t != nil {
		for i := range t.Trees {
			t.Trees[i] = slices.Clone(t.Trees[i])
		}
	}
	return t
}

func clonePointer[T any](p *T) *T {
	if p == nil {
		return nil
	}
	v := *p
	return &v
}
