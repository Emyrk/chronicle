package armory

import (
	"encoding/json"
	"fmt"
	"github.com/Emyrk/chronicle/combatlog/parser/common/auras"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/combatlog/parser/types/unitinfo"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"testing"
)

func armoryBytes(t *testing.T, tracker *Tracker) []byte {
	t.Helper()
	s, e := tracker.CaptureState()
	require.NoError(t, e)
	b, e := s.Encode()
	require.NoError(t, e)
	return b
}
func TestArmoryStateEveryRespecBoundary(t *testing.T) {
	t.Parallel()
	talents := func() *messages.CombatantTalents {
		return &messages.CombatantTalents{Guid: 1, PlayerName: "Mage", Tabs: [3]messages.CombatantTalentTab{{TabName: "Arcane", RankDigits: "51"}}}
	}
	player := func(item int) *messages.Combatant {
		return &messages.Combatant{Combatant: combatant.Combatant{Guid: 1, Name: "Mage", Guild: &combatant.Guild{Name: "Guild"}, GearSetups: []combatant.GearItem{{ItemID: item}}, Talents: &combatant.Talents{TabNames: [3]string{"Arcane"}, Summary: [3]uint8{6}, Trees: [3][]uint8{{5, 1}, {}, {}}}}}
	}
	respecUnit := func() *messages.Unit {
		return &messages.Unit{Info: unitinfo.Info{Guid: 1, Level: 60, Buffs: []unitinfo.Buff{{ID: respecAuraSpellID, Applications: 1}}}}
	}
	steps := []func(*Tracker){
		func(tr *Tracker) { require.NoError(t, tr.ProcessMessage(false, uuid.Nil, talents())) },
		func(tr *Tracker) {
			m := player(100)
			require.NoError(t, tr.units.ProcessMessage(m))
			require.NoError(t, tr.ProcessMessage(false, uuid.Nil, m))
		},
		func(tr *Tracker) {
			id := guid.GUID(1)
			require.NoError(t, tr.ProcessMessage(true, uuid.Nil, &messages.Damage{Caster: &id}))
		},
		func(tr *Tracker) {
			require.NoError(t, tr.ProcessMessage(false, uuid.Nil, &messages.Transmog{PlayerName: "Mage", Transmogs: []combatant.Transmog{{Slot: 0, ItemID: 200, TransmogID: 300}}}))
		},
		func(tr *Tracker) {
			m := respecUnit()
			require.NoError(t, tr.units.ProcessMessage(m))
			require.NoError(t, tr.ProcessMessage(false, uuid.Nil, m))
		},
		func(tr *Tracker) {
			m := player(200)
			require.NoError(t, tr.units.ProcessMessage(m))
			require.NoError(t, tr.ProcessMessage(false, uuid.Nil, m))
			require.Nil(t, tr.units.Players[1].Talents)
		},
		func(tr *Tracker) {
			require.NoError(t, tr.ProcessMessage(false, uuid.Nil, talents()))
			require.NotNil(t, tr.units.Players[1].Talents)
		},
		// Persistent UNIT_INFO aura must not re-invalidate after direct repair.
		func(tr *Tracker) {
			require.NoError(t, tr.ProcessMessage(false, uuid.Nil, respecUnit()))
			require.NotNil(t, tr.units.Players[1].Talents)
		},
		func(tr *Tracker) {
			tr.ObserveAura(auras.Notification{Type: auras.NotifyExpired, Unit: 1, SpellID: respecAuraSpellID})
		},
		func(tr *Tracker) {
			require.NoError(t, tr.ProcessMessage(false, uuid.Nil, &messages.Aura{Target: 1, State: types.AuraStateAdded, SpellData: &chrondbc.Spell{ID: respecAuraSpellID}}))
			require.Nil(t, tr.units.Players[1].Talents)
		},
		func(tr *Tracker) {
			require.NoError(t, tr.ProcessMessage(false, uuid.Nil, &messages.Unit{Info: unitinfo.Info{Guid: 1, Level: 60}}))
			require.Contains(t, tr.observedRespecAura, guid.GUID(1))
		},
		func(tr *Tracker) {
			require.NoError(t, tr.ProcessMessage(false, uuid.Nil, &messages.Unit{Info: unitinfo.Info{Guid: 1, Level: 60, Buffs: []unitinfo.Buff{{ID: 123}}}}))
		},
		func(tr *Tracker) {
			m := player(400)
			require.NoError(t, tr.units.ProcessMessage(m))
			require.NoError(t, tr.ProcessMessage(false, uuid.Nil, m))
			require.NotNil(t, tr.units.Players[1].Talents)
		},
	}
	for boundary := 0; boundary <= len(steps); boundary++ {
		t.Run(fmt.Sprint(boundary), func(t *testing.T) {
			original := New(unitdb.New())
			for _, step := range steps[:boundary] {
				step(original)
			}
			captured := armoryBytes(t, original)
			state, e := DecodeState(StateVersion, captured)
			require.NoError(t, e)
			us, e := original.units.CaptureState(nil)
			require.NoError(t, e)
			freshUnits, e := us.Restore(nil)
			require.NoError(t, e)
			// A separate instance history observes the same canonical Units but must
			// remain unchanged when the resumed tracker processes metadata suffixes.
			history := New(freshUnits)
			require.NoError(t, history.RestoreState(state, freshUnits))
			frozen := armoryBytes(t, history)
			restored := new(Tracker)
			before, e := freshUnits.CaptureState(nil)
			require.NoError(t, e)
			require.NoError(t, restored.RestoreState(state, freshUnits))
			require.Same(t, freshUnits, restored.units)
			after, e := freshUnits.CaptureState(nil)
			require.NoError(t, e)
			require.Equal(t, before, after)
			require.Equal(t, captured, armoryBytes(t, restored))
			for _, step := range steps[boundary:] {
				step(original)
				step(restored)
			}
			require.Equal(t, armoryBytes(t, original), armoryBytes(t, restored))
			require.Equal(t, original.units.Players, restored.units.Players)
			require.Equal(t, frozen, armoryBytes(t, history))
			still, e := state.Encode()
			require.NoError(t, e)
			require.Equal(t, captured, still)
		})
	}
}

