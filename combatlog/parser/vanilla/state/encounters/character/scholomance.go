package character

// TODO: There is more work to be done for scholo

import (
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"
)

const (
	jandiceBarov         = 10503
	jandiceBarovIllusion = 11439
)

func NewJandiceBarov(id guid.GUID, all *Characters) (Character, bool) {
	return NewAdsGoWithBoss(jandiceBarov, jandiceBarovIllusion)(id, all)
}

const diseasedGhoul = 10495

// DiseasedGhoul stays on the ground after death with a poison cloud
type DiseasedGhoul struct {
	*Common
}

func NewDiseasedGhoul(id guid.GUID, all *Characters) (Character, bool) {
	if !id.IsCreature() {
		return nil, false
	}

	if entry, ok := id.GetEntry(); !ok || entry != diseasedGhoul {
		return nil, false
	}

	return &DiseasedGhoul{
		Common: NewCommonCharacter(id, all),
	}, true
}

func (c *DiseasedGhoul) Process(m messages.Message) error {
	switch data := m.(type) {
	case *messages.Damage:
		// We could check for them to be dead, and only ignore the disease cloud
		// in that case.... but this is easier.
		if data.SpellName != nil && *data.SpellName == "Cloud of Disease" {
			return nil
		}
	}

	err := c.Common.Process(m)
	if err != nil {
		return err
	}

	return nil
}
