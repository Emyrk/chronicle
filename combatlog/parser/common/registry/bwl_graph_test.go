package registry

import (
	"encoding/json"
	"io"
	"log/slog"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/encounters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/rankings"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
	"github.com/stretchr/testify/require"
)

func TestPreparedBWLMainRankingWindowsDiskParity(t *testing.T) {
	t.Parallel()
	for _, entry := range []uint32{12435, 11983} {
		fl := database.ServerFlavor("turtle", database.FlavorVanilla)
		format := database.LogFormat112aCcAddon
		ctx := parsectx.With(t.Context(), parsectx.Context{Format: format, Flavor: fl})
		logger := slog.New(slog.NewTextHandler(io.Discard, nil))
		prepare := func() *PreparedGraph {
			p, err := RegistryForFlavor(logger, fl).PrepareGraph(format, &chrondbc.DurationModifierSet{}, &chrondbc.ConsumableCatalog{}, nil)
			require.NoError(t, err)
			return p
		}
		p := prepare()
		state, err := p.NewEncounterState(ctx, logger)
		require.NoError(t, err)
		at := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
		player := guid.GUID(1)
		boss := guid.GUID(0xF130000000000001 | uint64(entry)<<24)
		require.NoError(t, state.Zone(messages.Zone{MessageBase: messages.Base(at), Zone: zone.Zone{Name: "Blackwing Lair", MapID: 469, Seen: at, IsInstance: true}}))
		hit := func(s *encounters.State, second int) {
			require.NoError(t, s.Process(&messages.Damage{MessageBase: messages.Base(at.Add(time.Duration(second) * time.Second)), Caster: &player, Target: boss, Amount: 100}))
		}
		egg := func(s *encounters.State, second int) {
			require.NoError(t, s.Process(&messages.SpellGo{MessageBase: messages.Base(at.Add(time.Duration(second) * time.Second)), Caster: boss, SpellData: &chrondbc.Spell{ID: 19873}}))
		}
		hit(state, 0)
		for i := 1; i <= 19; i++ {
			if entry == 12435 {
				egg(state, i)
			}
			hit(state, i)
		}
		r := ownergraph.NewRegistry()
		require.NoError(t, p.RegisterOwners(r, graphCompatibility(format, fl), state))
		graph, err := r.Capture(state)
		require.NoError(t, err)
		wire, err := json.Marshal(graph)
		require.NoError(t, err)
		var disk ownergraph.Snapshot
		require.NoError(t, json.Unmarshal(wire, &disk))
		fresh := prepare()
		rr := ownergraph.NewRegistry()
		require.NoError(t, fresh.RegisterOwners(rr, graphCompatibility(format, fl), nil))
		v, err := rr.Restore(disk)
		require.NoError(t, err)
		restored := v.(*encounters.State)
		require.NoError(t, restored.WireGraphRuntime(ctx, logger))
		for _, s := range []*encounters.State{state, restored} {
			if entry == 12435 {
				egg(s, 20)
			}
			for i := 20; i < 45; i++ {
				hit(s, i)
			}
			require.NoError(t, s.Process(&messages.Slain{MessageBase: messages.Base(at.Add(45 * time.Second)), Victim: boss}))
		}
		a, err := state.CurrentInstance.Finalize(ctx)
		require.NoError(t, err)
		b, err := restored.CurrentInstance.Finalize(ctx)
		require.NoError(t, err)
		require.Equal(t, a.RankingRules, b.RankingRules)
		require.Equal(t, a.Rankings, b.Rankings)
		require.Equal(t, rankings.DamageTargets{Mode: rankings.DamageTargetsBossOnly}, b.RankingRules.DamageByEncounter["Firemaw"])
		require.Equal(t, rankings.DamageTargets{Mode: rankings.DamageTargetsEntries, EntryIDs: []uint32{12435}}, b.RankingRules.DamageByEncounter["Razorgore the Untamed"])
		require.Equal(t, rankings.DamageTargets{PhaseKey: "razorgore_p2"}, b.RankingRules.DurationByEncounter["Razorgore the Untamed"])
		require.Len(t, a.Encounters, 1)
		require.Len(t, b.Encounters, 1)
		if entry == 12435 {
			require.Equal(t, a.Encounters[0].Combat.Phases[0].ID, b.Encounters[0].Combat.Phases[0].ID, "checkpoint phase identity remains authoritative")
			require.Len(t, b.Encounters[0].Combat.Phases, 2)
			require.Equal(t, "razorgore_p2", b.Encounters[0].Combat.Phases[1].Key)
			require.EqualValues(t, 20000, b.Encounters[0].Combat.Phases[1].StartOffsetMs)
			require.EqualValues(t, 45000, b.Encounters[0].Combat.Phases[1].EndOffsetMs)
		}
		// Newly observed suffix phases receive fresh IDs in either independent run.
		for i := range a.Encounters[0].Combat.Phases {
			a.Encounters[0].Combat.Phases[i].ID = [16]byte{}
			b.Encounters[0].Combat.Phases[i].ID = [16]byte{}
		}
		require.Equal(t, a.Encounters[0].Combat.Phases, b.Encounters[0].Combat.Phases)
	}
}