func TestArmoryStateDeepDetachmentAndMembership(t *testing.T) {
	t.Parallel()
	units := unitdb.New()
	source := New(units)
	id := guid.GUID(1)
	enchant := 7
	source.Player(&messages.Combatant{Combatant: combatant.Combatant{Guid: id, Name: "Mage", GearSetups: []combatant.GearItem{{ItemID: 100, EnchantID: &enchant, BonusIDs: []int{2}}}, Talents: &combatant.Talents{Trees: [3][]uint8{{1}}}}})
	source.PendingTalents[2] = pendingTalent{"Pending", &combatant.Talents{Trees: [3][]uint8{{2}}}}
	source.invalidatedTalentBuild[3] = &combatant.Talents{Trees: [3][]uint8{{3}}}
	source.invalidatedTalentBuild[4] = nil
	state, e := source.CaptureState()
	require.NoError(t, e)
	frozen, e := state.Encode()
	require.NoError(t, e)
	source.PlayerObservations[id].GearSetups[0].BonusIDs[0] = 9
	source.PendingTalents[2].talents.Trees[0][0] = 9
	source.invalidatedTalentBuild[3].Trees[0][0] = 9
	restored := new(Tracker)
	require.NoError(t, restored.RestoreState(state, units))
	require.Equal(t, 2, restored.PlayerObservations[id].GearSetups[0].BonusIDs[0])
	require.Equal(t, uint8(2), restored.PendingTalents[2].talents.Trees[0][0])
	require.Equal(t, uint8(3), restored.invalidatedTalentBuild[3].Trees[0][0])
	require.Contains(t, restored.invalidatedTalentBuild, guid.GUID(4))
	require.Nil(t, restored.invalidatedTalentBuild[4])
	*restored.PlayerObservations[id].GearSetups[0].EnchantID = 99
	restored.PendingTalents[2].talents.Trees[0][0] = 8
	again, e := state.Encode()
	require.NoError(t, e)
	require.Equal(t, frozen, again)
	require.Equal(t, 7, *units.Players[id].GearSetups[0].EnchantID)
	units.UpdatePlayer(combatant.Combatant{Guid: 5, Name: "Unobserved"})
	_, ok := restored.CurrentPlayer(5)
	require.False(t, ok)
	units.UpdatePlayer(combatant.Combatant{Guid: 1, Name: "Mage", GearSetups: []combatant.GearItem{{ItemID: 999}}})
	current, ok := restored.CurrentPlayer(1)
	require.True(t, ok)
	require.Equal(t, 999, current.GearSetups[0].ItemID)
	require.Equal(t, 100, restored.PlayerObservations[1].GearSetups[0].ItemID)
}

func TestArmoryStateRejectsMalformedAndRestoresAtomically(t *testing.T) {
	t.Parallel()
	tracker := New(unitdb.New())
	state, e := tracker.CaptureState()
	require.NoError(t, e)
	data, e := state.Encode()
	require.NoError(t, e)
	var fields map[string]json.RawMessage
	require.NoError(t, json.Unmarshal(data, &fields))
	for name := range fields {
		for _, missing := range []bool{true, false} {
			var values map[string]json.RawMessage
			require.NoError(t, json.Unmarshal(data, &values))
			if missing {
				delete(values, name)
			} else {
				values[name] = json.RawMessage(`null`)
			}
			bad, e := json.Marshal(values)
			require.NoError(t, e)
			_, e = DecodeState(StateVersion, bad)
			require.Error(t, e, name)
		}
	}
	for _, bad := range []string{`null`, `{}`, string(data) + ` {}`, `{"guilds":{},"guilds":{}}`} {
		_, e = DecodeState(StateVersion, []byte(bad))
		require.Error(t, e)
	}
	fields["guilds"] = json.RawMessage(`{"Guild":null}`)
	bad, e := json.Marshal(fields)
	require.NoError(t, e)
	_, e = DecodeState(StateVersion, bad)
	require.Error(t, e)
	_, e = DecodeState(StateVersion+1, data)
	require.Error(t, e)
	before := armoryBytes(t, tracker)
	units := tracker.units
	require.Error(t, tracker.RestoreState(state, nil))
	require.Error(t, tracker.RestoreState(State{}, units))
	require.Same(t, units, tracker.units)
	require.Equal(t, before, armoryBytes(t, tracker))
	tracker.PendingTalents = nil
	_, e = tracker.CaptureState()
	require.Error(t, e)
}
