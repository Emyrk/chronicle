package instances

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	common "github.com/Emyrk/chronicle/combatlog/parser/common/instances"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/instancehook"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
	"github.com/stretchr/testify/require"
)

func diskPreprocessor(t *testing.T, owner instancehook.Preprocessor, register func(*ownergraph.Registry) error) instancehook.Preprocessor {
	t.Helper()
	r := ownergraph.NewRegistry()
	require.NoError(t, register(r))
	snap, err := r.Capture(owner)
	require.NoError(t, err)
	data, err := json.Marshal(snap)
	require.NoError(t, err)
	path := filepath.Join(t.TempDir(), "preprocessor.json")
	require.NoError(t, os.WriteFile(path, data, 0600))
	data, err = os.ReadFile(path)
	require.NoError(t, err)
	var saved ownergraph.Snapshot
	require.NoError(t, json.Unmarshal(data, &saved))
	fresh := ownergraph.NewRegistry()
	require.NoError(t, register(fresh))
	restored, err := fresh.Restore(saved)
	require.NoError(t, err)
	again, err := fresh.Capture(restored)
	require.NoError(t, err)
	encoded, err := json.Marshal(again)
	require.NoError(t, err)
	require.JSONEq(t, string(data), string(encoded))
	return restored.(instancehook.Preprocessor)
}

func TestPreprocessorGraphMalygosGrace(t *testing.T) {
	t.Parallel()
	at := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	boss := creatureGUID(malygosEntry)
	original := new(malygosDamageCredit)
	observed := damageEvent(boss, 1, 1)
	observed.MessageBase = messages.Base(at.Add(-time.Second))
	require.NoError(t, original.ProcessMessage(observed))
	require.NoError(t, original.ProcessMessage(&messages.Slain{MessageBase: messages.Base(at), Victim: boss}))
	restored := diskPreprocessor(t, original, RegisterMalygosPreprocessorGraphOwner).(*malygosDamageCredit)
	require.NotSame(t, original, restored)
	require.Equal(t, original.CaptureState(), restored.CaptureState())
	for _, offset := range []time.Duration{10*time.Second - time.Nanosecond, 10 * time.Second, 11 * time.Second} {
		a, b := damageEvent(0, 1, 57429), damageEvent(0, 1, 57429)
		a.MessageBase = messages.Base(at.Add(offset))
		b.MessageBase = messages.Base(at.Add(offset))
		retained := b
		spell := b.SpellData
		require.NoError(t, original.ProcessMessage(a))
		require.NoError(t, restored.ProcessMessage(b))
		require.Same(t, retained, b)
		require.Same(t, spell, b.SpellData)
		require.Equal(t, a, b)
		if offset < 10*time.Second {
			require.Equal(t, boss, *b.Caster)
		} else {
			require.True(t, b.Caster.IsZero())
		}
	}
}

func TestPreprocessorGraphIcecrownWindow(t *testing.T) {
	t.Parallel()
	at := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	ship, crew := creatureGUID(orgrimsHammerEntry), creatureGUID(37148)
	original := new(icecrownScriptedActivity)
	require.NoError(t, original.ProcessMessage(&messages.Damage{MessageBase: messages.Base(at), Target: ship, Overkill: 1}))
	restored := diskPreprocessor(t, original, RegisterIcecrownPreprocessorGraphOwner).(*icecrownScriptedActivity)
	require.Equal(t, original.CaptureState(), restored.CaptureState())
	for _, offset := range []time.Duration{-time.Second, 3*time.Minute - time.Nanosecond, 3 * time.Minute} {
		a := &messages.Damage{MessageBase: messages.Base(at.Add(offset)), Caster: &crew, Target: 1}
		b := &messages.Damage{MessageBase: messages.Base(at.Add(offset)), Caster: &crew, Target: 1}
		require.NoError(t, original.ProcessMessage(a))
		require.NoError(t, restored.ProcessMessage(b))
		require.Equal(t, a, b)
		_, ignored := b.MarkHas(messages.MarkTypeIgnoreActivity, crew)
		require.Equal(t, offset >= 0 && offset < 3*time.Minute, ignored)
	}
}

