package synthetic

import (
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
)

type vanillaplus struct {
	// shadow -> primary
	shadowBoss map[uint32]uint32
	boss       map[uint32]*guid.GUID
}

func newVanillaPlus() *vanillaplus {
	return (&vanillaplus{
		shadowBoss: make(map[uint32]uint32),
		boss:       make(map[uint32]*guid.GUID),
	}).
		shadowed(11502, "Ragnaros", 40004).
		shadowed(11982, "Magmadar", 20006).
		shadowed(11983, "Firemaw", 25122).
		shadowed(14401, "Master Elemental Shaper Krixix", 25118)
}

func (v *vanillaplus) shadowed(boss uint32, name string, shadow uint32) *vanillaplus {
	v.shadowBoss[shadow] = boss
	v.boss[boss] = nil
	return v
}

func (v *vanillaplus) ProcessMessages(msg []messages.Message) {
	for _, m := range msg {
		switch ty := m.(type) {
		case *messages.Unit:
			entry, ok := ty.Guid.GetEntry()
			if !ok {
				continue
			}

			_, ok = v.boss[entry]
			if !ok {
				continue
			}
			v.boss[entry] = &ty.Guid
		case *messages.Damage:
			if ty.Caster == nil {
				continue
			}

			ent, ok := ty.Caster.GetEntry()
			if !ok {
				continue
			}

			shadowOf, ok := v.shadowBoss[ent]
			if !ok {
				continue
			}

			boss, ok := v.boss[shadowOf]
			if !ok || boss == nil {
				continue
			}
			cpy := *boss
			ty.Caster = &cpy
		}
	}
}
