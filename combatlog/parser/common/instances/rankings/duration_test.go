package rankings

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounter"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/stretchr/testify/require"
)

func TestDurationTargetsDefaultsToDamageTargets(t *testing.T) {
	t.Parallel()
	var absent *Rankings
	require.Equal(t, DamageTargets{}, absent.DurationTargets("Garr"))
	rules := &Rankings{DamageByEncounter: map[string]DamageTargets{
		"Garr": {Mode: DamageTargetsEntries, EntryIDs: []uint32{12057, 12099}},
	}}
	require.Equal(t, rules.DamageByEncounter["Garr"], rules.DurationTargets("Garr"))
	rules.DurationByEncounter = map[string]DamageTargets{"Garr": {Mode: DamageTargetsBossOnly}}
	require.Equal(t, DamageTargets{Mode: DamageTargetsBossOnly}, rules.DurationTargets("Garr"))
}

func TestRankingWindow(t *testing.T) {
	t.Parallel()
	base := time.Date(2026, time.January, 1, 0, 0, 0, 0, time.UTC)
	boss := makeCreatureGUID(100, 1)
	add := makeCreatureGUID(101, 2)
	trash := makeCreatureGUID(102, 3)
	activity := func(start, end int, state period.EndState) []period.Period {
		return []period.Period{{
			Start:    &period.Moment{Timestamp: &messages.Damage{MessageBase: messages.Base(base.Add(time.Duration(start) * time.Second))}},
			End:      &period.Moment{Timestamp: &messages.Damage{MessageBase: messages.Base(base.Add(time.Duration(end) * time.Second))}},
			EndState: state,
		}}
	}
	fight := encounter.Fight{
		Start: base, End: base.Add(90 * time.Second),
		Hostiles: map[guid.GUID]encounter.CharacterFight{
			boss:  {Activity: activity(10, 65, period.EndStateSlain)},
			add:   {Activity: activity(15, 70, period.EndStateSlain)},
			trash: {Activity: activity(0, 90, period.EndStateSlain)},
		},
	}
	isBoss := func(id guid.GUID) bool { return id == boss }
	cases := []struct {
		name       string
		rule       DamageTargets
		start, end int
	}{
		{"boss only", DamageTargets{Mode: DamageTargetsBossOnly}, 10, 65},
		{"whitelisted add extends the duration", DamageTargets{Mode: DamageTargetsEntries, EntryIDs: []uint32{100, 101}}, 10, 70},
		{"missing rule uses full encounter", DamageTargets{}, 0, 0},
		{"missing selected unit uses full encounter", DamageTargets{Mode: DamageTargetsEntries, EntryIDs: []uint32{999}}, 0, 0},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			window := RankingWindow(fight, tc.rule, isBoss)
			if tc.end == 0 {
				require.Nil(t, window)
				return
			}
			require.Equal(t, base.Add(time.Duration(tc.start)*time.Second), window.Start)
			require.Equal(t, base.Add(time.Duration(tc.end)*time.Second), window.End)
		})
	}

	incomplete := fight
	incomplete.Hostiles = make(map[guid.GUID]encounter.CharacterFight, len(fight.Hostiles))
	for id, hostile := range fight.Hostiles {
		incomplete.Hostiles[id] = hostile
	}
	incomplete.Hostiles[add] = encounter.CharacterFight{Activity: activity(15, 90, period.EndStateReset)}
	require.Nil(t, RankingWindow(incomplete, DamageTargets{Mode: DamageTargetsEntries, EntryIDs: []uint32{100, 101}}, isBoss), "a surviving selected add falls back to full fight")
	incomplete.Hostiles[add] = encounter.CharacterFight{Activity: append(activity(15, 25, period.EndStateReset), activity(30, 70, period.EndStateSlain)...)}
	require.Nil(t, RankingWindow(incomplete, DamageTargets{Mode: DamageTargetsEntries, EntryIDs: []uint32{100, 101}}, isBoss), "a restarted selected unit is not a clean activation")
}
