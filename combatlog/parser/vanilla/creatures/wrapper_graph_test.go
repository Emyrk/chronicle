package creatures

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/phases"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
	"github.com/stretchr/testify/require"
)

func wrapperGraphRegistry(t *testing.T, flavor database.WoWFlavor) (*ownergraph.Registry, func() *characters.Characters) {
	t.Helper()
	factories := VanillaCharacterFactories(flavor)
	ids := make([]string, len(factories))
	for i := range ids {
		ids[i] = fmt.Sprintf("factory/%d", i)
	}
	recipe := characters.TrustedFactoryRecipe{ID: "test/vanilla/v1", FactoryIDs: ids, Factories: factories}
	idRecipe := identifier.TrustedRecipe{ID: "test/empty/v1", Factory: func() *identifier.Identifier { return identifier.NewIdentifier(nil) }}
	r := ownergraph.NewRegistry()
	require.NoError(t, characters.RegisterGraphOwners(r, characters.GraphOptions{Factories: recipe, Identifier: idRecipe}))
	require.NoError(t, characters.RegisterWrapperGraphOwners(r))
	require.NoError(t, characters.RegisterAdsGraphOwner(r))
	require.NoError(t, RegisterGraphOwners(r))
	require.NoError(t, period.RegisterGraphOwners(r))
	require.NoError(t, messages.RegisterDamageGraphOwner(r))
	require.NoError(t, unitdb.RegisterGraphOwner(r))
	require.NoError(t, identifier.RegisterGraphOwner(r, idRecipe))
	return r, func() *characters.Characters {
		id, e := idRecipe.New()
		require.NoError(t, e)
		c, e := recipe.New(unitdb.New(), id)
		require.NoError(t, e)
		return c
	}
}

func TestWrapperGraphDiskContinuation(t *testing.T) {
	t.Parallel()
	// These entry IDs exercise private owners, common-reference owners, wrappers,
	// pending-death parties and custom periods through production factories.
	for _, entry := range []uint32{4275, 3678, sneedShredder, 11671, 10184, hooktooth, 12098, 11672, 12435, 12422, 11583, 15990, 15928, highPriestThekal, 15727, 12018, diseasedGhoul, 5925, 181102} {
		t.Run(fmt.Sprint(entry), func(t *testing.T) {
			t.Parallel()
			r, newChars := wrapperGraphRegistry(t, nil)
			original := newChars()
			id := guid.GUID(0xF130000000000001 | uint64(entry)<<24)
			if entry == 181102 {
				id = guid.GUID(0xF110000000000001 | uint64(entry)<<24)
			}
			ch, _ := original.Add(id, time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC))
			require.NotEqual(t, "*characters.Common", fmt.Sprintf("%T", ch), "fixture must reach specialized owner")
			t.Logf("entry=%d type=%T", entry, ch)
			if starter, ok := ch.(interface {
				Start(string, messages.Message)
			}); ok {
				starter.Start("prefix", messages.TimedOut(time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)))
			}
			seedWrapperGraphState(ch, messages.TimedOut(time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)))
			snapshot, e := r.Capture(original)
			require.NoError(t, e)
			data, e := json.Marshal(snapshot)
			require.NoError(t, e)
			path := filepath.Join(t.TempDir(), "owners.json")
			require.NoError(t, os.WriteFile(path, data, 0600))
			data, e = os.ReadFile(path)
			require.NoError(t, e)
			var loaded ownergraph.Snapshot
			require.NoError(t, json.Unmarshal(data, &loaded))
			root, e := r.Restore(loaded)
			require.NoError(t, e)
			restored := root.(*characters.Characters)
			require.NoError(t, restored.WireGraphRuntime())
			restoredCharacter, ok := restored.Get(id)
			require.True(t, ok)
			assertWrapperGraphAliases(t, restoredCharacter)
			again, e := r.Capture(restored)
			require.NoError(t, e)
			require.Equal(t, snapshot, again)
			for i, node := range loaded.Graph.Nodes {
				if node.Kind != "value" || !strings.HasPrefix(node.Type, "vanilla.") {
					continue
				}
				for _, metadata := range []string{`{"version":999,"data":{}}`, `{"version":1,"data":{"unexpected":true}}`} {
					bad := loaded
					bad.Graph.Nodes = slices.Clone(loaded.Graph.Nodes)
					bad.Graph.Nodes[i].Metadata = json.RawMessage(metadata)
					_, err := r.Restore(bad)
					require.Error(t, err, "must reject malformed %s", node.Type)
				}
			}
			// Both branches receive the same suffix. No finalization during restore.
			for _, c := range []*characters.Characters{original, restored} {
				_, e = c.Process(messages.TimedOut(time.Date(2026, 1, 1, 0, 1, 0, 0, time.UTC)))
				require.NoError(t, e)
			}
			expected, e := r.Capture(original)
			require.NoError(t, e)
			actual, e := r.Capture(restored)
			require.NoError(t, e)
			require.Equal(t, expected, actual)
		})
	}
}