func TestPreprocessorGraphStatelessBehavior(t *testing.T) {
	t.Parallel()
	drake := creatureGUID(30452)
	aura := &messages.Aura{MessageBase: messages.Base(time.Time{}), Source: &drake, Amount: 1, SpellData: &chrondbc.Spell{ID: powerOfTenebron}}
	p := diskPreprocessor(t, new(sartharionDrakePowerActivity), RegisterSartharionPreprocessorGraphOwner)
	require.NoError(t, p.ProcessMessage(aura))
	_, started := aura.MarkHas(messages.MarkTypeStart, drake)
	require.True(t, started)
	source, target := creatureGUID(32882), creatureGUID(32883)
	damage := damageEvent(source, target, 1)
	p = diskPreprocessor(t, new(thorimArenaStarterCombat), RegisterThorimPreprocessorGraphOwner)
	require.NoError(t, p.ProcessMessage(damage))
	for _, id := range []guid.GUID{source, target} {
		_, ignored := damage.MarkHas(messages.MarkTypeIgnoreActivity, id)
		require.True(t, ignored)
	}
}

func TestPreprocessorGraphExplicitRegistrationAndMalformedState(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		recipe   common.PreprocessorGraphRecipe
		register func(*ownergraph.Registry) error
	}{
		{SartharionPreprocessorGraphRecipe(), RegisterSartharionPreprocessorGraphOwner},
		{ThorimPreprocessorGraphRecipe(), RegisterThorimPreprocessorGraphOwner},
		{MalygosPreprocessorGraphRecipe(), RegisterMalygosPreprocessorGraphOwner},
		{IcecrownPreprocessorGraphRecipe(), RegisterIcecrownPreprocessorGraphOwner},
	} {
		t.Run(tc.recipe.ID, func(t *testing.T) {
			t.Parallel()
			r := ownergraph.NewRegistry()
			owner := tc.recipe.New()
			_, err := r.Capture(owner)
			require.Error(t, err)
			require.True(t, tc.recipe.Validate(owner))
			require.False(t, tc.recipe.Validate(nil))
			require.NoError(t, tc.register(r))
			snap, err := r.Capture(owner)
			require.NoError(t, err)
			original, err := json.Marshal(snap)
			require.NoError(t, err)
			for _, bad := range []string{`null`, `{"unexpected":1}`, `{"caster":0}`, `{"caster":0,"caster":0,"caster_expires_at":"0001-01-01T00:00:00Z"}`, `{"gunship_victory_at":null}`} {
				var damaged ownergraph.Snapshot
				require.NoError(t, json.Unmarshal(original, &damaged))
				for i := range damaged.Graph.Nodes {
					n := &damaged.Graph.Nodes[i]
					if string(n.Path) != damaged.Root {
						continue
					}
					n.Metadata = json.RawMessage(`{"version":1,"data":` + bad + `}`)
				}
				_, err := r.Restore(damaged)
				require.Error(t, err)
			}
			for i := range snap.Graph.Nodes {
				n := &snap.Graph.Nodes[i]
				if string(n.Path) != snap.Root {
					continue
				}
				var env map[string]json.RawMessage
				require.NoError(t, json.Unmarshal(n.Metadata, &env))
				env["version"] = json.RawMessage(`999`)
				n.Metadata, err = json.Marshal(env)
				require.NoError(t, err)
			}
			_, err = r.Restore(snap)
			require.Error(t, err)
		})
	}
}

func TestMalygosStateRejectsForeignCasterWithoutMutation(t *testing.T) {
	t.Parallel()
	p := &malygosDamageCredit{caster: creatureGUID(malygosEntry)}
	before := p.CaptureState()
	require.Error(t, p.RestoreState(MalygosDamageCreditState{Caster: 1}))
	require.Equal(t, before, p.CaptureState())
}
