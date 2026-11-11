package unitdb

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/combatlog/parser/types/unitinfo"
	next "github.com/Emyrk/chronicle/combatlog/parsernext/vanilla"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/stategraph"
	"github.com/stretchr/testify/require"
)

type stateFetcher struct{ calls int }

func (f *stateFetcher) Spell(_ context.Context, id chrondbc.SpellID) (*chrondbc.Spell, error) {
	f.calls++
	return &chrondbc.Spell{ID: id}, nil
}

func encodedUnits(t *testing.T, u *Units) []byte {
	t.Helper()
	state, err := u.CaptureState(func(spell *chrondbc.Spell) (string, error) { return fmt.Sprintf("/root/spells/%d", spell.ID), nil })
	require.NoError(t, err)
	encoded, err := state.Encode()
	require.NoError(t, err)
	return encoded
}

func TestStateOperationsContinue(t *testing.T) {
	t.Parallel()
	u := New()
	player, other, pet, summon := guid.GUID(1), guid.GUID(2), guid.GUID(3), guid.GUID(4)
	now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	u.UpdatePlayer(combatant.Combatant{Guid: player, Name: "Old", GearSetups: []combatant.GearItem{{ItemID: 100}}, Talents: &combatant.Talents{Trees: [3][]uint8{{1}}}})
	u.UpdatePlayer(combatant.Combatant{Guid: player, Name: "New"})
	u.Update(unitinfo.Info{Guid: pet, Owner: &player, Buffs: []unitinfo.Buff{{ID: 10}}, Challenges: []string{"challenge"}, Charm: &other})
	u.Update(unitinfo.Info{Guid: summon, Owner: &pet})
	u.InjectAffiliation(pet, AffiliationHostile)
	u.SetPossessed(pet, player, &chrondbc.Spell{ID: 123}, now, time.Second)
	u.SetPossessed(summon, player, &chrondbc.Spell{ID: 123}, now, 0)
	refs := make(map[string]*chrondbc.Spell)
	snapshot, err := u.CaptureState(func(spell *chrondbc.Spell) (string, error) {
		name := fmt.Sprintf("possession-%d", len(refs))
		refs[name] = spell
		return "/root/references/" + name, nil
	})
	require.NoError(t, err)
	graph, payloads, err := next.CaptureSpellReferences(refs)
	require.NoError(t, err)
	fetcher := &stateFetcher{}
	derivation, err := next.NewSpellDerivation(fetcher)
	require.NoError(t, err)
	spells, err := derivation.Restore(t.Context(), graph, payloads)
	require.NoError(t, err)
	require.Equal(t, 1, fetcher.calls)
	encoded, err := snapshot.Encode()
	require.NoError(t, err)
	decoded, err := DecodeState(StateVersion, encoded)
	require.NoError(t, err)
	restored, err := decoded.Restore(func(path string) (*chrondbc.Spell, error) { return spells[stategraph.Path(path)], nil })
	require.NoError(t, err)
	require.Same(t, restored.Possessed[pet].Spell, restored.Possessed[summon].Spell)
	require.Equal(t, pet, restored.directOwners[summon])
	require.Equal(t, player, *restored.Info[summon].Owner)
	require.Equal(t, player, restored.PlayerByName["Old"])
	require.Equal(t, player, restored.PlayerByName["New"])
	require.Equal(t, encodedUnits(t, u), encodedUnits(t, restored))
	for _, target := range []*Units{u, restored} {
		target.UpdateOwner(pet, other)
		require.Equal(t, other, *target.Info[summon].Owner)
		target.UpdatePlayerTransmogs(player, []combatant.Transmog{{Slot: 0, ItemID: 200, TransmogID: 300}})
		target.UpdatePlayerTalents(player, &combatant.Talents{Trees: [3][]uint8{{2}}})
		target.UpdatePlayer(combatant.Combatant{Guid: player, Name: "Newest", GearSetups: []combatant.GearItem{{}}})
		require.NoError(t, target.ProcessMessage(&messages.Combatant{MessageBase: messages.Base(now.Add(time.Second)), Combatant: combatant.Combatant{Guid: other, Name: "Other"}}))
		require.Contains(t, target.Possessed, pet, "expiry is strictly after its timestamp")
		require.NoError(t, target.ProcessMessage(&messages.Combatant{MessageBase: messages.Base(now.Add(time.Second + time.Nanosecond)), Combatant: combatant.Combatant{Guid: other, Name: "Other"}}))
		require.NotContains(t, target.Possessed, pet)
		require.Contains(t, target.Possessed, summon)
		require.Equal(t, AffiliationHostile, target.Classify(pet).Affiliation)
	}
	require.Equal(t, encodedUnits(t, u), encodedUnits(t, restored))
	u.Info[pet].Buffs[0].ID = 777
	u.Info[pet].Challenges[0] = "source changed"
	*u.Info[pet].Charm = 777
	u.Players[player].GearSetups[0].ItemID = 777
	u.Players[player].Talents.Trees[0][0] = 7
	after, err := snapshot.Encode()
	require.NoError(t, err)
	require.Equal(t, encoded, after)
	restored.Info[pet].Buffs[0].ID = 999
	restored.Info[pet].Challenges[0] = "changed"
	*restored.Info[pet].Charm = 999
	restored.Players[player].GearSetups[0].ItemID = 999
	restored.Players[player].Talents.Trees[0][0] = 9
	after, err = decoded.Encode()
	require.NoError(t, err)
	require.Equal(t, encoded, after)
}

