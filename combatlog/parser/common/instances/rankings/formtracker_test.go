package rankings

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
)

func TestDruidFormTrackerDominantForm(t *testing.T) {
	t.Parallel()

	type formEvent struct {
		at    time.Duration
		name  string
		state types.AuraState
	}
	for _, tt := range []struct {
		name   string
		events []formEvent
		want   druidForm
	}{
		{
			name:   "cat only",
			events: []formEvent{{name: "Cat Form", state: types.AuraStateAdded}},
			want:   druidFormCat,
		},
		{
			name:   "dire bear only",
			events: []formEvent{{name: "Dire Bear Form", state: types.AuraStateAdded}},
			want:   druidFormBear,
		},
		{
			name: "longer cat duration wins",
			events: []formEvent{
				{name: "Cat Form", state: types.AuraStateAdded},
				{at: 40 * time.Second, name: "Cat Form", state: types.AuraStateRemoved},
				{at: 40 * time.Second, name: "Bear Form", state: types.AuraStateAdded},
			},
			want: druidFormCat,
		},
		{
			name: "longer bear duration wins",
			events: []formEvent{
				{name: "Cat Form", state: types.AuraStateAdded},
				{at: 10 * time.Second, name: "Cat Form", state: types.AuraStateRemoved},
				{at: 10 * time.Second, name: "Bear Form", state: types.AuraStateAdded},
			},
			want: druidFormBear,
		},
		{
			name: "equal durations are ambiguous",
			events: []formEvent{
				{name: "Cat Form", state: types.AuraStateAdded},
				{at: 30 * time.Second, name: "Cat Form", state: types.AuraStateRemoved},
				{at: 30 * time.Second, name: "Bear Form", state: types.AuraStateAdded},
			},
		},
		{
			name: "more time than the other form is not enough without 51 percent of the encounter",
			events: []formEvent{
				{name: "Cat Form", state: types.AuraStateAdded},
				{at: 24 * time.Second, name: "Cat Form", state: types.AuraStateRemoved},
				{at: 24 * time.Second, name: "Bear Form", state: types.AuraStateAdded},
				{at: 42 * time.Second, name: "Bear Form", state: types.AuraStateRemoved},
			},
		},
		{
			name: "exactly 51 percent is not dominant",
			events: []formEvent{
				{name: "Cat Form", state: types.AuraStateAdded},
				{at: 30*time.Second + 600*time.Millisecond, name: "Cat Form", state: types.AuraStateRemoved},
			},
		},
		{
			name: "more than 51 percent is dominant",
			events: []formEvent{
				{name: "Cat Form", state: types.AuraStateAdded},
				{at: 30*time.Second + 601*time.Millisecond, name: "Cat Form", state: types.AuraStateRemoved},
			},
			want: druidFormCat,
		},
		{
			name:   "passive aura is ignored",
			events: []formEvent{{name: "Bear Form (Passive)", state: types.AuraStateAdded}},
		},
	} {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			tracker := newDruidFormTracker()
			player := guid.GUID(1)
			start := time.Date(2026, time.October, 25, 12, 0, 0, 0, time.UTC)
			end := start.Add(time.Minute)
			tracker.FightStarted(&messages.Damage{MessageBase: messages.Base(start)})
			for _, event := range tt.events {
				tracker.ProcessMessage(true, &messages.Aura{
					MessageBase: messages.Base(start.Add(event.at)),
					Target:      player,
					SpellName:   event.name,
					State:       event.state,
				})
			}

			require.Equal(t, tt.want, tracker.Dominant(player, end))
		})
	}
}

func TestDruidFormTrackerVanillaAuraApplications(t *testing.T) {
	t.Parallel()

	tracker := newDruidFormTracker()
	player := guid.GUID(1)
	start := time.Date(2026, time.October, 25, 12, 0, 0, 0, time.UTC)
	end := start.Add(time.Minute)
	tracker.FightStarted(&messages.Damage{MessageBase: messages.Base(start)})
	tracker.ProcessMessage(true, &messages.Aura{
		MessageBase: messages.Base(start), Target: player, SpellName: "Cat Form",
		Application: types.AuraApplicationGains,
	})
	tracker.ProcessMessage(true, &messages.Aura{
		MessageBase: messages.Base(start.Add(10 * time.Second)), Target: player, SpellName: "Cat Form",
		Application: types.AuraApplicationFades,
	})
	tracker.ProcessMessage(true, &messages.Aura{
		MessageBase: messages.Base(start.Add(10 * time.Second)), Target: player, SpellName: "Dire Bear Form",
		Application: types.AuraApplicationGains,
	})

	require.Equal(t, druidFormBear, tracker.Dominant(player, end))
}

func TestDruidFormTrackerCarriesFormIntoPull(t *testing.T) {
	t.Parallel()

	tracker := newDruidFormTracker()
	player := guid.GUID(1)
	start := time.Date(2026, time.October, 25, 12, 0, 0, 0, time.UTC)
	end := start.Add(time.Minute)
	tracker.ProcessMessage(false, &messages.Aura{
		MessageBase: messages.Base(start.Add(-time.Minute)), Target: player, SpellName: "Dire Bear Form",
		Application: types.AuraApplicationGains,
	})
	tracker.FightStarted(&messages.Damage{MessageBase: messages.Base(start)})

	require.Equal(t, druidFormBear, tracker.Dominant(player, end))
}

func TestDruidFormTrackerUsesFinalizedFightStart(t *testing.T) {
	t.Parallel()

	tracker := newDruidFormTracker()
	player := guid.GUID(1)
	actualStart := time.Date(2026, time.October, 25, 12, 0, 0, 0, time.UTC)
	hookStart := actualStart.Add(10 * time.Second)
	end := actualStart.Add(30 * time.Second)
	tracker.ProcessMessage(false, &messages.Aura{
		MessageBase: messages.Base(actualStart.Add(-time.Minute)), Target: player, SpellName: "Cat Form",
		Application: types.AuraApplicationGains,
	})
	tracker.FightStarted(&messages.Damage{MessageBase: messages.Base(hookStart)})
	tracker.ProcessMessage(true, &messages.Aura{
		MessageBase: messages.Base(actualStart.Add(20 * time.Second)), Target: player, SpellName: "Bear Form",
		Application: types.AuraApplicationGains,
	})
	require.Equal(t, druidFormUnknown, tracker.Dominant(player, end))

	tracker.FightFinalized(actualStart)
	require.Equal(t, druidFormCat, tracker.Dominant(player, end))
}

func TestDruidFormTrackerClearsFormOnDeath(t *testing.T) {
	t.Parallel()

	tracker := newDruidFormTracker()
	player := guid.GUID(1)
	start := time.Date(2026, time.October, 25, 12, 0, 0, 0, time.UTC)
	tracker.ProcessMessage(false, &messages.Aura{
		MessageBase: messages.Base(start.Add(-time.Minute)), Target: player, SpellName: "Cat Form",
		Application: types.AuraApplicationGains,
	})
	tracker.ProcessMessage(false, &messages.Slain{MessageBase: messages.Base(start.Add(-time.Second)), Victim: player})
	tracker.FightStarted(&messages.Damage{MessageBase: messages.Base(start)})

	require.Equal(t, druidFormUnknown, tracker.Dominant(player, start.Add(time.Minute)))
}
