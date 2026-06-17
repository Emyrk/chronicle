package synthetic

import (
	"log/slog"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/ptr"
)

const (
	// Player GUIDs (high bits 0x0000).
	testPlayerGUID  = guid.GUID(0x0000000000001234)
	testPlayer2GUID = guid.GUID(0x0000000000005678)
	// Pet GUIDs (high bits 0xF140). All three share entry 0x367E6.
	testPetGUID  = guid.GUID(0xF1400367E6000009)
	testPet2GUID = guid.GUID(0xF1400367E600000E)
	testPet3GUID = guid.GUID(0xF1400367E600001A)
)

var testTS = time.Date(2025, 6, 7, 13, 48, 0, 0, time.UTC)

func testNames() *mockNameResolver {
	return &mockNameResolver{
		names: map[guid.GUID]string{
			testPlayerGUID:  "Laraheredari",
			testPlayer2GUID: "Icewithtea",
			testPetGUID:     "Flaaroon",
			testPet2GUID:    "KUCING",
			testPet3GUID:    "Flaaroon", // same name as testPetGUID for weak-inference tests
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
// --- Weak inference tests ---

func TestPetOwnership_WeakInference(t *testing.T) {
	t.Parallel()
	po := newPetOwnership(slog.Default(), testNames())

	// Batch 1: establish strong ownership for testPetGUID → testPlayerGUID.
	batch1 := po.ProcessMessages([]messages.Message{
		&messages.Heal{
			MessageBase: messages.Base(testTS),
			Caster:      testPlayerGUID,
			Target:      testPetGUID,
			SpellData:   &chrondbc.Spell{ID: 48990}, // Mend Pet
		},
	})
	require.Len(t, batch1, 3, "strong signal emits NewOwner + UnitClassificationEvent")

	// Batch 2: testPet3GUID (same name "Flaaroon", same entry) deals damage.
	batch2 := po.ProcessMessages([]messages.Message{
		&messages.Damage{
			MessageBase: messages.Base(testTS),
			Caster:      ptr.Ref(testPet3GUID),
			Target:      guid.GUID(0x0000000000009999), // any enemy
		},
	})
	require.Len(t, batch2, 3, "weak inference emits NewOwner + UnitClassificationEvent")

	no := batch2[1].(*messages.NewOwner)
	assert.Equal(t, testPet3GUID, no.Target)
	assert.Equal(t, testPlayerGUID, no.NewOwner, "inferred owner from name+entry match")
}

func TestPetOwnership_WeakUniqueGuard(t *testing.T) {
	t.Parallel()
	po := newPetOwnership(slog.Default(), testNames())

	// Establish strong ownership for two different owners with same-name pets.
	// testPetGUID (Flaaroon) → testPlayerGUID
	// testPet2GUID (KUCING) → testPlayer2GUID
	// We need a second pet named "Flaaroon" owned by a different player to
	// trigger the unique guard. Manually set up the knownOwners.
	po.ProcessMessages([]messages.Message{
		&messages.Heal{
			MessageBase: messages.Base(testTS),
			Caster:      testPlayerGUID,
			Target:      testPetGUID, // Flaaroon → Laraheredari
			SpellData:   &chrondbc.Spell{ID: 48990},
		},
	})

	// Simulate a second strong owner for the same (name, entry) by directly
	// adding to knownOwners — in practice this happens when a different player
	// also has a pet named "Flaaroon" with the same creature entry.
	entry, ok := testPetGUID.GetEntry()
	require.True(t, ok)
	key := petKey{name: "Flaaroon", entry: entry}
	po.knownOwners[key][testPlayer2GUID] = struct{}{}

	// Now testPet3GUID (Flaaroon, same entry) does damage — should NOT infer.
	batch := po.ProcessMessages([]messages.Message{
		&messages.Damage{
			MessageBase: messages.Base(testTS),
			Caster:      ptr.Ref(testPet3GUID),
			Target:      guid.GUID(0x0000000000009999),
		},
	})
	require.Len(t, batch, 1, "unique guard: no inference when 2 owners share name+entry")
}

func TestPetOwnership_StrongOverridesWeak(t *testing.T) {
	t.Parallel()
	po := newPetOwnership(slog.Default(), testNames())

	// Establish strong ownership for testPetGUID → testPlayerGUID (Flaaroon).
	po.ProcessMessages([]messages.Message{
		&messages.Heal{
			MessageBase: messages.Base(testTS),
			Caster:      testPlayerGUID,
			Target:      testPetGUID,
			SpellData:   &chrondbc.Spell{ID: 48990},
		},
	})

	// Weak-infer testPet3GUID → testPlayerGUID (same name+entry).
	batch := po.ProcessMessages([]messages.Message{
		&messages.Damage{
			MessageBase: messages.Base(testTS),
			Caster:      ptr.Ref(testPet3GUID),
			Target:      guid.GUID(0x0000000000009999),
		},
	})
	require.Len(t, batch, 3, "weak inference emits")
	weakNO := batch[1].(*messages.NewOwner)
	assert.Equal(t, testPlayerGUID, weakNO.NewOwner)

	// Strong signal arrives: testPet3GUID actually belongs to testPlayer2GUID.
	batch2 := po.ProcessMessages([]messages.Message{
		&messages.Heal{
			MessageBase: messages.Base(testTS),
			Caster:      testPlayer2GUID,
			Target:      testPet3GUID,
			SpellData:   &chrondbc.Spell{ID: 54181}, // Fel Synergy
		},
	})
	require.Len(t, batch2, 3, "strong signal overrides weak — re-emits")
	strongNO := batch2[1].(*messages.NewOwner)
	assert.Equal(t, testPet3GUID, strongNO.Target)
	assert.Equal(t, testPlayer2GUID, strongNO.NewOwner, "strong signal corrects weak inference")
}

func TestPetOwnership_StrongBlocksWeak(t *testing.T) {
	t.Parallel()
	po := newPetOwnership(slog.Default(), testNames())

	// Strong ownership for testPetGUID.
	po.ProcessMessages([]messages.Message{
		&messages.Heal{
			MessageBase: messages.Base(testTS),
			Caster:      testPlayerGUID,
			Target:      testPetGUID,
			SpellData:   &chrondbc.Spell{ID: 48990},
		},
	})

	// Same pet does damage — should NOT re-emit (already strong).
	batch := po.ProcessMessages([]messages.Message{
		&messages.Damage{
			MessageBase: messages.Base(testTS),
			Caster:      ptr.Ref(testPetGUID),
			Target:      guid.GUID(0x0000000000009999),
		},
	})
	require.Len(t, batch, 1, "strong ownership blocks weak re-inference for same GUID")
}

func TestPetOwnership_WeakBlocksWeak(t *testing.T) {
	t.Parallel()
	po := newPetOwnership(slog.Default(), testNames())

	// Establish strong owner for testPetGUID to populate knownOwners.
	po.ProcessMessages([]messages.Message{
		&messages.Heal{
			MessageBase: messages.Base(testTS),
			Caster:      testPlayerGUID,
			Target:      testPetGUID,
			SpellData:   &chrondbc.Spell{ID: 48990},
		},
	})

	// Weak-infer testPet3GUID.
	batch := po.ProcessMessages([]messages.Message{
		&messages.Damage{
			MessageBase: messages.Base(testTS),
			Caster:      ptr.Ref(testPet3GUID),
			Target:      guid.GUID(0x0000000000009999),
		},
	})
	require.Len(t, batch, 3, "first weak inference emits")

	// Second damage from same pet — should NOT emit again.
	batch2 := po.ProcessMessages([]messages.Message{
		&messages.Damage{
			MessageBase: messages.Base(testTS),
			Caster:      ptr.Ref(testPet3GUID),
			Target:      guid.GUID(0x0000000000009999),
		},
	})
	require.Len(t, batch2, 1, "duplicate weak inference is blocked")
}

func TestPetOwnership_NoDamageInferenceWithoutKnown(t *testing.T) {
	t.Parallel()
	po := newPetOwnership(slog.Default(), testNames())

	// No prior strong ownership established — damage alone should not infer.
	batch := po.ProcessMessages([]messages.Message{
		&messages.Damage{
			MessageBase: messages.Base(testTS),
			Caster:      ptr.Ref(testPetGUID),
			Target:      guid.GUID(0x0000000000009999),
		},
	})
	require.Len(t, batch, 1, "no inference when no known owners exist for name+entry")
}
// --- Message-type bitmask tests ---

func TestPetOwnership_AuraSoulLink(t *testing.T) {
	t.Parallel()
	po := newPetOwnership(slog.Default(), testNames())

	// Soul Link (25228) is aura-only. Pet applies aura on player.
	msgs := []messages.Message{
		&messages.Aura{
			MessageBase: messages.Base(testTS),
			IsBuff:      true,
			Source:      ptr.Ref(testPetGUID),
			Target:      testPlayerGUID,
			SpellData:   &chrondbc.Spell{ID: 25228},
		},
	}

	result := po.ProcessMessages(msgs)
	require.Len(t, result, 3)
	no := result[1].(*messages.NewOwner)
	assert.Equal(t, testPetGUID, no.Target)
	assert.Equal(t, testPlayerGUID, no.NewOwner)
}

func TestPetOwnership_AuraCastKillCommand(t *testing.T) {
	t.Parallel()
	po := newPetOwnership(slog.Default(), testNames())

	// Kill Command (34026) is auraCast-only. Player casts on pet.
	msgs := []messages.Message{
		&messages.AuraCast{
			MessageBase: messages.Base(testTS),
			Caster:      testPlayerGUID,
			Target:      ptr.Ref(testPetGUID),
			Spell:       &chrondbc.Spell{ID: 34026},
		},
	}

	result := po.ProcessMessages(msgs)
	require.Len(t, result, 3)
	no := result[1].(*messages.NewOwner)
	assert.Equal(t, testPetGUID, no.Target)
	assert.Equal(t, testPlayerGUID, no.NewOwner)
}

func TestPetOwnership_WrongMessageType(t *testing.T) {
	t.Parallel()
	po := newPetOwnership(slog.Default(), testNames())

	// Mend Pet (48990) is heal-only. It should NOT trigger on Aura messages.
	msgs := []messages.Message{
		&messages.Aura{
			MessageBase: messages.Base(testTS),
			IsBuff:      true,
			Source:      ptr.Ref(testPlayerGUID),
			Target:      testPetGUID,
			SpellData:   &chrondbc.Spell{ID: 48990},
		},
	}

	result := po.ProcessMessages(msgs)
	require.Len(t, result, 1, "heal-only spell in Aura message should not trigger ownership")
}


