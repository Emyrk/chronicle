package parserv2

import (
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/stretchr/testify/assert"
)

func TestHitTypeWeaponHand(t *testing.T) {
	t.Parallel()

	mainHand := HitType(100, 0, HITINFO_AFFECTS_VICTIM, VICTIMSTATE_NORMAL)
	assert.True(t, mainHand.Has(types.HitTypeMainHand))
	assert.False(t, mainHand.Has(types.HitTypeOffHand))

	offHand := HitType(100, 0, HITINFO_AFFECTS_VICTIM|HITINFO_LEFTSWING, VICTIMSTATE_NORMAL)
	assert.True(t, offHand.Has(types.HitTypeOffHand))
	assert.False(t, offHand.Has(types.HitTypeMainHand))
}
