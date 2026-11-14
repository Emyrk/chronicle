package registry

import (
	"encoding/json"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/encounter"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/instancehook"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	wotlkinstances "github.com/Emyrk/chronicle/combatlog/parser/wotlk/instances"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
	"github.com/stretchr/testify/require"
)

// The accepted semantics are main's exact policies: hard/normal successful kills,
// incomplete XT evidence stays unclassified, and wipes never inherit a variant.
func TestPreparedUlduarVariantFinalizationDiskParity(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		name     string
		entry    uint32
		duration int
		hard     bool
		phases   int
		kill     bool
		want     string
	}{
		{"hodir hard", 32845, 179, false, 0, true, "hard"}, {"hodir normal", 32845, 180, false, 0, true, "normal"},
		{"hodir wipe", 32845, 180, false, 0, false, ""},
		{"xt hard", 33293, 100, true, 1, true, "hard"}, {"xt normal", 33293, 100, false, 3, true, "normal"},
		{"xt ambiguous", 33293, 100, false, 2, true, ""}, {"xt wipe", 33293, 100, true, 1, false, ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			fl := database.WoWFlavor{database.FlavorWrath}
			format := database.LogFormat335aCcAddon
			ctx := parsectx.With(t.Context(), parsectx.Context{Format: format, Flavor: fl})
			logger := slog.New(slog.NewTextHandler(io.Discard, nil))
			prepare := func() *PreparedGraph {
				p, e := RegistryForFlavor(logger, fl).PrepareGraph(format, &chrondbc.DurationModifierSet{}, &chrondbc.ConsumableCatalog{}, nil)
				require.NoError(t, e)
				return p
			}
			p := prepare()
			state, e := p.NewEncounterState(ctx, logger)
			require.NoError(t, e)
			start := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
			require.NoError(t, state.Zone(messages.Zone{MessageBase: messages.Base(start), Zone: zone.Zone{Name: "Ulduar", MapID: 603, IsInstance: true, Seen: start}}))
			player := guid.GUID(1)
			boss := guid.GUID(0xF130000000000001 | uint64(tc.entry)<<24)
			heart := guid.GUID(0xF130000000000001 | uint64(33329)<<24)
			process := func(s *encounters.State, from, to int) {
				aura := func(at int, unit guid.GUID, spell chrondbc.SpellID, tr messages.AuraTransition) {
					require.NoError(t, s.Process(&messages.Aura{MessageBase: messages.Base(start.Add(time.Duration(at) * time.Second)), Source: &unit, Target: unit, SpellID: spell, Transition: tr, IsBuff: true}))
				}
				for at := from; at <= to; at += 5 {
					require.NoError(t, s.Process(&messages.Damage{MessageBase: messages.Base(start.Add(time.Duration(at) * time.Second)), Caster: &player, Target: boss, Amount: 1, HitType: types.HitTypeHit}))
					if tc.entry == 33293 && at >= 20 && at < 20+tc.phases*20 {
						if at%20 == 0 {
							aura(at, heart, 63849, messages.AuraTransitionApplied)
						}
						require.NoError(t, s.Process(&messages.Damage{MessageBase: messages.Base(start.Add(time.Duration(at) * time.Second)), Caster: &player, Target: heart, Amount: 1, HitType: types.HitTypeHit}))
						if at%20 == 10 {
							aura(at, heart, 63849, messages.AuraTransitionRemoved)
						}
					}
					if tc.hard && at == 35 {
						require.NoError(t, s.Process(&messages.Slain{MessageBase: messages.Base(start.Add(35 * time.Second)), Victim: heart}))
						aura(at, boss, 64193, messages.AuraTransitionApplied)
					}
				}
			}
			process(state, 0, 45)
			r := ownergraph.NewRegistry()
			require.NoError(t, p.RegisterOwners(r, graphCompatibility(format, fl), state))
			graph, e := r.Capture(state)
			require.NoError(t, e)
			b, e := json.Marshal(graph)
			require.NoError(t, e)
			path := filepath.Join(t.TempDir(), "variant.json")
			require.NoError(t, os.WriteFile(path, b, 0600))
			b, e = os.ReadFile(path)
			require.NoError(t, e)
			var disk ownergraph.Snapshot
			require.NoError(t, json.Unmarshal(b, &disk))
			fresh := prepare()
			rr := ownergraph.NewRegistry()
			require.NoError(t, fresh.RegisterOwners(rr, graphCompatibility(format, fl), nil))
			for _, h := range fresh.hooks {
				if h.EncounterVariant != nil {
					original := h.EncounterVariant.Classify
					h.EncounterVariant.Classify = func(_enc encounter.Encounter, _fl database.WoWFlavor, _p []instancehook.Preprocessor) string {
						panic("classification replay")
					}
					defer func() { h.EncounterVariant.Classify = original }()
				}
			}
			// Callback guard is replaced below before suffix finalization; no callback on load.
			root, e := rr.Restore(disk)
			require.NoError(t, e)
			restored := root.(*encounters.State)
			require.NoError(t, restored.WireGraphRuntime(ctx, logger))
			for _, h := range fresh.hooks {
				if h.EncounterVariant != nil {
					h.EncounterVariant.Classify = wotlkinstances.UlduarEncounterVariantGraphRecipe().Classify
				}
			}
			bad := strings.ReplaceAll(string(b), "wotlk/ulduar-variant/v1", "untrusted/variant")
			require.NotEqual(t, string(b), bad)
			var invalid ownergraph.Snapshot
			require.NoError(t, json.Unmarshal([]byte(bad), &invalid))
			_, e = rr.Restore(invalid)
			require.Error(t, e)
			for _, s := range []*encounters.State{state, restored} {
				process(s, 50, tc.duration-1)
				if tc.kill {
					require.NoError(t, s.Process(&messages.Slain{MessageBase: messages.Base(start.Add(time.Duration(tc.duration) * time.Second)), Victim: boss}))
				}
			}
			a, e := state.CurrentInstance.Finalize(ctx)
			require.NoError(t, e)
			c, e := restored.CurrentInstance.Finalize(ctx)
			require.NoError(t, e)
			require.Len(t, a.Encounters, 1)
			require.Len(t, c.Encounters, 1)
			require.Equal(t, tc.want, a.Encounters[0].Variant)
			require.Equal(t, tc.want, c.Encounters[0].Variant)
			require.Equal(t, a.Encounters[0].Combat.Start, c.Encounters[0].Combat.Start)
			require.Equal(t, a.Encounters[0].Combat.End, c.Encounters[0].Combat.End)
			require.Equal(t, a.Encounters[0].KillType, c.Encounters[0].KillType)
			require.Equal(t, a.RankingRules, c.RankingRules)
		})
	}
}
