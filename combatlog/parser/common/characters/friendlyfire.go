package characters

import (
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
)

type IgnoreFriendlyFire struct {
	CharacterBase
	friends map[uint32]struct{}
}

func NewCommonIgnoreFriendlyFire(primary uint32, friendEntries ...uint32) func(id guid.GUID, all *Characters) (*IgnoreFriendlyFire, bool) {
	return func(id guid.GUID, all *Characters) (*IgnoreFriendlyFire, bool) {
		if !id.IsCreature() {
			return nil, false
		}

		entry, ok := id.GetEntry()
		if !ok {
			return nil, false
		}

		if entry != primary {
			return nil, false
		}

		c := NewCommonCharacter(id, all)
		return NewIgnoreFriendlyFire(c, friendEntries...), true
	}
}

func NewIgnoreFriendlyFire(c CharacterBase, friendEntries ...uint32) *IgnoreFriendlyFire {
	friends := make(map[uint32]struct{}, len(friendEntries))
	for _, entry := range friendEntries {
		friends[entry] = struct{}{}
	}
	return &IgnoreFriendlyFire{
		CharacterBase: c,
		friends:       friends,
	}
}

func (i *IgnoreFriendlyFire) IsFriendlyOnFriendly(a guid.GUID, b guid.GUID) bool {
	return i.IsFriendly(a) && i.IsFriendly(b) && (a == i.ID() || b == i.ID())
}

func (i *IgnoreFriendlyFire) IsFriendly(id guid.GUID) bool {
	entry, _ := id.GetEntry()
	_, ok := i.friends[entry]
	return ok
}

func (i *IgnoreFriendlyFire) Process(m messages.Message) error {
	switch ty := m.(type) {
	case *messages.Damage:
		if (ty.Caster != nil && *ty.Caster == i.ID()) || (ty.Target == i.ID()) {
			if i.IsFriendlyOnFriendly(*ty.Caster, ty.Target) {
				return nil
			}
		}
	case *messages.Heal:
		if i.IsFriendlyOnFriendly(ty.Caster, ty.Target) {
			return nil
		}
	case *messages.AuraCast:
		if ty.Target != nil {
			if i.IsFriendlyOnFriendly(ty.Caster, *ty.Target) {
				return nil
			}
		}
	}

	return i.CharacterBase.Process(m)
}
