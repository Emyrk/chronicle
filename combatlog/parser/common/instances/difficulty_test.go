package instances

import (
	"encoding/json"
	"os"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/instancehook"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

type difficultyTestHook struct {
	finalizeLifecycleHook
	mode     string
	override bool
	initial  string
}

func (h *difficultyTestHook) ResolveDifficulty(_ uuid.UUID, initial string) (string, bool) {
	h.initial = initial
	return h.mode, h.override
}

var _ instancehook.DifficultyResolver = (*difficultyTestHook)(nil)

func TestDifficultySnapshotAndFinalization(t *testing.T) {
	t.Parallel()
	data, err := os.ReadFile("testdata/difficulty_transitions.json")
	require.NoError(t, err)
	var fixture struct {
		At           time.Time
		Player, Boss string
		Amount       int32
		Zones        []zone.Zone
	}
	require.NoError(t, json.Unmarshal(data, &fixture))
	player, err := guid.FromString(fixture.Player)
	require.NoError(t, err)
	boss, err := guid.FromString(fixture.Boss)
	require.NoError(t, err)
	entry, ok := boss.GetEntry()
	require.True(t, ok)
	for _, tc := range []struct {
		name, mode string
		override   bool
	}{
		{name: "initial snapshot"},
		{name: "future hard mode", mode: "three_lights", override: true},
		{name: "explicit normal override", override: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			hook := &difficultyTestHook{mode: tc.mode, override: tc.override}
			hostiles := map[uint32]Identity{}
			LoadBosses(hostiles, map[uint32]string{entry: "Lord Marrowgar"})
			h := newFinalizeTestHookableWithHostiles(t, hostiles, hook)
			for i, initial := range fixture.Zones {
				h.UpdateZoneDifficulty(initial)
				at := fixture.At.Add(time.Duration(i) * time.Minute)
				require.NoError(t, h.Process(&messages.Damage{MessageBase: messages.Base(at), Caster: &player, Target: boss, Amount: fixture.Amount}))
				require.NotNil(t, h.currentFight)
				require.Equal(t, initial.DifficultySnapshot(), h.currentFight.Difficulty)
				// A mid-fight update must not mutate the initial snapshot.
				h.UpdateZoneDifficulty(fixture.Zones[1-i])
				require.NoError(t, h.Process(&messages.Slain{MessageBase: messages.Base(at.Add(time.Second)), Victim: boss}))
				require.Len(t, h.Fights(), i+1)
				want := initial.DifficultySnapshot()
				require.Equal(t, want, hook.initial)
				if tc.override {
					want = tc.mode
				}
				require.Equal(t, want, h.Fights()[i].Difficulty)
			}
		})
	}
}
