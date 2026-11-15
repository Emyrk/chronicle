package participants

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parsernext/formats/cleu"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestEnvironmentalSourceIsNotParticipant(t *testing.T) {
	t.Parallel()
	decoder, err := cleu.NewDecoder(cleu.Context{Format: database.LogFormat335aCcAddon, Flavor: database.WoWFlavor{database.FlavorWrath}}, cleu.Hooks{})
	require.NoError(t, err)
	at := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	event, fields, err := cleu.ParsePayload(`ENVIRONMENTAL_DAMAGE,0x0000000000000000,nil,0x80000000,0x0000000000000001,"Player",0x511,FALLING,250,0,1,0,0,0,nil,nil,nil`)
	require.NoError(t, err)
	decoded, err := decoder.Decode(at, event, cleu.NewFields(fields), "")
	require.NoError(t, err)
	require.Len(t, decoded, 1)
	damage := decoded[0].(*messages.Damage)
	require.NotNil(t, damage.Caster)
	require.True(t, damage.Caster.IsZero())
	require.Equal(t, int32(250), damage.Amount)
	tracker := New()
	newChars := func() *characters.Characters {
		return characters.NewCharacters(unitdb.New(), nil, identifier.NewIdentifier(nil))
	}
	chars := newChars()
	chars.RegisterHook(tracker)
	_, err = chars.Process(damage)
	require.NoError(t, err)
	// Unknown-source character activity and damage attribution are preserved;
	// only participant membership excludes the absent actor.
	unknown, ok := chars.Get(0)
	require.True(t, ok)
	require.True(t, unknown.IsActive())
	require.Equal(t, map[guid.GUID]bool{1: true}, tracker.Active)
	fight := uuid.MustParse("11111111-2222-3333-4444-555555555555")
	tracker.FightStarted(fight, damage)
	require.Equal(t, map[guid.GUID]struct{}{1: {}}, tracker.known)
	r := ownergraph.NewRegistry()
	require.NoError(t, RegisterGraphOwner(r))
	snapshot, err := r.Capture(tracker)
	require.NoError(t, err)
	wire, err := json.Marshal(snapshot)
	require.NoError(t, err)
	var disk ownergraph.Snapshot
	require.NoError(t, json.Unmarshal(wire, &disk))
	root, err := r.Restore(disk)
	require.NoError(t, err)
	restored := root.(*Tracker)
	// Reconstruct the unchanged character prefix separately, then bind the
	// restored hook so subsequent production activity reaches both trackers.
	restoredChars := newChars()
	_, err = restoredChars.Process(damage)
	require.NoError(t, err)
	restoredChars.RegisterHook(restored)
	boss := guid.GUID(0xF130000064000001)
	for _, message := range []messages.Message{
		&messages.Damage{MessageBase: messages.Base(at.Add(time.Second)), Caster: &boss, Target: 1, Amount: 10},
		&messages.Slain{MessageBase: messages.Base(at.Add(2 * time.Second)), Victim: 1},
		&messages.Resurrection{MessageBase: messages.Base(at.Add(3 * time.Second)), Source: 0, Target: 1},
	} {
		_, err = chars.Process(message)
		require.NoError(t, err)
		_, err = restoredChars.Process(message)
		require.NoError(t, err)
		require.NoError(t, tracker.ProcessMessage(true, fight, message))
		require.NoError(t, restored.ProcessMessage(true, fight, message))
		require.Equal(t, tracker.NoKnownParticipantsAlive(), restored.NoKnownParticipantsAlive())
		_, slain := message.(*messages.Slain)
		require.Equal(t, slain, restored.NoKnownParticipantsAlive(), "death and resurrection retain wipe detection semantics")
	}
	tracker.FightEnded(fight, messages.TimedOut(at.Add(time.Minute)))
	restored.FightEnded(fight, messages.TimedOut(at.Add(time.Minute)))
	want, err := r.Capture(tracker)
	require.NoError(t, err)
	got, err := r.Capture(restored)
	require.NoError(t, err)
	require.Equal(t, want, got)
	require.Equal(t, map[guid.GUID]bool{1: true, boss: true}, restored.Active)
	require.NotContains(t, restored.known, guid.GUID(0))
	require.NotContains(t, restored.dead, guid.GUID(0))
}

func TestTrackerStillRejectsZeroParticipantState(t *testing.T) {
	t.Parallel()
	tracker := New()
	tracker.Active[0] = true
	_, err := tracker.CaptureState()
	require.ErrorContains(t, err, "invalid active participant")
	for _, payload := range []string{
		`{"active":[{"guid":"0x0000000000000000","active":true}],"fight_active":true,"known":[],"dead":[]}`,
		`{"active":[],"fight_active":true,"known":["0x0000000000000000"],"dead":[]}`,
		`{"active":[],"fight_active":true,"known":[],"dead":["0x0000000000000000"]}`,
	} {
		_, err := DecodeTrackerState(TrackerStateVersion, []byte(payload))
		require.Error(t, err)
	}
}
