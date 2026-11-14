package vanilla

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parsernext/snapshot"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
	"github.com/Gophercraft/core/i18n"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func preparedSpellIdentity() snapshot.Compatibility {
	return snapshot.Compatibility{DatasetID: "11111111-1111-1111-1111-111111111111", DatasetRevision: 3, BuildIdentity: "sha256:" + strings.Repeat("a", 64), Format: "vanilla", Flavor: "turtle"}
}
func preparedSpellFixture() *chrondbc.Spell {
	points := float32(17.5)
	return &chrondbc.Spell{
		ID: 123, Name_lang: i18n.Text{i18n.English: "spell"}, NameSubtext_lang: i18n.Text{i18n.English: "rank"}, Description_lang: i18n.Text{i18n.English: "description"}, AuraDescription_lang: i18n.Text{i18n.English: "aura"},
		SpellIconID_: 11, ActiveIconID_: 12, CastingTimeIndex_: 13, RangeIndex_: 14, DurationIndex_: 15, CategoryID_: 16, SpellFocusID_: 17,
		Effects: []chrondbc.SpellEffect{{DatasetID: uuid.MustParse(preparedSpellIdentity().DatasetID), SpellID: 123, DifficultyID: 4, EffectIndex: 9, EffectBasePointsF: &points, EffectRadiusIndex: []int32{2, 3}, EffectMiscValue: []int32{4, 5}, ImplicitTarget: []int32{6, 7}, EffectSpellClassMask: []int32{8, 9}}},
		Powers:  []chrondbc.SpellPower{{SpellID: 123, OrderIndex: 5, SourceID: 99, ManaCost: 71}},
		Variants: []chrondbc.SpellVariant{{SpellID: 123, DifficultyID: 4,
			Misc:               &chrondbc.ModernSpellMisc{Attributes: []int32{1, 2}},
			AuraOptions:        &chrondbc.ModernSpellAuraOptions{ProcTypeMask: []int32{3, 4}},
			AuraRestrictions:   &chrondbc.ModernSpellAuraRestrictions{CasterAuraSpell: 51},
			ClassOptions:       &chrondbc.ModernSpellClassOptions{SpellClassMask: []int32{5, 6}},
			Interrupts:         &chrondbc.ModernSpellInterrupts{AuraInterruptFlags: []int32{7, 8}, ChannelInterruptFlags: []int32{9, 10}},
			Categories:         &chrondbc.ModernSpellCategories{Category: 52},
			Cooldowns:          &chrondbc.ModernSpellCooldowns{RecoveryTime: 53},
			Levels:             &chrondbc.ModernSpellLevels{SpellLevel: 54},
			TargetRestrictions: &chrondbc.ModernSpellTargetRestrictions{MaxTargets: 55},
		}},
	}
}

func TestPreparedSpellGraphPreservesAndIsolates(t *testing.T) {
	t.Parallel()
	spell := preparedSpellFixture()
	original := preparedSpellFixture()
	r := ownergraph.NewRegistry()
	prepared := map[chrondbc.SpellID]*chrondbc.Spell{spell.ID: spell}
	require.NoError(t, RegisterPreparedSpellGraphOwner(r, preparedSpellIdentity(), prepared))
	snap, err := r.Capture(spell)
	require.NoError(t, err)
	bytes, err := json.Marshal(snap)
	require.NoError(t, err)
	require.NoError(t, json.Unmarshal(bytes, &snap))
	// Mutating the caller's map or nested input after registration cannot alter the frozen baseline.
	spell.Name_lang[i18n.English] = "changed"
	*spell.Effects[0].EffectBasePointsF = 999
	spell.Variants[0].Misc.Attributes[0] = 999
	delete(prepared, spell.ID)
	_, err = r.Capture(spell)
	require.Error(t, err)
	first, err := r.Restore(snap)
	require.NoError(t, err)
	a := first.(*chrondbc.Spell)
	second, err := r.Restore(snap)
	require.NoError(t, err)
	b := second.(*chrondbc.Spell)
	require.Equal(t, original, a)
	require.Equal(t, original, b)
	require.NotSame(t, a, b)
	require.NoError(t, func() error { _, err := r.Capture(a); return err }())
	for _, mutate := range preparedSpellMutations() {
		mutate(a)
	}
	require.Equal(t, original, b)
	third, err := r.Restore(snap)
	require.NoError(t, err)
	require.Equal(t, original, third)
}

