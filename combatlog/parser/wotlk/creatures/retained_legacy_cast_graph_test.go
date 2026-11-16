package creatures

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
)

func TestMimironRetainedLegacyCastContinuation(t *testing.T) {
	t.Parallel()
	r, newChars := expansionGraphRegistry(t, database.WoWFlavor{database.FlavorVanilla, database.FlavorWrath})
	all := newChars()
	player := guid.GUID(1)
	at := time.Unix(100, 0).UTC()
	units := []guid.GUID{creatureGUID(mimironLeviathanMkIIEntry), creatureGUID(mimironVX001Entry), creatureGUID(mimironAerialCommandEntry)}
	for i, id := range units {
		_, err := all.Process(testDamage(at.Add(time.Duration(i)*time.Second), player, id))
		require.NoError(t, err)
	}
	// The real self-repair recognizer transitions phase three to four.
	_, err := all.Process(&messages.LegacyCast{MessageBase: messages.Base(at.Add(3 * time.Second)), Caster: units[0], Spell: "Self Repair"})
	require.NoError(t, err)

	var repair *messages.LegacyCast
	for i, id := range units {
		_, err = all.Process(testDamage(at.Add(time.Duration(4+i*2)*time.Second), player, id))
		require.NoError(t, err)
		repair = &messages.LegacyCast{MessageBase: messages.Base(at.Add(time.Duration(5+i*2) * time.Second)), Caster: id, Spell: "Self Repair"}
		_, err = all.Process(repair)
		require.NoError(t, err)
	}

	ch, ok := all.Get(units[0])
	require.True(t, ok)
	periods := ch.Periods()
	require.NotEmpty(t, periods)
	require.Same(t, repair, periods[len(periods)-1].End.Timestamp)
	fresh := expansionDiskRestore(t, r, all)
	for _, chars := range []*characters.Characters{all, fresh} {
		_, err = chars.Process(messages.TimedOut(at.Add(time.Minute)))
		require.NoError(t, err)
	}

	assertExpansionGraphEqual(t, r, all, fresh)
}
