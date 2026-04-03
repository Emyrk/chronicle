package unitdb_test

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/unitinfo"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/unitdb"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Gophercraft/core/i18n"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func makeSpell(name string) *chrondbc.Spell {
	return &chrondbc.Spell{
		Name_lang: i18n.Text{i18n.English: name},
	}
}

func mustGUID(s string) guid.GUID {
	g, err := guid.FromString(s)
	if err != nil {
		panic(err)
	}
	return g
}

func TestUnitTypeFromGUID(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		guid     guid.GUID
		expected unitdb.UnitType
	}{
		{"player", mustGUID("0x0000000000000001"), unitdb.UnitTypePlayer},
		{"creature", mustGUID("0x0030000000000001"), unitdb.UnitTypeCreature},
		{"pet GUID maps to creature", mustGUID("0x0040000000000001"), unitdb.UnitTypeCreature},
		{"object", mustGUID("0x0010000000000001"), unitdb.UnitTypeObject},
		{"vehicle", mustGUID("0x0050000000000001"), unitdb.UnitTypeVehicle},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			assert.Equal(t, tc.expected, unitdb.UnitTypeFromGUID(tc.guid))
		})
	}
}

func TestClassify_Basic(t *testing.T) {
	t.Parallel()

	playerGUID := mustGUID("0x0000000000000001")
	creatureGUID := mustGUID("0x0030000000000002")

	units := unitdb.New()
	units.Update(unitinfo.Info{
		Guid:         playerGUID,
		IsPlayer:     true,
		Name:         "TestPlayer",
		CanCooperate: true,
	})
	units.Update(unitinfo.Info{
		Guid:         creatureGUID,
		Name:         "TestMob",
		CanCooperate: false,
	})

	t.Run("player is friendly", func(t *testing.T) {
		t.Parallel()
		c := units.Classify(playerGUID)
		assert.Equal(t, unitdb.UnitTypePlayer, c.Type)
		assert.Equal(t, unitdb.AffiliationFriendly, c.Affiliation)
		assert.False(t, c.Relation.HasOwner())
		assert.Nil(t, c.Possession)
	})

	t.Run("hostile creature", func(t *testing.T) {
		t.Parallel()
		c := units.Classify(creatureGUID)
		assert.Equal(t, unitdb.UnitTypeCreature, c.Type)
		assert.Equal(t, unitdb.AffiliationHostile, c.Affiliation)
		assert.Nil(t, c.Possession)
	})

	t.Run("unknown GUID returns unknown type", func(t *testing.T) {
		t.Parallel()
		unknownGUID := mustGUID("0x0030000000000099")
		c := units.Classify(unknownGUID)
		assert.Equal(t, unitdb.UnitTypeCreature, c.Type)
		assert.Equal(t, unitdb.AffiliationUnknown, c.Affiliation)
	})
}

func TestClassify_WithOwner(t *testing.T) {
	t.Parallel()

	playerGUID := mustGUID("0x0000000000000001")
	petGUID := mustGUID("0x0040000000000002")

	units := unitdb.New()
	units.Update(unitinfo.Info{
		Guid:         petGUID,
		Name:         "Imp",
		CanCooperate: true,
		Owner:        &playerGUID,
	})

	c := units.Classify(petGUID)
	assert.Equal(t, unitdb.UnitTypeCreature, c.Type, "pet GUID should be classified as creature")
	assert.Equal(t, unitdb.AffiliationFriendly, c.Affiliation)
	require.True(t, c.Relation.HasOwner())
	assert.Equal(t, playerGUID, *c.Relation.Owner)
}

func TestClassify_Possession(t *testing.T) {
	t.Parallel()

	playerGUID := mustGUID("0x0000000000000001")
	mobGUID := mustGUID("0x0030000000000002")
	now := time.Now()

	units := unitdb.New()
	units.Update(unitinfo.Info{
		Guid:         mobGUID,
		Name:         "Scarlet Monk",
		CanCooperate: false,
	})

	// Before possession: hostile
	c := units.Classify(mobGUID)
	assert.Equal(t, unitdb.AffiliationHostile, c.Affiliation)
	assert.Nil(t, c.Possession)

	// Set possessed (with 10s duration)
	mcSpell := makeSpell("Mind Control")
	units.SetPossessed(mobGUID, playerGUID, mcSpell, now, 10*time.Second)
	c = units.Classify(mobGUID)
	assert.Equal(t, unitdb.AffiliationFriendly, c.Affiliation, "possessed hostile should become friendly")
	require.NotNil(t, c.Possession)
	assert.Equal(t, playerGUID, c.Possession.Controller)
	assert.Equal(t, mcSpell, c.Possession.Spell)
	assert.Equal(t, now.Add(10*time.Second), c.Possession.ExpiresAt)

	// Clear possession
	units.ClearPossessed(mobGUID)
	c = units.Classify(mobGUID)
	assert.Equal(t, unitdb.AffiliationHostile, c.Affiliation, "should revert to hostile")
	assert.Nil(t, c.Possession)
}

