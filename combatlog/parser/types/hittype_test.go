package types_test

import (
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/stretchr/testify/assert"
)

func TestHitTypeMainHand(t *testing.T) {
	t.Parallel()

	assert.Equal(t, types.HitType(0x00400000), types.HitTypeMainHand)
	assert.Equal(t, "MainHand", types.HitTypeMainHand.String())
}
