package serviceeventrepair

import (
	"context"
	"testing"

	"github.com/Emyrk/chronicle/api/chronicleproto"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/proto"
)

func fixtureRazorgorePet(t *testing.T) razorgoreEvidence {
	t.Helper()
	e := fixtureRazorgoreNumeric(t)
	pet := "0xF130003090000001"
	owner := e.Rankings[0].PlayerGuid
	// Keep the owner's direct attack and add two pet attacks, one per phase.
	raw, err := razorgoreFrame(e.Events[0].Events, e.Encounters[0].ID, e.Encounters[0].StartTime.Time)
	require.NoError(t, err)
	events := []proto.Message{}
	for _, b := range raw {
		var damage chronicleproto.Damage
		require.NoError(t, proto.Unmarshal(b, &damage))
		events = append(events, &damage)
	}
	events = append(events,
		&chronicleproto.Damage{Meta: &chronicleproto.EventMeta{Index: 30, OffsetMilli: 60000}, Caster: &pet, Target: e.Hostiles[0].ID.String(), Amount: 120})
	e.Events[0].Events = numericFrame(t, e, events...)
	e.Rankings[0].DamageDone += 120
	e.Events = append(e.Events, database.LogInstanceEvent{InstanceID: e.Instance.ID, Type: database.LogInstanceEventTypeUnitClassification, Events: numericFrame(t, e,
		&chronicleproto.UnitClassification{Meta: &chronicleproto.EventMeta{Index: 0, OffsetMilli: 0}, Target: pet, UnitType: int32(unitdb.UnitTypeCreature), Owner: &owner, Affiliation: int32(unitdb.AffiliationFriendly)},
		&chronicleproto.UnitClassification{Meta: &chronicleproto.EventMeta{Index: 31, OffsetMilli: 60000}, Target: pet, UnitType: int32(unitdb.UnitTypeCreature), Owner: &owner, Affiliation: int32(unitdb.AffiliationFriendly)})})
	return e
}

func TestRazorgoreClassificationProvenPetDamage(t *testing.T) {
	t.Parallel()
	s := &razorgoreStore{e: fixtureRazorgorePet(t)}
	ctx := context.Background()
	p, err := EvaluateRazorgore(ctx, s, s.e.Instance.ID)
	require.NoError(t, err)
	require.False(t, p.RequiresReparse, p.Reason)
	require.NoError(t, RevalidateRazorgore(ctx, s, p))
	require.NoError(t, ApplyRazorgore(ctx, s, p))
	require.EqualValues(t, 350, s.e.Rankings[0].DamageDone)
	require.EqualValues(t, 220, s.e.Rankings[0].UnrankedDamageDone)
	fresh, err := EvaluateRazorgore(ctx, s, s.e.Instance.ID)
	require.NoError(t, err)
	require.False(t, fresh.RequiresReparse, fresh.Reason)
	require.Empty(t, fresh.Changes)
}

func TestRazorgoreClassificationAmbiguity(t *testing.T) {
	t.Parallel()
	for _, kind := range []string{"missing terminal", "controller", "duplicate index", "inconsistent type", "wrong owner", "duplicate terminal"} {
		t.Run(kind, func(t *testing.T) {
			t.Parallel()
			e := fixtureRazorgorePet(t)
			pet := "0xF130003090000001"
			owner := e.Rankings[0].PlayerGuid
			first := &chronicleproto.UnitClassification{Meta: &chronicleproto.EventMeta{Index: 0, OffsetMilli: 0}, Target: pet, UnitType: int32(unitdb.UnitTypeCreature), Owner: &owner}
			last := &chronicleproto.UnitClassification{Meta: &chronicleproto.EventMeta{Index: 31, OffsetMilli: 60000}, Target: pet, UnitType: int32(unitdb.UnitTypeCreature), Owner: &owner}
			events := []proto.Message{first, last}
			switch kind {
			case "missing terminal":
				events = events[:1]
			case "controller":
				first.Controller = &owner
			case "duplicate index":
				first.Meta.Index = 1
			case "inconsistent type":
				last.UnitType = int32(unitdb.UnitTypePlayer)
			case "wrong owner":
				other := e.Rankings[1].PlayerGuid
				last.Owner = &other
			case "duplicate terminal":
				copyLast := proto.Clone(last).(*chronicleproto.UnitClassification)
				copyLast.Meta.Index++
				events = append(events, copyLast)
			}
			e.Events[len(e.Events)-1].Events = numericFrame(t, e, events...)
			s := &razorgoreStore{e: e}
			p, err := EvaluateRazorgore(context.Background(), s, e.Instance.ID)
			require.NoError(t, err)
			require.True(t, p.RequiresReparse)
			require.Empty(t, p.Changes)
			require.Error(t, ApplyRazorgore(context.Background(), s, p))
			require.Empty(t, s.writes)
		})
	}
}
