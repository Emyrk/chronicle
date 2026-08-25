package instances_test

import (
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/Emyrk/chronicle/combatlog/parser/common/encounter"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/creatures"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func phaseTestCreatureGUID(entry uint32, seed uint32) guid.GUID {
	return guid.GUID(0xF130000000000000 | uint64(entry&0xFFFFFF)<<24 | uint64(seed&0xFFFFFF))
}

func razorgoreSpellGo(ts time.Time) *messages.SpellGo {
	caster := phaseTestCreatureGUID(12435, 1)
	return &messages.SpellGo{
		MessageBase: messages.Base(ts),
		Caster:      caster,
		SpellData:   &chrondbc.Spell{ID: 19873},
	}
}

func TestRazorgoreEggThreshold_Flavors(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		flavor   database.WoWFlavor
		expected int
	}{
		{"Nightmare of Ursol", database.WoWFlavor{database.FlavorNightmareOfUrsol}, 20},
		{"VanillaPlus", database.WoWFlavor{database.FlavorVanillaPlus}, 30},
		{"Unsupported", database.WoWFlavor{database.FlavorVanilla}, 0},
		{"Empty", database.WoWFlavor{}, 0},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := creatures.RazorgoreEggThreshold(tc.flavor)
			assert.Equal(t, tc.expected, got)
		})
	}
}

func TestBWLPhaseDetectorFactories_UnsupportedFlavor(t *testing.T) {
	t.Parallel()
	factories := instances.BWLPhaseDetectorFactories(database.WoWFlavor{database.FlavorVanilla})
	assert.Nil(t, factories)
}

func TestBWLPhaseDetectorFactories_Nightmare(t *testing.T) {
	t.Parallel()
	factories := instances.BWLPhaseDetectorFactories(database.WoWFlavor{database.FlavorNightmareOfUrsol})
	require.Len(t, factories, 1)

	det := factories[0]()
	require.NotNil(t, det)
	assert.Equal(t, "Razorgore the Untamed", det.EncounterName())
}

func TestRazorgorePhaseDetector_Threshold20(t *testing.T) {
	t.Parallel()
	factories := instances.BWLPhaseDetectorFactories(database.WoWFlavor{database.FlavorNightmareOfUrsol})
	require.Len(t, factories, 1)

	det := factories[0]()
	encounterID := uuid.New()
	start := time.Date(2025, 1, 1, 12, 0, 0, 0, time.UTC)
	end := start.Add(5 * time.Minute)

	// Feed 19 casts – the encounter remains entirely Phase 1.
	for i := 0; i < 19; i++ {
		det.ProcessMessage(razorgoreSpellGo(start.Add(time.Duration(i) * time.Second)))
	}
	phases := det.Finalize(encounterID, start, end)
	require.Len(t, phases, 1)
	assert.Equal(t, "razorgore_p1", phases[0].Key)
	assert.Equal(t, int64(0), phases[0].StartOffsetMs)
	assert.Equal(t, end.Sub(start).Milliseconds(), phases[0].EndOffsetMs)

	det.Reset()

	// Feed exactly 20 casts.
	transitionTime := start.Add(19 * time.Second)
	for i := 0; i < 20; i++ {
		det.ProcessMessage(razorgoreSpellGo(start.Add(time.Duration(i) * time.Second)))
	}
	phases = det.Finalize(encounterID, start, end)
	require.Len(t, phases, 2)

	assert.Equal(t, "razorgore_p1", phases[0].Key)
	assert.Equal(t, "Phase 1 – Adds", phases[0].Name)
	assert.Equal(t, 0, phases[0].Order)
	assert.Equal(t, int64(0), phases[0].StartOffsetMs)
	assert.Equal(t, transitionTime.Sub(start).Milliseconds(), phases[0].EndOffsetMs)

	assert.Equal(t, "razorgore_p2", phases[1].Key)
	assert.Equal(t, "Phase 2 – Boss", phases[1].Name)
	assert.Equal(t, 1, phases[1].Order)
	assert.Equal(t, transitionTime.Sub(start).Milliseconds(), phases[1].StartOffsetMs)
	assert.Equal(t, end.Sub(start).Milliseconds(), phases[1].EndOffsetMs)
}

