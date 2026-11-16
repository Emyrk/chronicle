package period

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/types/castv2"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
	"github.com/stretchr/testify/require"
)

// Explicit concrete contract for the type-gated routes documented in RETENTION.md.
// This is intentionally not a claim about arbitrary messages in dynamic routes.
func TestConcreteRetentionCodecContract(t *testing.T) {
	t.Parallel()
	at := time.Unix(100, 0).UTC()
	base := messages.Base(at, messages.WithSynthetic())
	base.MarkActivityBump("test", 42)
	base.AddActivity(42, messages.ActivityBump)
	target := guid.GUID(43)
	rank := 2
	spell := chrondbc.UnknownSpell(123)
	cases := []struct {
		name  string
		event messages.Message
	}{
		{"common direct damage", &messages.Damage{MessageBase: base, Amount: 10}},
		{"common aura cc and grace", &messages.Aura{MessageBase: base}},
		{"common slain and linked death", &messages.Slain{MessageBase: base}},
		{"timeout", &messages.Timeout{MessageBase: base}},
		{"explicit boundary", &messages.EncounterBoundary{MessageBase: base}},
		{"logbased enter", &messages.UnitCombatEnter{MessageBase: base}},
		{"logbased evade", &messages.UnitEvade{MessageBase: base}},
		{"totem heal", &messages.Heal{MessageBase: base}},
		{"totem resource", &messages.ResourceChange{MessageBase: base}},
		{"totem dispel", &messages.Dispel{MessageBase: base}},
		{"totem and Razorgore spell go", &messages.SpellGo{MessageBase: base}},
		{"Arugal and Lich King start", &messages.SpellStart{MessageBase: base}},
		{"Mimiron self repair", &messages.LegacyCast{MessageBase: base, Caster: 42, Target: &target, Spell: "Self Repair"}},
		//nolint:staticcheck // Exercise the existing production legacy CC route.
		{"common legacy cc", &messages.Cast{MessageBase: base, CastV2: castv2.CastV2{Caster: types.Unit{Name: "mage", Gid: 42}, Target: &types.Unit{Name: "mob", Gid: 43}, Action: types.CastActionsCasts, Spell: types.Spell{Name: "Polymorph", ID: 118, Rank: &rank}}}},
		{"Object and Core Rager aura cast", &messages.AuraCast{MessageBase: base, Spell: &spell, Caster: 42, Target: &target, Effect: 6, Amplitude: 1000, EffectAuraName: 69, DurationMS: 5000, AuraCapStatus: 3, EffectMiscValue: 7}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			r := ownergraph.NewRegistry()
			require.NoError(t, RegisterGraphOwners(r))
			require.NoError(t, messages.RegisterDamageGraphOwner(r))
			require.NoError(t, ownergraph.Register(r, ownergraph.Codec[chrondbc.Spell]{Type: "test.contract.spell", Version: 1, Init: func() *chrondbc.Spell { return new(chrondbc.Spell) }, Capture: func(s *chrondbc.Spell, _ *ownergraph.Capture) ([]byte, error) { return json.Marshal(s.ID) }, Restore: func(s *chrondbc.Spell, _ uint32, b []byte, _ *ownergraph.Restore) error {
				var id chrondbc.SpellID
				if err := json.Unmarshal(b, &id); err != nil {
					return err
				}
				*s = chrondbc.UnknownSpell(id)
				return nil
			}}))
			// Avoid activity writes to the shared fixture's base map during parallel tests.
			moment := &Moment{Timestamp: tc.event, Reason: tc.name}
			graph, err := r.Capture(moment)
			require.NoError(t, err)
			root, err := r.Restore(graph)
			require.NoError(t, err)
			restored := root.(*Moment)
			require.Equal(t, tc.event, restored.Timestamp)
			require.NotSame(t, tc.event, restored.Timestamp)
			again, err := r.Capture(restored)
			require.NoError(t, err)
			require.Equal(t, graph, again)
		})
	}
	for _, event := range []messages.Message{(*messages.Cast)(nil), (*messages.LegacyCast)(nil), (*messages.AuraCast)(nil)} { //nolint:staticcheck // Explicitly test retained legacy Cast compatibility.
		require.Error(t, supportedMessage(event))
		_, err := CaptureMessage(event, nil, nil)
		require.Error(t, err)
	} //nolint:staticcheck // Typed-nil legacy validation.
}
