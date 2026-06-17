package characters

import (
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
)

type AdsGoWithBoss struct {
	CharacterBase
	bossEntry uint32
	adds      []uint32

	all *Characters
}

func NewAdsGoWithBoss(bossEntry uint32, ads ...uint32) func(id guid.GUID, all *Characters) (*AdsGoWithBoss, bool) {
	return func(id guid.GUID, all *Characters) (*AdsGoWithBoss, bool) {
		if !id.IsCreature() {
			return nil, false
		}

		entry, ok := id.GetEntry()
		if !ok {
			return nil, false
		}

		if entry != bossEntry {
			return nil, false
		}

		return &AdsGoWithBoss{
			CharacterBase: NewCommonCharacter(id, all),
			bossEntry:     bossEntry,
			adds:          ads,
			all:           all,
		}, true
	}
}

func NewAdsGoWithBossCustomCharacter(c CharacterBase, all *Characters, bossEntry uint32, ads ...uint32) *AdsGoWithBoss {
	return &AdsGoWithBoss{
		CharacterBase: c,
		bossEntry:     bossEntry,
		adds:          ads,
		all:           all,
	}
}

type CanDie interface {
	Died(reason string, m messages.Message)
}

func (c *AdsGoWithBoss) Process(m messages.Message) error {
	wasActive := c.IsActive()

	err := c.CharacterBase.Process(m)
	if err != nil {
		return err
	}

	if wasActive && !c.IsActive() {
		for _, ad := range c.adds {
			for _, add := range c.all.ByEntry[ad] {
				if com, ok := add.(CanDie); ok {
					com.Died("linked_boss_inactive", m)
				}
			}
		}
	}

	return nil
}