func TestRazorgorePhaseDetector_DuplicateCastsIgnored(t *testing.T) {
	t.Parallel()
	factories := instances.BWLPhaseDetectorFactories(database.WoWFlavor{database.FlavorNightmareOfUrsol})
	det := factories[0]()
	start := time.Date(2025, 1, 1, 12, 0, 0, 0, time.UTC)
	end := start.Add(5 * time.Minute)

	// Feed 20 + 10 extra casts.
	for i := 0; i < 30; i++ {
		det.ProcessMessage(razorgoreSpellGo(start.Add(time.Duration(i) * time.Second)))
	}

	phases := det.Finalize(uuid.New(), start, end)
	require.Len(t, phases, 2)
	// Phase 2 start should match the 20th cast, not a later one.
	assert.Equal(t, int64(19000), phases[1].StartOffsetMs)
}

func TestRazorgorePhaseDetector_Reset(t *testing.T) {
	t.Parallel()
	factories := instances.BWLPhaseDetectorFactories(database.WoWFlavor{database.FlavorNightmareOfUrsol})
	det := factories[0]()
	start := time.Date(2025, 1, 1, 12, 0, 0, 0, time.UTC)
	end := start.Add(5 * time.Minute)

	// Reach threshold.
	for i := 0; i < 20; i++ {
		det.ProcessMessage(razorgoreSpellGo(start.Add(time.Duration(i) * time.Second)))
	}
	require.Len(t, det.Finalize(uuid.New(), start, end), 2)

	det.Reset()

	// After reset, 5 casts should produce only the always-present Phase 1.
	for i := 0; i < 5; i++ {
		det.ProcessMessage(razorgoreSpellGo(start.Add(time.Duration(i) * time.Second)))
	}
	phases := det.Finalize(uuid.New(), start, end)
	require.Len(t, phases, 1)
	assert.Equal(t, "razorgore_p1", phases[0].Key)
}

func TestRazorgorePhaseDetector_WrongSpell(t *testing.T) {
	t.Parallel()
	factories := instances.BWLPhaseDetectorFactories(database.WoWFlavor{database.FlavorNightmareOfUrsol})
	det := factories[0]()
	start := time.Date(2025, 1, 1, 12, 0, 0, 0, time.UTC)
	end := start.Add(5 * time.Minute)

	// Feed 25 casts with wrong spell ID.
	caster := phaseTestCreatureGUID(12435, 1)
	for i := 0; i < 25; i++ {
		det.ProcessMessage(&messages.SpellGo{
			MessageBase: messages.Base(start.Add(time.Duration(i) * time.Second)),
			Caster:      caster,
			SpellData:   &chrondbc.Spell{ID: 22425}, // different spell
		})
	}
	phases := det.Finalize(uuid.New(), start, end)
	require.Len(t, phases, 1)
	assert.Equal(t, "razorgore_p1", phases[0].Key)
}

func TestRazorgorePhaseDetector_WrongCaster(t *testing.T) {
	t.Parallel()
	factories := instances.BWLPhaseDetectorFactories(database.WoWFlavor{database.FlavorNightmareOfUrsol})
	det := factories[0]()
	start := time.Date(2025, 1, 1, 12, 0, 0, 0, time.UTC)
	end := start.Add(5 * time.Minute)

	// Feed 25 casts from wrong creature entry.
	caster := phaseTestCreatureGUID(99999, 1)
	for i := 0; i < 25; i++ {
		det.ProcessMessage(&messages.SpellGo{
			MessageBase: messages.Base(start.Add(time.Duration(i) * time.Second)),
			Caster:      caster,
			SpellData:   &chrondbc.Spell{ID: 19873},
		})
	}
	phases := det.Finalize(uuid.New(), start, end)
	require.Len(t, phases, 1)
	assert.Equal(t, "razorgore_p1", phases[0].Key)
}

func TestPhaseFromTimes(t *testing.T) {
	t.Parallel()
	encStart := time.Date(2025, 1, 1, 12, 0, 0, 0, time.UTC)
	phaseStart := encStart.Add(10 * time.Second)
	phaseEnd := encStart.Add(30 * time.Second)

	id := [16]byte{1}
	p := encounter.PhaseFromTimes(id, "test_key", "Test Phase", 0, encStart, phaseStart, phaseEnd)
	assert.Equal(t, "test_key", p.Key)
	assert.Equal(t, "Test Phase", p.Name)
	assert.Equal(t, int64(10000), p.StartOffsetMs)
	assert.Equal(t, int64(30000), p.EndOffsetMs)
}
