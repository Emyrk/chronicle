package synthetic

import (
	"context"
	"io"
	"log/slog"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/instances"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/common/registry"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/stretchr/testify/require"
)

type stateDB struct {
	gamedb.GameDB
	calls int
}

func (d *stateDB) Spell(_ context.Context, id chrondbc.SpellID) (*chrondbc.Spell, error) {
	d.calls++
	return &chrondbc.Spell{ID: id}, nil
}
func (d *stateDB) Creature(int32) (*database.WorldCreatureTemplate, bool) {
	d.calls++
	return nil, false
}

type stateNames struct{}

func (stateNames) Get(guid.GUID) (string, bool) { return "test", true }

func TestSyntheticStateRetainsMutableOwners(t *testing.T) {
	t.Parallel()
	for _, format := range []database.LogFormat{database.LogFormat243CcAddon, database.LogFormat335aCcAddon} {
		t.Run(string(format), func(t *testing.T) {
			t.Parallel()
			ctx := parsectx.With(t.Context(), parsectx.Context{Format: format, Flavor: database.WoWFlavor{database.FlavorWrath}})
			logger := slog.New(slog.NewTextHandler(io.Discard, nil))
			db := &stateDB{}
			reg := registry.NewRegistry(logger, nil)
			reg.RegisterEntry(registry.Entry{Name: "test", ZoneNames: []string{"test"}, HostileEntries: map[uint32]instances.Identity{42: {}}})
			original := New(ctx, logger, db, reg, stateNames{})
			at := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
			original.zoneDetector.ProcessMessages([]messages.Message{&messages.Damage{MessageBase: messages.Base(at), Target: guid.GUID(0xF130000000000001 | uint64(42)<<24)}})
			original.unitInfo.lastEmit[1] = at
			original.unitInfo.detectedClass[1] = types.HeroClassesHUNTER
			original.unitInfo.knownCombatants[1] = struct{}{}
			original.petOwnership.emitted[2] = emittedOwner{1, strengthStrong}
			original.petOwnership.knownOwners[petKey{"pet", 4}] = map[guid.GUID]struct{}{1: {}, 5: {}}
			damage := &messages.Damage{MessageBase: messages.Base(at), Target: 1, Amount: 10}
			original.slain.ProcessMessages([]messages.Message{damage})
			spell := &chrondbc.Spell{ID: feignDeathSpellID}
			if original.feignDeath != nil {
				original.feignDeath.lastDamage[1] = damage
				original.feignDeath.spell = spell
			}
			if original.earthShield != nil {
				original.earthShield.owners[2] = earthShieldOwner{1, 974}
			}
			if original.lifebloom != nil {
				original.lifebloom.pendingByTarget[2] = []pendingLifebloom{{1, at}, {3, at.Add(time.Millisecond)}}
			}
			state, e := original.CaptureState(func(d *messages.Damage) (string, error) { require.Same(t, damage, d); return "damage", nil }, func(s *chrondbc.Spell) (string, error) { require.Same(t, spell, s); return "spell", nil })
			require.NoError(t, e)
			encoded, e := state.Encode()
			require.NoError(t, e)
			state, e = DecodeState(StateVersion, encoded)
			require.NoError(t, e)
			freshDamage := *damage
			freshSpell := *spell
			restored, e := state.Restore(func(ref string) (*messages.Damage, error) { require.Equal(t, "damage", ref); return &freshDamage, nil }, func(ref string) (*chrondbc.Spell, error) { require.Equal(t, "spell", ref); return &freshSpell, nil })
			require.NoError(t, e)
			require.Zero(t, db.calls)
			require.Nil(t, restored.unitInfo.creatures)
			require.Nil(t, restored.petOwnership.names)
			if restored.feignDeath != nil {
				require.Nil(t, restored.feignDeath.classForPlayer)
				require.Same(t, &freshDamage, restored.feignDeath.lastDamage[1])
				require.Same(t, &freshSpell, restored.feignDeath.spell)
			}
			require.Error(t, restored.ValidateGraphRuntime(ctx, db, registry.NewRegistry(logger, nil), stateNames{}))
			require.NoError(t, restored.WireGraphRuntime(ctx, logger, db, reg, stateNames{}))
			require.Zero(t, db.calls)
			after, e := restored.CaptureState(func(*messages.Damage) (string, error) { return "damage", nil }, func(*chrondbc.Spell) (string, error) { return "spell", nil })
			require.NoError(t, e)
			afterBytes, e := after.Encode()
			require.NoError(t, e)
			require.Equal(t, encoded, afterBytes)
			// A killerless hunter death consumes the retained damage decision and cached
			// Feign Death spell only in Wrath; TBC retains its distinct attribution owners.
			var expected []messages.Message
			for i, s := range []*Synthetic{original, restored} {
				out, e := s.ProcessMessages([]messages.Message{&messages.Slain{MessageBase: messages.Base(at.Add(time.Second)), Victim: 1}})
				require.NoError(t, e)
				if i == 0 {
					expected = out
				} else {
					require.Equal(t, expected, out)
				}
			}
			for _, bad := range []string{`null`, `{}`, `{"unexpected":true}`, string(encoded) + ` {}`} {
				_, e := DecodeState(StateVersion, []byte(bad))
				require.Error(t, e)
			}
			_, e = DecodeState(StateVersion+1, encoded)
			require.Error(t, e)
			if restored.feignDeath != nil {
				_, e = state.Restore(func(string) (*messages.Damage, error) { return &messages.Damage{Target: 9}, nil }, func(string) (*chrondbc.Spell, error) { return &freshSpell, nil })
				require.Error(t, e)
			}
		})
	}
}