func TestStatePreservesMapsWithoutNormalization(t *testing.T) {
	t.Parallel()
	for _, u := range []*Units{{}, New()} {
		snapshot, err := u.CaptureState(nil)
		require.NoError(t, err)
		encoded, err := snapshot.Encode()
		require.NoError(t, err)
		decoded, err := DecodeState(StateVersion, encoded)
		require.NoError(t, err)
		restored, err := decoded.Restore(nil)
		require.NoError(t, err)
		require.Equal(t, u, restored)
	}
	u := New()
	id := guid.GUID(5)
	owner := guid.GUID(9)
	// Partial name-only Info and dangling historical names are existing valid state.
	u.UpdateUnitName(id, "Observed")
	u.PlayerByName["Historical"] = 99
	info := u.Info[id]
	info.Owner = &owner
	u.Info[id] = info
	u.directOwners[id] = 8
	u.Possessed[id] = PossessionState{Controller: 0, StartTime: time.Time{}}
	snapshot, err := u.CaptureState(nil)
	require.NoError(t, err)
	encoded, err := snapshot.Encode()
	require.NoError(t, err)
	decoded, err := DecodeState(StateVersion, encoded)
	require.NoError(t, err)
	restored, err := decoded.Restore(nil)
	require.NoError(t, err)
	require.Equal(t, u, restored)
	restored.PlayerByName["Historical"] = 1
	restored.directOwners[id] = 1
	restored.injectedAffiliations[id] = AffiliationFriendly
	again, err := decoded.Restore(nil)
	require.NoError(t, err)
	require.Equal(t, u, again)
}

func TestStateRejectsCorruptionAndBrokenReferences(t *testing.T) {
	t.Parallel()
	u := New()
	u.UpdatePlayer(combatant.Combatant{Guid: 1, Name: "Player", GearSetups: []combatant.GearItem{{ItemID: 1}}})
	good := encodedUnits(t, u)
	for _, mutate := range []func(map[string]any){
		func(v map[string]any) { delete(v, "direct_owners") },
		func(v map[string]any) { v["unknown"] = true },
		func(v map[string]any) {
			for _, p := range v["players"].(map[string]any) {
				delete(p.(map[string]any), "Name")
			}
		},
		func(v map[string]any) {
			for _, p := range v["players"].(map[string]any) {
				p.(map[string]any)["Name"] = nil
			}
		},
		func(v map[string]any) {
			for _, p := range v["players"].(map[string]any) {
				p.(map[string]any)["GearSetups"].([]any)[0].(map[string]any)["GemEnchantIDs"] = []any{0}
			}
		},
	} {
		var v map[string]any
		require.NoError(t, json.Unmarshal(good, &v))
		mutate(v)
		bad, err := json.Marshal(v)
		require.NoError(t, err)
		_, err = DecodeState(StateVersion, bad)
		require.Error(t, err)
	}
	for _, bad := range [][]byte{[]byte("null"), append(append([]byte{}, good...), []byte(" {}")...), []byte(`{"info":null,"info":null}`),
		bytes.Replace(good, []byte(`"ItemID":1`), []byte(`"ItemID":1,"ItemID":1`), 1),
		bytes.Replace(good, []byte(`"ItemID":1`), []byte(`"itemid":1`), 1)} {
		_, err := DecodeState(StateVersion, bad)
		require.Error(t, err)
	}
	_, err := DecodeState(StateVersion+1, good)
	require.Error(t, err)
	u.SetPossessed(3, 1, &chrondbc.Spell{ID: 123}, time.Time{}, 0)
	_, err = u.CaptureState(nil)
	require.Error(t, err)
	_, err = u.CaptureState(func(*chrondbc.Spell) (string, error) { return "", nil })
	require.Error(t, err)
	_, err = u.CaptureState(func(*chrondbc.Spell) (string, error) { return "", errors.New("capture failed") })
	require.Error(t, err)
	snapshot, err := u.CaptureState(func(*chrondbc.Spell) (string, error) { return "/missing", nil })
	require.NoError(t, err)
	for _, resolver := range []func(string) (*chrondbc.Spell, error){nil, func(string) (*chrondbc.Spell, error) { return nil, nil }, func(string) (*chrondbc.Spell, error) { return nil, errors.New("unknown reference") }} {
		candidate, err := snapshot.Restore(resolver)
		require.Error(t, err)
		require.Nil(t, candidate)
	}
}