func preparedSpellMutations() []func(*chrondbc.Spell) {
	return []func(*chrondbc.Spell){
		func(s *chrondbc.Spell) { s.Name_lang[i18n.English] = "x" },
		func(s *chrondbc.Spell) { s.NameSubtext_lang[i18n.English] = "x" },
		func(s *chrondbc.Spell) { s.Description_lang[i18n.English] = "x" },
		func(s *chrondbc.Spell) { s.AuraDescription_lang[i18n.English] = "x" },
		func(s *chrondbc.Spell) { s.SpellIconID_++ },
		func(s *chrondbc.Spell) { s.ActiveIconID_++ },
		func(s *chrondbc.Spell) { s.CastingTimeIndex_++ },
		func(s *chrondbc.Spell) { s.RangeIndex_++ },
		func(s *chrondbc.Spell) { s.DurationIndex_++ },
		func(s *chrondbc.Spell) { s.CategoryID_++ },
		func(s *chrondbc.Spell) { s.SpellFocusID_++ },
		func(s *chrondbc.Spell) { *s.Effects[0].EffectBasePointsF++ },
		func(s *chrondbc.Spell) { s.Effects[0].EffectRadiusIndex[0]++ },
		func(s *chrondbc.Spell) { s.Effects[0].EffectMiscValue[0]++ },
		func(s *chrondbc.Spell) { s.Effects[0].ImplicitTarget[0]++ },
		func(s *chrondbc.Spell) { s.Effects[0].EffectSpellClassMask[0]++ },
		func(s *chrondbc.Spell) { s.Effects[0].EffectIndex++ },
		func(s *chrondbc.Spell) { s.Powers[0].ManaCost++ },
		func(s *chrondbc.Spell) { s.Variants[0].DifficultyID++ },
		func(s *chrondbc.Spell) { s.Variants[0].Misc.Attributes[0]++ },
		func(s *chrondbc.Spell) { s.Variants[0].AuraOptions.ProcTypeMask[0]++ },
		func(s *chrondbc.Spell) { s.Variants[0].AuraRestrictions.CasterAuraSpell++ },
		func(s *chrondbc.Spell) { s.Variants[0].ClassOptions.SpellClassMask[0]++ },
		func(s *chrondbc.Spell) { s.Variants[0].Interrupts.AuraInterruptFlags[0]++ },
		func(s *chrondbc.Spell) { s.Variants[0].Interrupts.ChannelInterruptFlags[0]++ },
		func(s *chrondbc.Spell) { s.Variants[0].Categories.Category++ },
		func(s *chrondbc.Spell) { s.Variants[0].Cooldowns.RecoveryTime++ },
		func(s *chrondbc.Spell) { s.Variants[0].Levels.SpellLevel++ },
		func(s *chrondbc.Spell) { s.Variants[0].TargetRestrictions.MaxTargets++ },
	}
}

func TestPreparedSpellGraphRejectsMismatch(t *testing.T) {
	t.Parallel()
	identity := preparedSpellIdentity()
	r := ownergraph.NewRegistry()
	spell := preparedSpellFixture()
	require.NoError(t, RegisterPreparedSpellGraphOwner(r, identity, map[chrondbc.SpellID]*chrondbc.Spell{spell.ID: spell}))
	for i, mutate := range preparedSpellMutations() {
		value := preparedSpellFixture()
		mutate(value)
		_, err := r.Capture(value)
		require.Error(t, err, "mutation %d", i)
	}
	_, err := r.Capture(&chrondbc.Spell{ID: 999})
	require.Error(t, err)
	snap, err := r.Capture(spell)
	require.NoError(t, err)
	for _, change := range []func(*snapshot.Compatibility){func(c *snapshot.Compatibility) { c.DatasetRevision++ }, func(c *snapshot.Compatibility) { c.Flavor = "other" }, func(c *snapshot.Compatibility) { c.Format = "other" }, func(c *snapshot.Compatibility) { c.BuildIdentity = "sha256:" + strings.Repeat("b", 64) }, func(c *snapshot.Compatibility) { c.DatasetID = "22222222-2222-2222-2222-222222222222" }} {
		other := identity
		change(&other)
		registry := ownergraph.NewRegistry()
		require.NoError(t, RegisterPreparedSpellGraphOwner(registry, other, map[chrondbc.SpellID]*chrondbc.Spell{spell.ID: spell}))
		_, err = registry.Restore(snap)
		require.Error(t, err)
	}
	empty := ownergraph.NewRegistry()
	require.NoError(t, RegisterPreparedSpellGraphOwner(empty, identity, map[chrondbc.SpellID]*chrondbc.Spell{}))
	_, err = empty.Restore(snap)
	require.Error(t, err)
	require.Error(t, RegisterPreparedSpellGraphOwner(ownergraph.NewRegistry(), snapshot.Compatibility{}, map[chrondbc.SpellID]*chrondbc.Spell{}))
	require.Error(t, RegisterPreparedSpellGraphOwner(ownergraph.NewRegistry(), identity, nil))
	require.Error(t, RegisterPreparedSpellGraphOwner(ownergraph.NewRegistry(), identity, map[chrondbc.SpellID]*chrondbc.Spell{1: nil}))
	require.Error(t, RegisterPreparedSpellGraphOwner(ownergraph.NewRegistry(), identity, map[chrondbc.SpellID]*chrondbc.Spell{1: spell}))
}