func TestSyntheticStateTrustedOptions(t *testing.T) {
	t.Parallel()
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	for _, format := range []database.LogFormat{database.LogFormatV9Cleu, database.LogFormatV22Cleu, database.LogFormatHermesproxy1142Cc, database.LogFormat243CcAddon, database.LogFormat335aCcAddon} {
		t.Run(string(format), func(t *testing.T) {
			t.Parallel()
			ctx := parsectx.With(t.Context(), parsectx.Context{Format: format})
			db := &stateDB{}
			options := Options{CreditEarthShield: true}
			native := format == database.LogFormat243CcAddon || format == database.LogFormat335aCcAddon
			var original *Synthetic
			if native {
				options = defaultGraphOptions(format)
				original = New(ctx, logger, db, nil, stateNames{})
			} else {
				original = NewWithOptions(ctx, logger, db, nil, stateNames{}, options)
			}
			state, err := original.CaptureState(nil, nil)
			require.NoError(t, err)
			encoded, err := state.Encode()
			require.NoError(t, err)
			state, err = DecodeState(StateVersion, encoded)
			require.NoError(t, err)
			require.Equal(t, options, state.value.Options)
			require.NoError(t, state.ValidateOptions(format, options))
			wrong := options
			wrong.DetectZone = !wrong.DetectZone // nil registry must not erase the configured option.
			require.ErrorContains(t, state.ValidateOptions(format, wrong), "options mismatch")
			restored, err := state.Restore(nil, nil)
			require.NoError(t, err)
			require.ErrorContains(t, restored.WireGraphRuntimeWithOptions(ctx, logger, nil, nil, nil, wrong), "options mismatch")
			require.Zero(t, db.calls)
			require.True(t, restored.graphPending)
			if native {
				require.NoError(t, state.ValidateFormat(format))
				require.NoError(t, restored.WireGraphRuntime(ctx, logger, db, nil, stateNames{}))
			} else {
				require.Error(t, state.ValidateFormat(format))
				require.Error(t, restored.WireGraphRuntime(ctx, logger, db, nil, stateNames{}))
				require.NoError(t, restored.WireGraphRuntimeWithOptions(ctx, logger, db, nil, stateNames{}, options))
			}
			require.Equal(t, options.GenerateAbsorbs, restored.absorption != nil)
			require.Equal(t, options.CreditEarthShield, restored.earthShield != nil)
			require.Equal(t, options.CreditLifebloom, restored.lifebloom != nil)
			require.Equal(t, format == database.LogFormat335aCcAddon, restored.feignDeath != nil)
			require.Zero(t, db.calls)
		})
	}
}