// Sweep creature and object entries below 200000, including every entry in the
// current shipped Vanilla factory source and trap/totem tables.
// This uses the actual ordered factory chain, not a hand-maintained type list.
func TestWrapperGraphFactoryCoverage(t *testing.T) {
	t.Parallel()
	for _, flavor := range []database.WoWFlavor{nil, {database.FlavorVanillaPlus}, {database.FlavorTurtle}, {database.FlavorOctoWoW}, {database.FlavorNightmareOfUrsol}, {database.FlavorVanilla, database.FlavorTurtle, database.FlavorNightmareOfUrsol}} {
		t.Run(fmt.Sprint(flavor), func(t *testing.T) {
			t.Parallel()
			r, newChars := wrapperGraphRegistry(t, flavor)
			probe := newChars()
			factories := VanillaCharacterFactories(flavor)
			failures := map[string]int{}
			seen := map[string]int{}
			for _, high := range []uint64{0xF130000000000001, 0xF110000000000001} {
				for entry := uint32(0); entry < 200000; entry++ {
					id := guid.GUID(high | uint64(entry)<<24)
					matched := false
					for _, factory := range factories {
						if _, ok := factory(id, probe); ok {
							matched = true
							break
						}
					}
					if !matched {
						continue
					}
					all := newChars()
					ch, _ := all.Add(id, time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC))
					seen[fmt.Sprintf("%T", ch)]++
					if starter, ok := ch.(interface {
						Start(string, messages.Message)
					}); ok {
						starter.Start("prefix", messages.TimedOut(time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)))
					}
					snap, e := r.Capture(all)
					if e == nil {
						var root any
						root, e = r.Restore(snap)
						if e == nil {
							e = root.(*characters.Characters).WireGraphRuntime()
						}
						if e == nil {
							for _, c := range []*characters.Characters{all, root.(*characters.Characters)} {
								_, e = c.Process(messages.TimedOut(time.Date(2026, 1, 1, 0, 2, 0, 0, time.UTC)))
								if e != nil {
									break
								}
							}
						}
						if e == nil {
							expected, err := r.Capture(all)
							require.NoError(t, err)
							actual, err := r.Capture(root)
							require.NoError(t, err)
							require.Equal(t, expected, actual, "entry %d", entry)
						}
					}
					if e != nil {
						failures[e.Error()]++
					}
				}
			}
			t.Logf("factory owners: %v", seen)
			for failure, count := range failures {
				t.Errorf("%d entries: %s", count, failure)
			}
		})
	}
}

// Seed local mutable fields after ordinary factory construction. The same
// pending message is intentionally shared with Base.LastSlain.
func seedWrapperGraphState(ch characters.Character, m messages.Message) {
	switch c := ch.(type) {
	case *characters.AdsGoWithBoss:
		seedWrapperGraphState(c.CharacterBase, m)
	case *characters.PermanentDeath:
		seedWrapperGraphState(c.CharacterBase, m)
	case *characters.StartsNewFight:
		seedWrapperGraphState(c.CharacterBase, m)
	case *nefarian:
		c.p2Emitted = true
	case *razorgore:
		c.eggCount = 3
		c.adsGone = true
	case *HighPriestThekalParty:
		c.pendingDeath = &m
		c.LastSlain = m
	case *CthunParty:
		c.pendingDeath = &m
		c.LastSlain = m
		c.eyeDone = true
	case *ThaddiusParty:
		c.pendingDeath = &m
		c.LastSlain = m
	case *SneedShredder:
		c.pendingDeath = m
		c.LastSlain = m
	}
}

func assertWrapperGraphAliases(t *testing.T, ch characters.Character) {
	t.Helper()
	switch c := ch.(type) {
	case *characters.AdsGoWithBoss:
		assertWrapperGraphAliases(t, c.CharacterBase)
	case *characters.PermanentDeath:
		assertWrapperGraphAliases(t, c.CharacterBase)
	case *characters.StartsNewFight:
		assertWrapperGraphAliases(t, c.CharacterBase)
	case *HighPriestThekalParty:
		require.NotNil(t, c.pendingDeath)
		require.Same(t, c.LastSlain, *c.pendingDeath)
	case *CthunParty:
		require.NotNil(t, c.pendingDeath)
		require.Same(t, c.LastSlain, *c.pendingDeath)
	case *ThaddiusParty:
		require.NotNil(t, c.pendingDeath)
		require.Same(t, c.LastSlain, *c.pendingDeath)
	case *SneedShredder:
		require.Same(t, c.LastSlain, c.pendingDeath)
	}
}

func TestWrapperGraphPhaseProviderCanonicalReference(t *testing.T) {
	t.Parallel()
	r, newChars := wrapperGraphRegistry(t, nil)
	all := newChars()
	ch, _ := all.Add(guid.GUID(0xF130000000000001|uint64(11583)<<24), time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC))
	provider := ch.(*characters.AdsGoWithBoss).CharacterBase.(*nefarian)
	wrapper := characters.WrapPhaseProvider(provider, &characters.PermanentDeath{CharacterBase: provider})
	all.Save("phase-wrapper", wrapper)
	snapshot, e := r.Capture(all)
	require.NoError(t, e)
	count := 0
	for _, n := range snapshot.Graph.Nodes {
		if n.Kind == "value" && n.Type == NefarianStateType {
			count++
		}
	}
	require.Equal(t, 1, count, "phase provider and wrapped owner must share one mutable character")
	root, e := r.Restore(snapshot)
	require.NoError(t, e)
	require.NoError(t, root.(*characters.Characters).WireGraphRuntime())
	restoredWrapper, ok := root.(*characters.Characters).Load("phase-wrapper")
	require.True(t, ok)
	again, e := r.Capture(root)
	require.NoError(t, e)
	require.Equal(t, snapshot, again)
	require.Equal(t, provider.PhaseDefinitions(), restoredWrapper.(interface {
		PhaseDefinitions() *phases.EncounterPhases
	}).PhaseDefinitions())
}
