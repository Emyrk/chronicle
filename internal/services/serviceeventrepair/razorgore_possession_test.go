package serviceeventrepair

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/api/chronicleproto"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounter"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/proto"
)

func fixtureRazorgorePossession(t *testing.T) razorgoreEvidence {
	t.Helper()
	e := fixtureRazorgoreNumeric(t)
	c := e.Encounters[0]
	factories := map[database.LogInstanceEventType]func() proto.Message{
		database.LogInstanceEventTypeDamage: func() proto.Message { return &chronicleproto.Damage{} }, database.LogInstanceEventTypeHeal: func() proto.Message { return &chronicleproto.Heal{} }, database.LogInstanceEventTypeAbsorbed: func() proto.Message { return &chronicleproto.Absorbed{} }, database.LogInstanceEventTypeSlain: func() proto.Message { return &chronicleproto.Slain{} }, database.LogInstanceEventTypeRessurection: func() proto.Message { return &chronicleproto.Resurrection{} }}
	player := e.Rankings[0].PlayerGuid
	boss := e.Hostiles[0].ID.String()
	for i, row := range e.Events {
		raw, err := razorgoreFrame(row.Events, c.ID, c.StartTime.Time)
		require.NoError(t, err)
		var events []proto.Message
		for _, b := range raw {
			m := factories[row.Type]()
			require.NoError(t, proto.Unmarshal(b, m))
			m.(interface {
				GetMeta() *chronicleproto.EventMeta
			}).GetMeta().Index *= 10
			events = append(events, m)
		}
		if row.Type == database.LogInstanceEventTypeDamage {
			events = append(events, &chronicleproto.Damage{Meta: &chronicleproto.EventMeta{Index: 85, OffsetMilli: 36000}, Caster: &player, Target: boss, Amount: 20})
		}
		e.Events[i].Events = numericFrame(t, e, events...)
	}
	e.Rankings[0].DamageDone += 20
	e.Events = append(e.Events, database.LogInstanceEvent{Type: database.LogInstanceEventTypeUnitClassification, Events: numericFrame(t, e,
		&chronicleproto.UnitClassification{Meta: &chronicleproto.EventMeta{Index: 1}, Target: "0xF130003090000001", UnitType: int32(unitdb.UnitTypeCreature), Affiliation: int32(unitdb.AffiliationHostile)},
		&chronicleproto.UnitClassification{Meta: &chronicleproto.EventMeta{Index: 0}, Target: boss, UnitType: int32(unitdb.UnitTypeCreature), Affiliation: int32(unitdb.AffiliationHostile)},
		&chronicleproto.UnitClassification{Meta: &chronicleproto.EventMeta{Index: 12, OffsetMilli: 6000}, Target: boss, UnitType: int32(unitdb.UnitTypeCreature), Affiliation: int32(unitdb.AffiliationFriendly), Controller: &player, SpellId: 19832},
		&chronicleproto.UnitClassification{Meta: &chronicleproto.EventMeta{Index: 15, OffsetMilli: 8000}, Target: boss, UnitType: int32(unitdb.UnitTypeCreature), Affiliation: int32(unitdb.AffiliationFriendly), Controller: &player, SpellId: 19832})},
		database.LogInstanceEvent{Type: database.LogInstanceEventTypeAuraCast, Events: numericFrame(t, e, &chronicleproto.AuraCast{Meta: &chronicleproto.EventMeta{Index: 11, OffsetMilli: 6000}, Spell: &chronicleproto.SpellData{Id: 19832}, Caster: player, Target: &boss, EffectAuraName: 2, DurationMS: 29000})})
	return e
}