func TestPossession_ExpiresAutomatically(t *testing.T) {
	t.Parallel()

	playerGUID := mustGUID("0x0000000000000001")
	mobGUID := mustGUID("0x0030000000000002")
	now := time.Now()

	units := unitdb.New()
	units.Update(unitinfo.Info{
		Guid:         mobGUID,
		Name:         "Scarlet Monk",
		CanCooperate: false,
	})

	// Possess with 5s duration
	units.SetPossessed(mobGUID, playerGUID, makeSpell("Mind Control"), now, 5*time.Second)
	assert.Equal(t, unitdb.AffiliationFriendly, units.Classify(mobGUID).Affiliation)

	// Send a message at now+3s — possession still active
	units.ProcessMessage(&messages.NewOwner{
		MessageBase: messages.Base(now.Add(3 * time.Second)),
		Target:      mustGUID("0x0030000000000099"), // unrelated
		NewOwner:    playerGUID,
	})
	assert.Equal(t, unitdb.AffiliationFriendly, units.Classify(mobGUID).Affiliation, "should still be possessed before expiry")

	// Send a message at now+6s — possession should have expired
	units.ProcessMessage(&messages.NewOwner{
		MessageBase: messages.Base(now.Add(6 * time.Second)),
		Target:      mustGUID("0x0030000000000099"),
		NewOwner:    playerGUID,
	})
	assert.Equal(t, unitdb.AffiliationHostile, units.Classify(mobGUID).Affiliation, "should revert to hostile after expiry")
	assert.Nil(t, units.Classify(mobGUID).Possession)
}

func TestPossession_NoDuration_NoExpiry(t *testing.T) {
	t.Parallel()

	playerGUID := mustGUID("0x0000000000000001")
	mobGUID := mustGUID("0x0030000000000002")
	now := time.Now()

	units := unitdb.New()
	units.Update(unitinfo.Info{
		Guid:         mobGUID,
		Name:         "Scarlet Monk",
		CanCooperate: false,
	})

	// Possess with 0 duration — no expiry
	units.SetPossessed(mobGUID, playerGUID, makeSpell("Mind Control"), now, 0)

	c := units.Classify(mobGUID)
	require.NotNil(t, c.Possession)
	assert.True(t, c.Possession.ExpiresAt.IsZero(), "zero duration should mean no expiry")

	// Even a much later message won't expire it
	units.ProcessMessage(&messages.NewOwner{
		MessageBase: messages.Base(now.Add(time.Hour)),
		Target:      mustGUID("0x0030000000000099"),
		NewOwner:    playerGUID,
	})
	assert.Equal(t, unitdb.AffiliationFriendly, units.Classify(mobGUID).Affiliation)
}

func TestProcessMessage_NewOwner(t *testing.T) {
	t.Parallel()

	playerGUID := mustGUID("0x0000000000000001")
	petGUID := mustGUID("0x0040000000000002")
	now := time.Now()

	units := unitdb.New()
	units.Update(unitinfo.Info{
		Guid: petGUID,
		Name: "Imp",
	})

	units.ProcessMessage(&messages.NewOwner{
		MessageBase: messages.Base(now),
		Target:      petGUID,
		NewOwner:    playerGUID,
	})

	c := units.Classify(petGUID)
	require.True(t, c.Relation.HasOwner())
	assert.Equal(t, playerGUID, *c.Relation.Owner)
}

func TestProcessMessage_PossessionGainAndRelease(t *testing.T) {
	t.Parallel()

	playerGUID := mustGUID("0x0000000000000001")
	mobGUID := mustGUID("0x0030000000000002")
	now := time.Now()
	mcSpell := makeSpell("Mind Control")

	units := unitdb.New()
	units.Update(unitinfo.Info{
		Guid:         mobGUID,
		Name:         "Scarlet Monk",
		CanCooperate: false,
	})

	// Gain possession via ProcessMessage
	units.ProcessMessage(&messages.PossessionChange{
		MessageBase: messages.Base(now),
		Target:      mobGUID,
		Controller:  playerGUID,
		Spell:       mcSpell,
		Gained:   true,
		Duration: 10 * time.Second,
	})
	assert.Equal(t, unitdb.AffiliationFriendly, units.Classify(mobGUID).Affiliation)

	// Release possession via ProcessMessage
	units.ProcessMessage(&messages.PossessionChange{
		MessageBase: messages.Base(now.Add(5 * time.Second)),
		Target:      mobGUID,
		Spell:       mcSpell,
		Gained:      false,
	})
	assert.Equal(t, unitdb.AffiliationHostile, units.Classify(mobGUID).Affiliation)
}
