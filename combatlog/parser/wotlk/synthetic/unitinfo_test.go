package synthetic

import (
	"context"
	"log/slog"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
)

// mockNameResolver implements NameResolver for tests.
type mockNameResolver struct {
	names map[guid.GUID]string
}

func (m *mockNameResolver) Get(id guid.GUID) (string, bool) {
	n, ok := m.names[id]
	return n, ok
}

// mockCreatureFetcher satisfies gamedb.CreatureFetcher for tests.
type mockCreatureFetcher struct{}

func (m *mockCreatureFetcher) Creature(int32) (*database.WorldCreatureTemplate, bool) {
	return nil, false
}

// mockSpellFetcher satisfies gamedb.SpellFetcher for tests.
type mockSpellFetcher struct {
	spells map[chrondbc.SpellID]*chrondbc.Spell
}

func (m *mockSpellFetcher) SpellsByName(_ context.Context, _ string) ([]*chrondbc.Spell, error) {
	return nil, nil
}
func (m *mockSpellFetcher) Spell(_ context.Context, id chrondbc.SpellID) (*chrondbc.Spell, error) {
	s, ok := m.spells[id]
	if !ok {
		return nil, nil
	}
	return s, nil
}

func TestSpellClassSetToHeroClass(t *testing.T) {
	t.Parallel()

	tests := []struct {
		input    chrondbc.SpellClassSet
		expected types.HeroClasses
	}{
		{chrondbc.SpellClassSetMage, types.HeroClassesMAGE},
		{chrondbc.SpellClassSetWarrior, types.HeroClassesWARRIOR},
		{chrondbc.SpellClassSetWarlock, types.HeroClassesWARLOCK},
		{chrondbc.SpellClassSetPriest, types.HeroClassesPRIEST},
		{chrondbc.SpellClassSetDruid, types.HeroClassesDRUID},
		{chrondbc.SpellClassSetRogue, types.HeroClassesROGUE},
		{chrondbc.SpellClassSetHunter, types.HeroClassesHUNTER},
		{chrondbc.SpellClassSetPaladin, types.HeroClassesPALADIN},
		{chrondbc.SpellClassSetShaman, types.HeroClassesSHAMAN},
		{chrondbc.SpellClassSetDeathKnight, types.HeroClassesDEATHKNIGHT},
		{chrondbc.SpellClassSetGeneric, types.HeroClassesUNKNOWN},
		{chrondbc.SpellClassSet(99), types.HeroClassesUNKNOWN},
	}

	for _, tc := range tests {
		assert.Equal(t, tc.expected, spellClassSetToHeroClass(tc.input), "SpellClassSet %d", tc.input)
	}
}

// playerGUID returns a GUID that IsPlayer() returns true for.
// Player GUIDs in the codebase have entity type 0 (bits 48-51 = 0).
func playerGUID(id uint64) guid.GUID {
	return guid.GUID(id)
}

func TestClassDetectionFromSpellEvents(t *testing.T) {
	t.Parallel()

	rogueGUID := playerGUID(0x00000000000019CA)
	mageGUID := playerGUID(0x00000000000019CB)

	names := &mockNameResolver{
		names: map[guid.GUID]string{
			rogueGUID: "Ioser",
			mageGUID:  "Frostbolt",
		},
	}

	rogueSpell := &chrondbc.Spell{SpellClassSet: chrondbc.SpellClassSetRogue}
	mageSpell := &chrondbc.Spell{SpellClassSet: chrondbc.SpellClassSetMage}

	ui := newUnitInfo(context.Background(), slog.Default(), nil, names, &mockSpellFetcher{})

	ts := time.Date(2025, 1, 14, 20, 40, 8, 0, time.UTC)

	// First batch: rogue casts a spell. Should get combatant with class detected.
	spellGo := &messages.SpellGo{
		MessageBase: messages.Base(ts),
		SpellData:   rogueSpell,
		Caster:      rogueGUID,
	}
	result := ui.ProcessMessages([]messages.Message{spellGo})

	// Should have the original message + a synthetic Combatant for rogue
	var combatants []*messages.Combatant
	for _, msg := range result {
		if c, ok := msg.(*messages.Combatant); ok {
			combatants = append(combatants, c)
		}
	}
	require.Len(t, combatants, 1, "expected 1 combatant message")
	assert.Equal(t, types.HeroClassesROGUE, combatants[0].HeroClass)
	assert.Equal(t, "Ioser", combatants[0].Name)

	// Second batch within cooldown: mage casts a spell.
	// Only mage should get a new combatant; rogue is still in cooldown.
	ts2 := ts.Add(time.Second)
	spellGo2 := &messages.SpellGo{
		MessageBase: messages.Base(ts2),
		SpellData:   mageSpell,
		Caster:      mageGUID,
	}
	result2 := ui.ProcessMessages([]messages.Message{spellGo2})

	combatants = nil
	for _, msg := range result2 {
		if c, ok := msg.(*messages.Combatant); ok {
			combatants = append(combatants, c)
		}
	}
	require.Len(t, combatants, 1, "expected 1 combatant for mage")
	assert.Equal(t, types.HeroClassesMAGE, combatants[0].HeroClass)
	assert.Equal(t, "Frostbolt", combatants[0].Name)
}