func TestRazorgorePossessionExpiryDoesNotRenewOnSnapshots(t *testing.T) {
	t.Parallel()
	e := fixtureRazorgorePossession(t)
	c := e.Encounters[0]
	window := &encounter.RankingWindow{Start: c.StartTime.Time.Add(30 * time.Second), End: c.EndTime.Time}
	result, life, err := replayRazorgoreClassified(e, c, window, database.LogFormat112aCcAddon)
	require.NoError(t, err)
	player, err := guid.FromString(e.Rankings[0].PlayerGuid)
	require.NoError(t, err)
	healer, err := guid.FromString(e.Rankings[1].PlayerGuid)
	require.NoError(t, err)
	require.EqualValues(t, 250, result.Units[player].RankedDamageDone, "36s hit follows original 35s expiry, not renewed 37s expiry")
	require.EqualValues(t, 0, result.Units[healer].RankedDamageDone, "30s hit while target possessed is excluded")
	require.EqualValues(t, 40, result.Units[healer].UnrankedDamageDone, "raw credit totals remain authoritative")
	require.EqualValues(t, 70, result.Units[healer].HealingDone)
	require.EqualValues(t, 20, result.Units[healer].HealingAbsorbed)
	require.EqualValues(t, 1, life.Players[player].Deaths)
}

func TestRazorgorePossessionRequiresAuthoritativeDuration(t *testing.T) {
	t.Parallel()
	e := fixtureRazorgorePossession(t)
	c := e.Encounters[0]
	window := &encounter.RankingWindow{Start: c.StartTime.Time.Add(30 * time.Second), End: c.EndTime.Time}
	e.Events = e.Events[:len(e.Events)-1]
	_, _, err := replayRazorgoreClassified(e, c, window, database.LogFormat112aCcAddon)
	require.ErrorContains(t, err, "missing aura_cast")
}

func TestRazorgoreStoredSyntheticMetricsAreReplayable(t *testing.T) {
	t.Parallel()
	e := fixtureRazorgoreNumeric(t)
	c := e.Encounters[0]
	for i, row := range e.Events {
		if row.Type != database.LogInstanceEventTypeAbsorbed && row.Type != database.LogInstanceEventTypeRessurection {
			continue
		}
		raw, err := razorgoreFrame(row.Events, c.ID, c.StartTime.Time)
		require.NoError(t, err)
		var events []proto.Message
		for _, b := range raw {
			var m proto.Message
			if row.Type == database.LogInstanceEventTypeAbsorbed {
				m = &chronicleproto.Absorbed{}
			} else {
				m = &chronicleproto.Resurrection{}
			}
			require.NoError(t, proto.Unmarshal(b, m))
			m.(interface {
				GetMeta() *chronicleproto.EventMeta
			}).GetMeta().IsSynthetic = true
			events = append(events, m)
		}
		e.Events[i].Events = numericFrame(t, e, events...)
	}
	p, err := evaluateRazorgoreEvidence(e)
	require.NoError(t, err)
	require.False(t, p.RequiresReparse, p.Reason)
}

func TestClassifiedRepairDoesNotTrustHistoricalDerivedHealing(t *testing.T) {
	t.Parallel()
	e := fixtureRazorgorePossession(t)
	e.Rankings[1].HealingDone += 337
	e.Rankings[1].AbsorbedDone += 39
	c := e.Encounters[0]
	window := &encounter.RankingWindow{Start: c.StartTime.Time.Add(30 * time.Second), End: c.EndTime.Time}
	result, _, err := replayRazorgoreClassified(e, c, window, database.LogFormat112aCcAddon)
	require.NoError(t, err)
	healer, err := guid.FromString(e.Rankings[1].PlayerGuid)
	require.NoError(t, err)
	require.EqualValues(t, 70, result.Units[healer].HealingDone)
	require.EqualValues(t, 20, result.Units[healer].HealingAbsorbed)
	// Still reject genuinely missing inputs, regardless of historical totals.
	for i, row := range e.Events {
		if row.Type == database.LogInstanceEventTypeHeal {
			e.Events = append(e.Events[:i], e.Events[i+1:]...)
			break
		}
	}
	_, _, err = replayRazorgoreClassified(e, c, window, database.LogFormat112aCcAddon)
	require.ErrorContains(t, err, "missing heal stream")
}
