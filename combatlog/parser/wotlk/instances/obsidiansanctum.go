package instances

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
)

const (
	powerOfTenebron chrondbc.SpellID = 61248
	powerOfShadron  chrondbc.SpellID = 58105
	powerOfVesperon chrondbc.SpellID = 61251
)

type sartharionDrakePowerActivity struct{}

func (*sartharionDrakePowerActivity) ProcessMessage(msg messages.Message) error {
	aura, ok := msg.(*messages.Aura)
	if !ok || aura.Source == nil || aura.SpellData == nil || aura.Amount <= 0 {
		return nil
	}

	var expectedEntry uint32
	switch aura.SpellData.ID {
	case powerOfTenebron:
		expectedEntry = 30452
	case powerOfShadron:
		expectedEntry = 30451
	case powerOfVesperon:
		expectedEntry = 30449
	default:
		return nil
	}

	entry, ok := aura.Source.GetEntry()
	if !ok || entry != expectedEntry {
		return nil
	}

	aura.MarkActivityStart("sartharion drake power", *aura.Source)
	return nil
}
