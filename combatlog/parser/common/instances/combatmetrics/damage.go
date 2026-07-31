package combatmetrics

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

// EffectiveDamage returns health damage plus damage prevented by absorbs.
// Damage-based metrics should use this helper so fully and partially absorbed
// hits are accounted for consistently.
func EffectiveDamage(msg *messages.Damage) int64 {
	return int64(msg.Amount) + msg.Trailer.AbsorbedAmount()
}

func IsPlayerOrPlayerOwned(units *unitdb.Units, unitGUID guid.GUID) bool {
	cls := units.Classify(unitGUID)
	if cls.Type == unitdb.UnitTypePlayer {
		return true
	}
	if !cls.Relation.HasOwner() {
		return false
	}
	return units.Classify(*cls.Relation.Owner).Type == unitdb.UnitTypePlayer
}