func TestClassDetectionReEmitOnDetection(t *testing.T) {
	t.Parallel()

	rogueGUID := playerGUID(0x00000000000019CA)

	names := &mockNameResolver{
		names: map[guid.GUID]string{
			rogueGUID: "Ioser",
		},
	}

	rogueSpell := &chrondbc.Spell{SpellClassSet: chrondbc.SpellClassSetRogue}

	ui := newUnitInfo(context.Background(), slog.Default(), &mockCreatureFetcher{}, names, &mockSpellFetcher{})

	ts := time.Date(2025, 1, 14, 20, 40, 8, 0, time.UTC)

	// First message: a melee swing (no spell data) that makes rogue appear as UNKNOWN.
	swing := &messages.Damage{
		MessageBase: messages.Base(ts),
		Caster:      &rogueGUID,
		Target:      guid.GUID(0xF1300023890000AD),
	}
	result := ui.ProcessMessages([]messages.Message{swing})

	var combatants []*messages.Combatant
	for _, msg := range result {
		if c, ok := msg.(*messages.Combatant); ok && c.Guid == rogueGUID {
			combatants = append(combatants, c)
		}
	}
	require.Len(t, combatants, 1)
	assert.Equal(t, types.HeroClassesUNKNOWN, combatants[0].HeroClass)

	// Second message within cooldown: a spell cast. Should trigger re-emit with class.
	ts2 := ts.Add(time.Second)
	spellGo := &messages.SpellGo{
		MessageBase: messages.Base(ts2),
		SpellData:   rogueSpell,
		Caster:      rogueGUID,
	}
	result2 := ui.ProcessMessages([]messages.Message{spellGo})

	combatants = nil
	for _, msg := range result2 {
		if c, ok := msg.(*messages.Combatant); ok && c.Guid == rogueGUID {
			combatants = append(combatants, c)
		}
	}
	// Should have a re-emitted combatant with ROGUE class
	require.Len(t, combatants, 1, "expected re-emitted combatant with detected class")
	assert.Equal(t, types.HeroClassesROGUE, combatants[0].HeroClass)
}

func TestGenericSpellDoesNotDetectClass(t *testing.T) {
	t.Parallel()

	playerG := playerGUID(0x00000000000019CA)
	names := &mockNameResolver{
		names: map[guid.GUID]string{playerG: "GenericPlayer"},
	}

	// Spell with generic class set (e.g. potion, trinket)
	genericSpell := &chrondbc.Spell{SpellClassSet: chrondbc.SpellClassSetGeneric}

	ui := newUnitInfo(context.Background(), slog.Default(), nil, names, &mockSpellFetcher{})

	ts := time.Date(2025, 1, 14, 20, 40, 8, 0, time.UTC)
	spellGo := &messages.SpellGo{
		MessageBase: messages.Base(ts),
		SpellData:   genericSpell,
		Caster:      playerG,
	}
	result := ui.ProcessMessages([]messages.Message{spellGo})

	for _, msg := range result {
		if c, ok := msg.(*messages.Combatant); ok {
			assert.Equal(t, types.HeroClassesUNKNOWN, c.HeroClass, "generic spell should not detect class")
		}
	}
}
