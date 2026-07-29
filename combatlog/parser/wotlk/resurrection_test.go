package wotlk

import (
	"context"
	"log/slog"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSpellResurrect(t *testing.T) {
	t.Parallel()

	line := `7/25 21:44:48.577  SPELL_RESURRECT,0x0000000000090560,"Puhringles",0x514,0x000000000008B5CB,"Craftingew",0x100512,48949,"Redemption",0x2`
	spell := &chrondbc.Spell{ID: 48949}
	p := &Parser{
		logger:       slog.Default(),
		wowDB:        resurrectionSpellFetcher{spell: spell},
		guidNames:    NewGUIDNames(),
		missedSpells: make(map[chrondbc.SpellID]missedSpellEntry),
	}

	ts, event, matched, err := ParseLine(line)
	require.NoError(t, err)

	parsed, err := p.dispatch(ts, event, matched, line)
	require.NoError(t, err)
	require.Len(t, parsed, 1)

	resurrection, ok := parsed[0].(*messages.Resurrection)
	require.True(t, ok, "expected *messages.Resurrection, got %T", parsed[0])
	assert.Equal(t, guid.GUID(0x0000000000090560), resurrection.Source)
	assert.Equal(t, guid.GUID(0x000000000008B5CB), resurrection.Target)
	assert.Same(t, spell, resurrection.Spell)
	assert.False(t, resurrection.IsSynthetic())
}

type resurrectionSpellFetcher struct {
	spell *chrondbc.Spell
}

func (f resurrectionSpellFetcher) Spell(_ context.Context, id chrondbc.SpellID) (*chrondbc.Spell, error) {
	if f.spell != nil && f.spell.ID == id {
		return f.spell, nil
	}
	return nil, chrondbc.SpellNotFound(id)
}

func (resurrectionSpellFetcher) SpellsByName(context.Context, string) ([]*chrondbc.Spell, error) {
	return nil, nil
}
