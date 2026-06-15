package synthetic

import (
	"log/slog"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/ptr"
)

const (
	// Player GUIDs (high bits 0x0000).
	testPlayerGUID  = guid.GUID(0x0000000000001234)
	testPlayer2GUID = guid.GUID(0x0000000000005678)
	// Pet GUIDs (high bits 0xF140).
	testPetGUID  = guid.GUID(0xF1400367E6000009)
	testPet2GUID = guid.GUID(0xF1400367E600000E)
)

var testTS = time.Date(2025, 6, 7, 13, 48, 0, 0, time.UTC)

func testNames() *mockNameResolver {
	return &mockNameResolver{
		names: map[guid.GUID]string{
			testPlayerGUID:  "Laraheredari",
			testPlayer2GUID: "Icewithtea",
			testPetGUID:     "Flaaroon",
			testPet2GUID:    "KUCING",
		},
	}
}

func TestPetOwnership_HealMendPet(t *testing.T) {
	t.Parallel()
	po := newPetOwnership(slog.Default(), testNames())

	msgs := []messages.Message{
		&messages.Heal{
			MessageBase: messages.Base(testTS),
			Caster:      testPlayerGUID,
			Target:      testPetGUID,
			SpellData:   &chrondbc.Spell{ID: 48990}, // Mend Pet
		},
	}

	result := po.ProcessMessages(msgs)
	require.Len(t, result, 3, "expected original + NewOwner + UnitClassificationEvent")

	no, ok := result[1].(*messages.NewOwner)
	require.True(t, ok, "second message should be NewOwner")
	assert.Equal(t, testPetGUID, no.Target)
	assert.Equal(t, testPlayerGUID, no.NewOwner)

	uce, ok := result[2].(*messages.UnitClassificationEvent)
	require.True(t, ok, "third message should be UnitClassificationEvent")
	assert.Equal(t, testPetGUID, uce.Target)
	assert.NotNil(t, uce.Owner)
	assert.Equal(t, testPlayerGUID, *uce.Owner)
}

func TestPetOwnership_HealFelSynergy(t *testing.T) {
	t.Parallel()
	po := newPetOwnership(slog.Default(), testNames())

	msgs := []messages.Message{
		&messages.Heal{
			MessageBase: messages.Base(testTS),
			Caster:      testPlayerGUID,
			Target:      testPetGUID,
			SpellData:   &chrondbc.Spell{ID: 54181}, // Fel Synergy
		},
	}

	result := po.ProcessMessages(msgs)
	require.Len(t, result, 3)
	no := result[1].(*messages.NewOwner)
	assert.Equal(t, testPetGUID, no.Target)
	assert.Equal(t, testPlayerGUID, no.NewOwner)
}

func TestPetOwnership_AuraPetToPlayer(t *testing.T) {
	t.Parallel()
	po := newPetOwnership(slog.Default(), testNames())

	// Master Demonologist: pet applies buff to player.
	msgs := []messages.Message{
		&messages.Aura{
			MessageBase: messages.Base(testTS),
			IsBuff:      true,
			Source:      ptr.Ref(testPetGUID),
			Target:      testPlayerGUID,
			SpellData:   &chrondbc.Spell{ID: 35706}, // Master Demonologist
		},
	}

	result := po.ProcessMessages(msgs)
	require.Len(t, result, 3)
	no := result[1].(*messages.NewOwner)
	assert.Equal(t, testPetGUID, no.Target)
	assert.Equal(t, testPlayerGUID, no.NewOwner)
}

func TestPetOwnership_AuraPlayerToPet(t *testing.T) {
	t.Parallel()
	po := newPetOwnership(slog.Default(), testNames())

	// Player applies a known pet-owner spell on a pet.
	msgs := []messages.Message{
		&messages.Aura{
			MessageBase: messages.Base(testTS),
			IsBuff:      true,
			Source:      ptr.Ref(testPlayerGUID),
			Target:      testPetGUID,
			SpellData:   &chrondbc.Spell{ID: 35696}, // Demonic Knowledge
		},
	}

	result := po.ProcessMessages(msgs)
	require.Len(t, result, 3)
	no := result[1].(*messages.NewOwner)
	assert.Equal(t, testPetGUID, no.Target)
	assert.Equal(t, testPlayerGUID, no.NewOwner)
}

