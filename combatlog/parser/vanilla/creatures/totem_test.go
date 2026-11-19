package creatures_test

import (
	"context"
	"errors"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"io"
	"strings"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/creatures"
	"github.com/Emyrk/chronicle/database"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/lines"
	"github.com/Emyrk/chronicle/combatlog/parser/merge"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/stretchr/testify/require"
)

func TestTotemicRecall(t *testing.T) {
	t.Parallel()

	logs := `12/11 12:40:00.000 UNIT_INFO: 11.12.25 12:21:12&0x000000000001C80A&1&Priests&1&&,10952=20,21850=1,20906=1,21562=1,10157=1
12/11 12:40:06.593  CAST: 0x00000000000C270C(Noflex) casts Mana Spring Totem(10497)(Rank 4).
12/11 12:40:06.593  CAST: 0xF130001CF827939E(Mana Spring Totem IV) casts Mana Spring(10494)(Rank 4) on 0xF130001CF827939E(Mana Spring Totem IV).
12/11 12:40:06.593  0x00000000000C270C casts Mana Spring Totem.
12/11 12:40:06.593  UNIT_INFO: 11.12.25 12:40:06&0xF130001CF827939E&0&Mana Spring Totem IV&1&0x00000000000C270C&,10494=1`

	logger := testutil.Logger(t)
	liner := lines.NewLiner()
	p := vanilla.NewFromScanner(context.Background(), logger, liner, merge.FromIOReader(liner, strings.NewReader(logs)), nil)

	db := unitdb.New(database.WoWFlavor{database.FlavorVanilla})
	c := characters.NewCharacters(db, creatures.TurtleCharacterFactories(), identifier.NewIdentifier(map[uint32]identifier.Identity{}))
	for {
		msgs, err := p.Advance(context.Background())
		if errors.Is(err, io.EOF) {
			break
		}
		require.NoError(t, err)
		for _, msg := range msgs {
			_, err := c.Process(msg)
			require.NoError(t, err)
		}
	}
}

func TestSuperiorHealingWardFactoryAndLifetime(t *testing.T) {
	t.Parallel()
	all := characters.NewCharacters(unitdb.New(database.WoWFlavor{database.FlavorVanilla, database.FlavorTurtle}), nil, identifier.NewIdentifier(map[uint32]identifier.Identity{}))
	id := guid.GUID(0xF130000000000000 | uint64(10218)<<24 | 1)
	var character characters.Character
	for _, factory := range creatures.TurtleCharacterFactories() {
		if c, ok := factory(id, all); ok {
			character = c
			break
		}
	}
	require.IsType(t, &creatures.Totem{}, character)
	ward := character.(*creatures.Totem)
	require.Equal(t, id, ward.ID())
	require.Equal(t, 30*time.Second, ward.Self.MaxDuration())
	now := time.Date(2026, time.November, 16, 0, 0, 0, 0, time.UTC)
	ward.Start("test", &messages.Heal{MessageBase: messages.Base(now), Caster: id})
	require.True(t, ward.IsActive())
	current, ok := ward.Activity.Current()
	require.True(t, ok)
	require.Equal(t, now.Add(30*time.Second), current.Meta.MaxLifetime)
	// Extend inactivity beyond the lifetime to verify the hard expiration.
	ward.Bump("test", &messages.Heal{MessageBase: messages.Base(now.Add(20 * time.Second)), Caster: id})
	current.HandleTimeout(now.Add(29 * time.Second))
	require.True(t, ward.IsActive())
	current.HandleTimeout(now.Add(30*time.Second + time.Nanosecond))
	require.False(t, ward.IsActive())
	for _, high := range []uint64{0xF110000000000000, 0xF140000000000000, 0xF150000000000000} {
		c, ok := creatures.NewTotemCharacter(guid.GUID(high|uint64(10218)<<24|1), all)
		require.False(t, ok)
		require.Nil(t, c)
	}
}

func TestBrainWashTotemGlobalFactoryAndLifetime(t *testing.T) {
	t.Parallel()
	for _, flavor := range []database.WoWFlavor{{database.FlavorVanilla}, {database.FlavorTurtle}, {database.FlavorVanilla, database.FlavorOctoWoW, database.FlavorNightmareOfUrsol}, {database.FlavorWrath}} {
		units := unitdb.New(flavor)
		all := characters.NewCharacters(units, creatures.VanillaCharacterFactories(flavor), identifier.NewIdentifier(nil))
		id := guid.GUID(0xF130003B08000001)
		now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
		char, _ := all.Add(id, now)
		require.IsType(t, &creatures.Totem{}, char)
		require.Equal(t, unitdb.CategoryTotem, units.Category(id))
		totem := char.(*creatures.Totem)
		require.Equal(t, 240*time.Second, totem.Self.MaxDuration())
		totem.Start("summon", &messages.SpellGo{MessageBase: messages.Base(now), Caster: id})
		current, ok := totem.Activity.Current()
		require.True(t, ok)
		require.Equal(t, now.Add(240*time.Second), current.Meta.MaxLifetime)
		// Regular bumps keep inactivity from expiring before the fixed lifetime.
		for seconds := 10; seconds < 240; seconds += 10 {
			at := now.Add(time.Duration(seconds) * time.Second)
			totem.Bump("pulse", &messages.SpellGo{MessageBase: messages.Base(at), Caster: id})
			current.HandleTimeout(at)
			require.True(t, totem.IsActive())
		}
		current.HandleTimeout(now.Add(239 * time.Second))
		require.True(t, totem.IsActive())
		current.HandleTimeout(now.Add(240*time.Second + time.Nanosecond))
		require.False(t, totem.IsActive())
	}
}
