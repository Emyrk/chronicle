package synthetic

import (
	"log/slog"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Gophercraft/core/i18n"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func mustGUID(s string) guid.GUID {
	g, err := guid.FromString(s)
	if err != nil {
		panic(err)
	}
	return g
}

func TestPossession_AuraCastGeneratesPossessionChange(t *testing.T) {
	t.Parallel()

	p := newPossession(slog.Default())
	now := time.Now()

	casterGUID := mustGUID("0x0000000000000001")
	targetGUID := mustGUID("0x0030000000000002")

	msgs := []messages.Message{
		&messages.AuraCast{
			MessageBase: messages.Base(now),
			Spell:       makeSpell("Mind Control"),
			Caster:      casterGUID,
			Target:      &targetGUID,
		},
	}

	result := p.ProcessMessages(msgs)
	require.Len(t, result, 2, "should append a PossessionChange")

	pc, ok := result[1].(*messages.PossessionChange)
	require.True(t, ok, "second message should be PossessionChange")
	assert.Equal(t, targetGUID, pc.Target)
	assert.Equal(t, casterGUID, pc.Controller)
	require.NotNil(t, pc.Spell)
	assert.Equal(t, "Mind Control", pc.Spell.Name())
	assert.True(t, pc.Gained)
}

func TestPossession_AuraCastPassesDurationMS(t *testing.T) {
	t.Parallel()

	p := newPossession(slog.Default())
	now := time.Now()

	casterGUID := mustGUID("0x0000000000000001")
	targetGUID := mustGUID("0x0030000000000002")

	msgs := []messages.Message{
		&messages.AuraCast{
			MessageBase: messages.Base(now),
			Spell:       makeSpell("Mind Control"),
			Caster:      casterGUID,
			Target:      &targetGUID,
			DurationMS:  15000,
		},
	}

	result := p.ProcessMessages(msgs)
	require.Len(t, result, 2)

	pc := result[1].(*messages.PossessionChange)
	assert.Equal(t, int32(15000), pc.DurationMS)
}

func TestPossession_AuraRemovalGeneratesRelease(t *testing.T) {
	t.Parallel()

	p := newPossession(slog.Default())
	now := time.Now()

	targetGUID := mustGUID("0x0030000000000002")

	msgs := []messages.Message{
		&messages.Aura{
			MessageBase: messages.Base(now),
			Target:      targetGUID,
			SpellName:   "Mind Control",
			State:       types.AuraStateRemoved,
		},
	}

	result := p.ProcessMessages(msgs)
	require.Len(t, result, 2, "should append a PossessionChange release")

	pc, ok := result[1].(*messages.PossessionChange)
	require.True(t, ok)
	assert.Equal(t, targetGUID, pc.Target)
	assert.False(t, pc.Gained)
}

func TestPossession_IgnoresNonPossessionSpells(t *testing.T) {
	t.Parallel()

	p := newPossession(slog.Default())
	now := time.Now()

	casterGUID := mustGUID("0x0000000000000001")
	targetGUID := mustGUID("0x0030000000000002")

	msgs := []messages.Message{
		&messages.AuraCast{
			MessageBase: messages.Base(now),
			Spell:       makeSpell("Shadow Word: Pain"),
			Caster:      casterGUID,
			Target:      &targetGUID,
		},
		&messages.Aura{
			MessageBase: messages.Base(now),
			Target:      targetGUID,
			SpellName:   "Shadow Word: Pain",
			State:       types.AuraStateRemoved,
		},
	}

	result := p.ProcessMessages(msgs)
	assert.Len(t, result, 2, "should not add any synthetic messages")
}

func makeSpell(name string) *chrondbc.Spell {
	return &chrondbc.Spell{
		Name_lang: i18n.Text{i18n.English: name},
	}
}
