package wotlk

import (
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestUnitDissipates(t *testing.T) {
	t.Parallel()

	line := `9/20 15:02:08.135  UNIT_DISSIPATES,0x0000000000000000,nil,0x80000000,0xF1300005E8DC4807,"Duskbat",0xa28,0,-1`
	p := &Parser{guidNames: NewGUIDNames()}

	ts, event, matched, err := ParseLine(line)
	require.NoError(t, err)

	parsed, err := p.dispatch(ts, event, matched, line)
	require.NoError(t, err)
	require.Len(t, parsed, 1)

	slain, ok := parsed[0].(*messages.Slain)
	require.True(t, ok, "expected *messages.Slain, got %T", parsed[0])
	assert.Equal(t, guid.GUID(0xF1300005E8DC4807), slain.Victim)
	assert.Nil(t, slain.Killer)
}
