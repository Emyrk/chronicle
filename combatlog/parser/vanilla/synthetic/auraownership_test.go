package synthetic

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAuraOwnershipCorrelatesTightAuraCast(t *testing.T) {
	t.Parallel()

	processor := newAuraOwnership()
	ts := time.UnixMilli(1000)
	caster := guid.GUID(1)
	target := guid.GUID(2)
	spell := &chrondbc.Spell{ID: 6077}
	aura := &messages.Aura{
		MessageBase: messages.Base(ts.Add(3 * time.Millisecond)),
		Target:      target,
		SpellData:   spell,
		State:       types.AuraStateAdded,
	}

	processor.ProcessMessages([]messages.Message{&messages.AuraCast{
		MessageBase: messages.Base(ts),
		Caster:      caster,
		Target:      &target,
		Spell:       spell,
	}})
	processor.ProcessMessages([]messages.Message{aura})

	require.NotNil(t, aura.Source)
	assert.Equal(t, caster, *aura.Source)
	assert.Equal(t, messages.AuraTransitionApplied, aura.Transition)
}

func TestAuraOwnershipRejectsStaleAuraCast(t *testing.T) {
	t.Parallel()

	processor := newAuraOwnership()
	ts := time.UnixMilli(1000)
	caster := guid.GUID(1)
	target := guid.GUID(2)
	spell := &chrondbc.Spell{ID: 6077}
	aura := &messages.Aura{
		MessageBase: messages.Base(ts.Add(auraCastCorrelationWindow + time.Millisecond)),
		Target:      target,
		SpellData:   spell,
		State:       types.AuraStateAdded,
	}

	processor.ProcessMessages([]messages.Message{&messages.AuraCast{
		MessageBase: messages.Base(ts),
		Caster:      caster,
		Target:      &target,
		Spell:       spell,
	}})
	processor.ProcessMessages([]messages.Message{aura})

	assert.Nil(t, aura.Source)
	assert.Equal(t, messages.AuraTransitionUnknown, aura.Transition)
}

func TestAuraOwnershipRequiresMatchingTargetAndSpell(t *testing.T) {
	t.Parallel()

	processor := newAuraOwnership()
	ts := time.UnixMilli(1000)
	caster := guid.GUID(1)
	target := guid.GUID(2)
	otherTarget := guid.GUID(3)
	spell := &chrondbc.Spell{ID: 6077}
	aura := &messages.Aura{
		MessageBase: messages.Base(ts.Add(time.Millisecond)),
		Target:      otherTarget,
		SpellData:   spell,
		State:       types.AuraStateAdded,
	}

	processor.ProcessMessages([]messages.Message{&messages.AuraCast{
		MessageBase: messages.Base(ts),
		Caster:      caster,
		Target:      &target,
		Spell:       spell,
	}})
	processor.ProcessMessages([]messages.Message{aura})

	assert.Nil(t, aura.Source)
}

func TestAuraOwnershipDoesNotOverrideAuthoritativeSource(t *testing.T) {
	t.Parallel()

	processor := newAuraOwnership()
	ts := time.UnixMilli(1000)
	castCaster := guid.GUID(1)
	auraCaster := guid.GUID(4)
	target := guid.GUID(2)
	spell := &chrondbc.Spell{ID: 6077}
	aura := &messages.Aura{
		MessageBase: messages.Base(ts.Add(time.Millisecond)),
		Source:      &auraCaster,
		Target:      target,
		SpellData:   spell,
		Transition:  messages.AuraTransitionRefreshed,
		State:       types.AuraStateModified,
	}

	processor.ProcessMessages([]messages.Message{&messages.AuraCast{
		MessageBase: messages.Base(ts),
		Caster:      castCaster,
		Target:      &target,
		Spell:       spell,
	}})
	processor.ProcessMessages([]messages.Message{aura})

	require.NotNil(t, aura.Source)
	assert.Equal(t, auraCaster, *aura.Source)
	assert.Equal(t, messages.AuraTransitionRefreshed, aura.Transition)
}
