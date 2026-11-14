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

	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	vanilla "github.com/Emyrk/chronicle/combatlog/parser/vanilla/creatures"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
	"github.com/stretchr/testify/require"
)

func expansionGraphRegistry(t *testing.T, flavor database.WoWFlavor, override ...[]characters.CharacterFactory) (*ownergraph.Registry, func() *characters.Characters) {
	t.Helper()
	factories := NewCharacterFactories(flavor)
	if len(override) > 0 {
		factories = override[0]
	}
	ids := make([]string, len(factories))
	for i := range ids {
		ids[i] = fmt.Sprintf("factory/%d", i)
	}
	recipe := characters.TrustedFactoryRecipe{ID: "test/expansion/v1", FactoryIDs: ids, Factories: factories}
	idRecipe := identifier.TrustedRecipe{ID: "test/empty/v1", Factory: func() *identifier.Identifier { return identifier.NewIdentifier(nil) }}
	r := ownergraph.NewRegistry()
	require.NoError(t, characters.RegisterGraphOwners(r, characters.GraphOptions{Factories: recipe, Identifier: idRecipe}))
	require.NoError(t, characters.RegisterWrapperGraphOwners(r))
	require.NoError(t, characters.RegisterAdsGraphOwner(r))
	require.NoError(t, vanilla.RegisterGraphOwners(r))
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

func TestExpansionGraphFactoryCoverage(t *testing.T) {
	t.Parallel()
	for _, flavor := range []database.WoWFlavor{{database.FlavorTBC}, {database.FlavorWrath}, {database.FlavorTBC, database.FlavorWrath}} {
		t.Run(fmt.Sprint(flavor), func(t *testing.T) {
			t.Parallel()
			r, newChars := expansionGraphRegistry(t, flavor)
			probe := newChars()
			factories := NewCharacterFactories(flavor)
			failures := map[string]int{}
			seen := map[string]int{}
			for _, high := range []uint64{0xF130000000000001, 0xF110000000000001, 0xF150000000000001} {
				for entry := uint32(0); entry < 300000; entry++ {
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

func TestExpansionGraphStatefulDiskContinuation(t *testing.T) {
	t.Parallel()
	families := map[string][]uint32{
		"mimiron":   {33432, 34106, 33651, 33670},
		"thorim":    {thorimEntry, 32873, 32872},
		"kael":      {kaelThasEntry, capernianEntry, telonicusEntry, netherstrandLongbowEntry},
		"reliquary": {reliquaryOfSoulsEntry, essenceOfSufferingEntry, essenceOfDesireEntry, essenceOfAngerEntry},
		"yogg":      {yoggSaronSaraEntry, yoggSaronSaraAltEntry, yoggSaronEntry, yoggSaronBrainEntry, yoggSaronGuardianEntry, yoggSaronCrusherEntry},
		"keepers":   {algalonEntry, freyaEntry, hodirEntry, hodirAlternateEntry, 32930, 33909},
		"icc":       {ladyDeathwhisperEntry, professorPutricideEntry, sindragosaEntry, theLichKingEntry, orgrimsHammerEntry, theSkybreakerEntry, valithriaDreamwalkerEntry},
	}
	for name, entries := range families {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			r, newChars := expansionGraphRegistry(t, database.WoWFlavor{database.FlavorWrath})
			all := newChars()
			at := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
			for _, entry := range entries {
				id := guid.GUID(0xF130000000000001 | uint64(entry)<<24)
				ch, _ := all.Add(id, at)
				if starter, ok := ch.(interface {
					Start(string, messages.Message)
				}); ok {
					starter.Start("prefix", messages.TimedOut(at))
				}
				seedExpansionCharacter(ch)
			}
			seedExpansionParties(t, all)
			restored := expansionDiskRestore(t, r, all)
			assertExpansionPartyAliases(t, restored)
			// Compare after each continuation boundary, before final timeout can reset state.
			source := guid.GUID(1)
			for _, entry := range entries {
				target := guid.GUID(0xF130000000000001 | uint64(entry)<<24)
				suffix := &messages.Damage{MessageBase: messages.Base(at.Add(time.Second)), Caster: &source, Target: target, Amount: 5}
				for _, c := range []*characters.Characters{all, restored} {
					_, e := c.Process(suffix)
					require.NoError(t, e)
				}
				assertExpansionGraphEqual(t, r, all, restored)
			}
			for _, c := range []*characters.Characters{all, restored} {
				_, e := c.Process(messages.TimedOut(at.Add(time.Minute * 3)))
				require.NoError(t, e)
			}
			assertExpansionGraphEqual(t, r, all, restored)
		})
	}
}

func expansionDiskRestore(t *testing.T, r *ownergraph.Registry, all *characters.Characters) *characters.Characters {
	t.Helper()
	snapshot, e := r.Capture(all)
	require.NoError(t, e)
	b, e := json.Marshal(snapshot)
	require.NoError(t, e)
	path := filepath.Join(t.TempDir(), "owners.json")
	require.NoError(t, os.WriteFile(path, b, 0600))
	b, e = os.ReadFile(path)
	require.NoError(t, e)
	var disk ownergraph.Snapshot
	require.NoError(t, json.Unmarshal(b, &disk))
	for i, node := range disk.Graph.Nodes {
		if node.Kind != "value" || !strings.HasPrefix(node.Type, "wotlk.") {
			continue
		}
		for _, payload := range []string{`{"version":99,"data":{}}`, `{"version":1,"data":{"unexpected":true}}`} {
			bad := disk
			bad.Graph.Nodes = slices.Clone(disk.Graph.Nodes)
			bad.Graph.Nodes[i].Metadata = json.RawMessage(payload)
			_, e := r.Restore(bad)
			require.Error(t, e, node.Type)
		}
	}
	root, e := r.Restore(disk)
	require.NoError(t, e)
	restored := root.(*characters.Characters)
	require.NoError(t, restored.WireGraphRuntime())
	again, e := r.Capture(restored)
	require.NoError(t, e)
	require.Equal(t, snapshot, again)
	return restored
}
func assertExpansionGraphEqual(t *testing.T, r *ownergraph.Registry, a, b *characters.Characters) {
	t.Helper()
	expected, e := r.Capture(a)
	require.NoError(t, e)
	actual, e := r.Capture(b)
	require.NoError(t, e)
	require.Equal(t, expected, actual)
}
func seedExpansionDetector(d *characters.ScriptedDefeatDetector, id guid.GUID) {
	source := guid.GUID(1)
	d.Observe(&messages.Damage{MessageBase: messages.Base(time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)), Caster: &source, Target: id, HitType: types.HitTypeEvade}, true)
}
func seedExpansionCharacter(ch characters.Character) {
	switch c := ch.(type) {
	case *characters.AdsGoWithBoss:
		seedExpansionCharacter(c.CharacterBase)
	case *freyaCharacter:
		seedExpansionDetector(c.defeat, c.ID())
	case *hodirCharacter:
		seedExpansionDetector(c.defeat, c.ID())
	case *kologarnCharacter:
		seedExpansionDetector(c.defeat, c.ID())
	case *thorimCharacter:
		if c.defeat != nil {
			seedExpansionDetector(c.defeat, c.ID())
		}
	case *ladyDeathwhisperCharacter:
		c.phaseTwo = true
	case *professorPutricideCharacter:
		c.phase = 2
	case *sindragosaCharacter:
		c.finalPhase = true
	case *lichKingCharacter:
		c.phase = 4
	case *algalonCharacter:
		seedExpansionDetector(c.defeat, c.ID())
		c.incomingDamage = 12345
		c.seenPlayers[1] = struct{}{}
		c.seenPlayers[2] = struct{}{}
		c.deadPlayers[2] = struct{}{}
	}
}
func seedExpansionParties(t *testing.T, all *characters.Characters) {
	t.Helper()
	if shared, ok := all.Load(mimironStateKey); ok {
		s := shared.(*mimironState)
		s.phase = 4
		s.phaseFourDamaged = map[mimironRole]bool{mimironRoleLeviathan: true, mimironRoleVX001: true}
		s.phaseFourDefeated = map[mimironRole]bool{mimironRoleLeviathan: true}
		s.phaseSource = guid.GUID(0xF130000000000001 | uint64(mimironLeviathanMkIIEntry)<<24)
	}
	if shared, ok := all.Load(thorimStateKey); ok {
		s := shared.(*thorimState)
		s.phase = 2
		s.phaseSource = guid.GUID(0xF130000000000001 | uint64(thorimEntry)<<24)
	}
	if shared, ok := all.Load(kaelThasStateKey); ok {
		s := shared.(*kaelThasState)
		s.phase = 2
		s.weaponDeathObserved = true
		s.phaseSource = guid.GUID(0xF130000000000001 | uint64(kaelThasEntry)<<24)
	}
	if shared, ok := all.Load(reliquaryStateKey); ok {
		s := shared.(*reliquaryState)
		s.phase = 2
		s.phaseSource = guid.GUID(0xF130000000000001 | uint64(essenceOfSufferingEntry)<<24)
	}
	if shared, ok := all.Load(yoggSaronStateKey); ok {
		s := shared.(*yoggSaronState)
		s.phase = 2
		require.NotNil(t, s.currentSara)
		s.phaseSource = s.currentSara.ID()
	}
}
func assertExpansionPartyAliases(t *testing.T, all *characters.Characters) {
	t.Helper()
	if shared, ok := all.Load(mimironStateKey); ok {
		s := shared.(*mimironState)
		require.Greater(t, len(s.characters), 1)
		for _, c := range s.characters {
			require.Same(t, s, c.state)
			require.Same(t, all, c.all)
		}
	}
	if shared, ok := all.Load(thorimStateKey); ok {
		s := shared.(*thorimState)
		require.Greater(t, len(s.characters), 1)
		for _, c := range s.characters {
			require.Same(t, s, c.state)
			require.Same(t, all, c.all)
		}
	}
	if shared, ok := all.Load(kaelThasStateKey); ok {
		s := shared.(*kaelThasState)
		require.Greater(t, len(s.characters), 1)
		for _, c := range s.characters {
			require.Same(t, s, c.state)
			require.Same(t, all, c.all)
		}
	}
	if shared, ok := all.Load(reliquaryStateKey); ok {
		s := shared.(*reliquaryState)
		require.Greater(t, len(s.characters), 1)
		for _, c := range s.characters {
			require.Same(t, s, c.state)
			require.Same(t, all, c.all)
		}
	}
	if shared, ok := all.Load(yoggSaronStateKey); ok {
		s := shared.(*yoggSaronState)
		require.Same(t, s.characters[s.currentSara.ID()], s.currentSara)
		for _, c := range s.characters {
			require.Same(t, s, c.state)
			require.Same(t, all, c.all)
		}
	}
}

func TestExpansionGraphServerSideLogBased(t *testing.T) {
	t.Parallel()
	r, newChars := expansionGraphRegistry(t, nil, AzerothServersideCoreCharacterFactories())
	all := newChars()
	at := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	for _, id := range []guid.GUID{1, 0xF130000001000001, 0xF150000001000001, 0xF140000001000001} {
		ch, _ := all.Add(id, at)
		owner := ch.(*LogBased)
		require.Same(t, owner, owner.CharacterBase)
		owner.Start("server enter", messages.TimedOut(at))
	}
	restored := expansionDiskRestore(t, r, all)
	require.NoError(t, restored.All.ForEach(func(ch characters.Character) error {
		owner := ch.(*LogBased)
		require.Same(t, owner, owner.CharacterBase)
		return nil
	}))
	for _, c := range []*characters.Characters{all, restored} {
		_, e := c.Process(messages.TimedOut(at.Add(time.Minute * 2)))
		require.NoError(t, e)
	}
	assertExpansionGraphEqual(t, r, all, restored)
}

func TestExpansionGraphRejectsKeeperBindingMismatch(t *testing.T) {
	t.Parallel()
	for _, entry := range []uint32{algalonEntry, freyaEntry, hodirEntry, 32930, thorimEntry} {
		t.Run(fmt.Sprint(entry), func(t *testing.T) {
			t.Parallel()
			r, newChars := expansionGraphRegistry(t, database.WoWFlavor{database.FlavorWrath})
			all := newChars()
			id := guid.GUID(0xF130000000000001 | uint64(entry)<<24)
			ch, _ := all.Add(id, time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC))
			var get func() *characters.ScriptedDefeatDetector
			var set func(*characters.ScriptedDefeatDetector)
			switch c := ch.(type) {
			case *algalonCharacter:
				get = func() *characters.ScriptedDefeatDetector { return c.defeat }
				set = func(d *characters.ScriptedDefeatDetector) { c.defeat = d }
			case *freyaCharacter:
				get = func() *characters.ScriptedDefeatDetector { return c.defeat }
				set = func(d *characters.ScriptedDefeatDetector) { c.defeat = d }
			case *hodirCharacter:
				get = func() *characters.ScriptedDefeatDetector { return c.defeat }
				set = func(d *characters.ScriptedDefeatDetector) { c.defeat = d }
			case *kologarnCharacter:
				get = func() *characters.ScriptedDefeatDetector { return c.defeat }
				set = func(d *characters.ScriptedDefeatDetector) { c.defeat = d }
			case *thorimCharacter:
				get = func() *characters.ScriptedDefeatDetector { return c.defeat }
				set = func(d *characters.ScriptedDefeatDetector) { c.defeat = d }
			default:
				t.Fatalf("unexpected keeper %T", ch)
			}
			original := get()
			set(characters.NewScriptedDefeatDetector(id+1, characters.ScriptedDefeatConfig{}))
			_, e := r.Capture(all)
			require.Error(t, e)
			set(original)
			original.WithParticipantOwner(newChars())
			_, e = r.Capture(all)
			require.Error(t, e)
			original.WithParticipantOwner(all)
			_, e = r.Capture(all)
			require.NoError(t, e)
		})
	}
}

func TestExpansionGraphServerSideGlobalBranches(t *testing.T) {
	t.Parallel()
	r, newChars := expansionGraphRegistry(t, nil, AzerothServersideCoreCharacterFactories())
	all := newChars()
	at := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	for _, fixture := range []struct {
		id   guid.GUID
		want any
	}{
		{guid.GUID(0xF130000000000001 | uint64(5925)<<24), &vanilla.Totem{}},
		{guid.GUID(0xF130000000000001 | uint64(4075)<<24), &vanilla.Critter{}},
		{guid.GUID(0xF110000000000001 | uint64(181102)<<24), &vanilla.Object{}},
		{guid.GUID(0xF110000001000001), &LogBased{}},
	} {
		ch, _ := all.Add(fixture.id, at)
		require.IsType(t, fixture.want, ch)
		if starter, ok := ch.(interface {
			Start(string, messages.Message)
		}); ok {
			starter.Start("prefix", messages.TimedOut(at))
		}
	}
	restored := expansionDiskRestore(t, r, all)
	for _, c := range []*characters.Characters{all, restored} {
		_, e := c.Process(messages.TimedOut(at.Add(time.Minute * 2)))
		require.NoError(t, e)
	}
	assertExpansionGraphEqual(t, r, all, restored)
}