type preparedSpellPair struct{ A, B *chrondbc.Spell }

func TestPreparedSpellGraphCanonicalReferences(t *testing.T) {
	t.Parallel()
	r := ownergraph.NewRegistry()
	spell := preparedSpellFixture()
	require.NoError(t, RegisterPreparedSpellGraphOwner(r, preparedSpellIdentity(), map[chrondbc.SpellID]*chrondbc.Spell{spell.ID: spell}))
	require.NoError(t, ownergraph.Register(r, ownergraph.Codec[preparedSpellPair]{Type: "test.spell-pair", Version: 1, Init: func() *preparedSpellPair { return new(preparedSpellPair) }, Capture: func(pair *preparedSpellPair, c *ownergraph.Capture) ([]byte, error) {
		a, err := c.Ref(pair.A)
		if err != nil {
			return nil, err
		}
		b, err := c.Ref(pair.B)
		if err != nil {
			return nil, err
		}
		return json.Marshal([2]string{a, b})
	}, Restore: func(pair *preparedSpellPair, _ uint32, b []byte, c *ownergraph.Restore) error {
		var refs [2]string
		if err := json.Unmarshal(b, &refs); err != nil {
			return err
		}
		a, err := ownergraph.Loader[*chrondbc.Spell](c)(refs[0])
		if err != nil {
			return err
		}
		second, err := ownergraph.Loader[*chrondbc.Spell](c)(refs[1])
		if err != nil {
			return err
		}
		pair.A, pair.B = a, second
		return nil
	}}))
	snap, err := r.Capture(&preparedSpellPair{spell, spell})
	require.NoError(t, err)
	v, err := r.Restore(snap)
	require.NoError(t, err)
	pair := v.(*preparedSpellPair)
	require.Same(t, pair.A, pair.B)
	require.NotSame(t, spell, pair.A)
}

func TestPreparedSpellGraphStrictPayloadAndNilCollections(t *testing.T) {
	t.Parallel()
	for _, payload := range []string{
		`{"reference":{"spell_id":1,"spell_id":2}}`,
		`{"reference":{},"reference":{}}`,
		`{"unknown":1}`,
		`{} {}`,
	} {
		var state preparedSpellGraphState
		require.Error(t, decodePreparedSpellGraph([]byte(payload), &state))
	}
	r := ownergraph.NewRegistry()
	spell := &chrondbc.Spell{ID: 1}
	require.NoError(t, RegisterPreparedSpellGraphOwner(r, preparedSpellIdentity(), map[chrondbc.SpellID]*chrondbc.Spell{1: spell}))
	snap, err := r.Capture(spell)
	require.NoError(t, err)
	restored, err := r.Restore(snap)
	require.NoError(t, err)
	require.Equal(t, spell, restored)
	// Empty and absent collections are distinct effective values, even where JSON omitempty would conflate them.
	for _, mutate := range []func(*chrondbc.Spell){
		func(s *chrondbc.Spell) { s.Name_lang = i18n.Text{} },
		func(s *chrondbc.Spell) { s.Effects = []chrondbc.SpellEffect{} },
		func(s *chrondbc.Spell) { s.Powers = []chrondbc.SpellPower{} },
		func(s *chrondbc.Spell) { s.Variants = []chrondbc.SpellVariant{} },
	} {
		v := *spell
		mutate(&v)
		_, err = r.Capture(&v)
		require.Error(t, err)
	}
}