func TestPetOwnership_Duplicate(t *testing.T) {
	t.Parallel()
	po := newPetOwnership(slog.Default(), testNames())

	heal := &messages.Heal{
		MessageBase: messages.Base(testTS),
		Caster:      testPlayerGUID,
		Target:      testPetGUID,
		SpellData:   &chrondbc.Spell{ID: 48990},
	}

	// First call should emit ownership.
	result := po.ProcessMessages([]messages.Message{heal})
	require.Len(t, result, 3)

	// Second call for same pet should NOT emit again.
	result2 := po.ProcessMessages([]messages.Message{heal})
	require.Len(t, result2, 1, "no new ownership messages for already-emitted pet")
}

func TestPetOwnership_NonPetOwnerSpell(t *testing.T) {
	t.Parallel()
	po := newPetOwnership(slog.Default(), testNames())

	// Rejuvenation (not a pet-owner spell) cast on a pet.
	msgs := []messages.Message{
		&messages.Heal{
			MessageBase: messages.Base(testTS),
			Caster:      testPlayer2GUID,
			Target:      testPetGUID,
			SpellData:   &chrondbc.Spell{ID: 48441}, // Rejuvenation
		},
	}

	result := po.ProcessMessages(msgs)
	require.Len(t, result, 1, "non-pet-owner spell should not trigger ownership")
}

func TestPetOwnership_AlreadyOwnedViaSummon(t *testing.T) {
	t.Parallel()
	po := newPetOwnership(slog.Default(), testNames())

	// Batch contains a NewOwner from suffixSummon AND a heal.
	msgs := []messages.Message{
		&messages.NewOwner{
			MessageBase: messages.Base(testTS),
			Target:      testPetGUID,
			NewOwner:    testPlayerGUID,
		},
		&messages.Heal{
			MessageBase: messages.Base(testTS),
			Caster:      testPlayerGUID,
			Target:      testPetGUID,
			SpellData:   &chrondbc.Spell{ID: 54181},
		},
	}

	result := po.ProcessMessages(msgs)
	require.Len(t, result, 2, "no extra NewOwner when one already exists in batch")
}

func TestPetOwnership_NilSpellData(t *testing.T) {
	t.Parallel()
	po := newPetOwnership(slog.Default(), testNames())

	msgs := []messages.Message{
		&messages.Heal{
			MessageBase: messages.Base(testTS),
			Caster:      testPlayerGUID,
			Target:      testPetGUID,
			SpellData:   nil,
		},
		&messages.Aura{
			MessageBase: messages.Base(testTS),
			Source:      nil,
			Target:      testPetGUID,
			SpellData:   nil,
		},
	}

	result := po.ProcessMessages(msgs)
	require.Len(t, result, 2, "nil SpellData should be skipped gracefully")
}

func TestPetOwnership_MultiplePets(t *testing.T) {
	t.Parallel()
	po := newPetOwnership(slog.Default(), testNames())

	msgs := []messages.Message{
		&messages.Heal{
			MessageBase: messages.Base(testTS),
			Caster:      testPlayerGUID,
			Target:      testPetGUID,
			SpellData:   &chrondbc.Spell{ID: 54181}, // Fel Synergy → Flaaroon
		},
		&messages.Heal{
			MessageBase: messages.Base(testTS),
			Caster:      testPlayer2GUID,
			Target:      testPet2GUID,
			SpellData:   &chrondbc.Spell{ID: 48990}, // Mend Pet → KUCING
		},
	}

	result := po.ProcessMessages(msgs)
	// 2 originals + 2 NewOwner + 2 UnitClassificationEvent = 6
	require.Len(t, result, 6)

	no1 := result[2].(*messages.NewOwner)
	assert.Equal(t, testPetGUID, no1.Target)
	assert.Equal(t, testPlayerGUID, no1.NewOwner)

	no2 := result[4].(*messages.NewOwner)
	assert.Equal(t, testPet2GUID, no2.Target)
	assert.Equal(t, testPlayer2GUID, no2.NewOwner)
}

func TestPetOwnership_SyntheticFlag(t *testing.T) {
	t.Parallel()
	po := newPetOwnership(slog.Default(), testNames())

	msgs := []messages.Message{
		&messages.Heal{
			MessageBase: messages.Base(testTS),
			Caster:      testPlayerGUID,
			Target:      testPetGUID,
			SpellData:   &chrondbc.Spell{ID: 48990},
		},
	}

	result := po.ProcessMessages(msgs)
	require.Len(t, result, 3)

	no := result[1].(*messages.NewOwner)
	assert.True(t, no.Synthetic, "NewOwner should be marked as synthetic")

	uce := result[2].(*messages.UnitClassificationEvent)
	assert.True(t, uce.Synthetic, "UnitClassificationEvent should be marked as synthetic")
}
