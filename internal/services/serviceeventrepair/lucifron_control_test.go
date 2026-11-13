package serviceeventrepair

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/api/chronicleproto"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/rankings"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/unitinfo"
	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/proto"
)

func lucifronControlFixture(t *testing.T) (razorgoreEvidence, []proto.Message, []proto.Message) {
	t.Helper()
	e := fixtureLucifron(t)
	e.Group.Format = database.NullLogFormat{Valid: true, LogFormat: database.LogFormat112aCcAddon}
	e.Rankings[0].DamageDone = 0
	e.Rankings[0].UnrankedDamageDone = 200
	e.Rankings[0].Dps = 0
	damage := func(index int32, ms int64, caster, target string, amount int32) *chronicleproto.Damage {
		d := lucifronDamage(index, caster, target, amount)
		d.Meta.OffsetMilli = ms
		return d
	}
	player, protector := lucifronTestPlayer, lucifronTestProtector
	e.Events[0].Events = numericFrame(t, e,
		damage(1, 1000, player, lucifronTestBoss, 10),
		damage(4, 11000, player, lucifronTestBoss, 40),
		damage(5, 12000, "0x0000000000000002", player, 30),
		damage(6, 25000, player, protector, 50),
		damage(8, 25001, player, lucifronTestHound, 100),
		damage(10, 27000, player, "0x0000000000000002", 90))
	casts := []proto.Message{&chronicleproto.AuraCast{Meta: &chronicleproto.EventMeta{Index: 2, OffsetMilli: 10000}, Target: &player, Caster: protector, Spell: &chronicleproto.SpellData{Id: 20604}, EffectAuraName: 6, DurationMS: 15000},
		&chronicleproto.AuraCast{Meta: &chronicleproto.EventMeta{Index: 9, OffsetMilli: 26000}, Caster: protector, Spell: &chronicleproto.SpellData{Id: 20604}, EffectAuraName: 6, DurationMS: 15000}}
	snapshots := []proto.Message{&chronicleproto.UnitClassification{Meta: &chronicleproto.EventMeta{Index: 3, OffsetMilli: 10000}, Target: player, UnitType: int32(unitdb.UnitTypePlayer), Affiliation: int32(unitdb.AffiliationHostile), Controller: &protector, SpellId: 20604},
		&chronicleproto.UnitClassification{Meta: &chronicleproto.EventMeta{Index: 7, OffsetMilli: 25000}, Target: player, UnitType: int32(unitdb.UnitTypePlayer), Affiliation: int32(unitdb.AffiliationHostile), Controller: &protector, SpellId: 20604}}
	setLucifronControlStreams(t, &e, casts, snapshots)
	return e, casts, snapshots
}

func setLucifronControlStreams(t *testing.T, e *razorgoreEvidence, casts, snapshots []proto.Message) {
	t.Helper()
	e.Events = e.Events[:1]
	e.Events = append(e.Events, database.LogInstanceEvent{InstanceID: e.Instance.ID, Type: database.LogInstanceEventTypeAuraCast, Events: numericFrame(t, *e, casts...)}, database.LogInstanceEvent{InstanceID: e.Instance.ID, Type: database.LogInstanceEventTypeUnitClassification, Events: numericFrame(t, *e, snapshots...)})
}

func TestLucifronPlayerControlMatchesParserDamageSemantics(t *testing.T) {
	t.Parallel()
	e, _, _ := lucifronControlFixture(t)
	p, err := evaluateLucifronEvidence(e)
	require.NoError(t, err)
	require.False(t, p.RequiresReparse, p.Reason)
	require.Len(t, p.lucifron.Metrics, 1)
	update := p.lucifron.Metrics[0]
	require.EqualValues(t, 100, update.DamageDone)
	require.EqualValues(t, 100, update.UnrankedDamageDone)
	require.Empty(t, p.Details["omissions"])
	// Independent production-tracker replay demonstrates the non-obvious rule:
	// hostile controlled players still own their outgoing damage; damage INTO a
	// controlled player never counts. At the exact expiry instant control is live.
	units := unitdb.New()
	for _, text := range []string{lucifronTestBoss, lucifronTestProtector, lucifronTestHound} {
		g, err := guid.FromString(text)
		require.NoError(t, err)
		units.Info[g] = unitinfo.Info{Guid: g, Affiliation: unitdb.AffiliationHostile}
	}
	c := e.Encounters[0]
	tracker := rankings.NewDPSTracker(units, nil, rankings.DamageRuleNone)
	tracker.FightStarted(c.ID, nil)
	replay, err := lucifronEvents(e, c)
	require.NoError(t, err)
	var damages []*messages.Damage
	for _, event := range replay {
		require.NoError(t, units.ProcessMessage(event.message))
		switch m := event.message.(type) {
		case *messages.UnitClassificationEvent:
			// Both snapshots refer to the original cast, never a renewed timer.
			units.SetPossessed(m.Target, *m.Controller, m.Spell, c.StartTime.Time.Add(10*time.Second), 15*time.Second)
		case *messages.Damage:
			if event.index == 4 || event.index == 6 {
				require.NotNil(t, units.Classify(*m.Caster).Possession)
			}
			if event.index == 8 {
				require.Nil(t, units.Classify(*m.Caster).Possession)
			}
			damages = append(damages, m)
		}
		require.NoError(t, tracker.ProcessMessage(true, c.ID, event.message))
	}
	tracker.FightEnded(c.ID, nil)
	for _, damage := range damages {
		tracker.ClassifyDamage(c.ID, instances.MoltenCoreDamageTargets(nil)["Lucifron"], damage, nil)
	}
	tracker.FinishDamageClassification(c.ID)
	player, err := guid.FromString(lucifronTestPlayer)
	require.NoError(t, err)
	stats := tracker.Result()[c.ID].Units[player]
	require.EqualValues(t, 200, stats.DamageDone)
	require.Equal(t, stats.RankedDamageDone, update.DamageDone)
	require.Equal(t, stats.UnrankedDamageDone, update.UnrankedDamageDone)
}

func TestLucifronControlEvidenceFailures(t *testing.T) {
	t.Parallel()
	for _, kind := range []string{"missing aura", "missing classification", "missing duration", "wrong spell", "wrong controller", "noncreature controller", "nonplayer target", "late initial snapshot", "expired repeat", "boundary crossing", "duplicate index", "bad chronology", "malformed aura", "unsupported format", "owner chain", "missing spell"} {
		t.Run(kind, func(t *testing.T) {
			t.Parallel()
			e, casts, snapshots := lucifronControlFixture(t)
			cast := casts[0].(*chronicleproto.AuraCast)
			first := snapshots[0].(*chronicleproto.UnitClassification)
			repeat := snapshots[1].(*chronicleproto.UnitClassification)
			switch kind {
			case "missing aura":
				casts = casts[1:]
			case "missing classification":
				snapshots = nil
			case "missing duration":
				cast.DurationMS = 0
			case "wrong spell":
				cast.Spell.Id = 12345
			case "wrong controller":
				cast.Caster = lucifronTestHound
			case "noncreature controller":
				controller := "0xF110002F57000001"
				cast.Caster = controller
				first.Controller = &controller
				repeat.Controller = &controller
			case "nonplayer target":
				first.Target = lucifronTestBoss
			case "late initial snapshot":
				first.Meta.OffsetMilli = 10001
			case "expired repeat":
				cast.DurationMS = 14999
			case "boundary crossing":
				cast.Meta.OffsetMilli = -1
			case "duplicate index":
				cast.Meta.Index = 3
			case "bad chronology":
				cast.Meta.OffsetMilli = 11000
			case "unsupported format":
				e.Group.Format.Valid = false
			case "owner chain":
				owner := lucifronTestPlayer
				first.Owner = &owner
			case "missing spell":
				repeat.SpellId = 0
			}
			setLucifronControlStreams(t, &e, casts, snapshots)
			if kind == "malformed aura" {
				e.Events[1].Events = []byte("broken")
			}
			p, err := evaluateLucifronEvidence(e)
			require.NoError(t, err)
			require.True(t, p.RequiresReparse, p.Reason)
			require.Nil(t, p.lucifron)
		})
	}
}

func TestLucifronTargetlessControlDoesNotInventVictim(t *testing.T) {
	t.Parallel()
	e, casts, _ := lucifronControlFixture(t)
	// No classification is needed for a targetless cast. A damaged player is not
	// inferred to be its victim. This also retains the original direct-only path.
	setLucifronControlStreams(t, &e, casts[1:], nil)
	e.Events = e.Events[:2]
	p, err := evaluateLucifronEvidence(e)
	require.NoError(t, err)
	require.False(t, p.RequiresReparse, p.Reason)
	require.EqualValues(t, 100, p.lucifron.Metrics[0].DamageDone)
}

func TestLucifronControlReleaseAndEndBoundary(t *testing.T) {
	t.Parallel()
	for _, kind := range []string{"release", "extends past end", "stale repeat after release"} {
		t.Run(kind, func(t *testing.T) {
			t.Parallel()
			e, casts, snapshots := lucifronControlFixture(t)
			if kind == "extends past end" {
				casts[0].(*chronicleproto.AuraCast).DurationMS = 90000
			} else {
				release := &chronicleproto.UnitClassification{Meta: &chronicleproto.EventMeta{Index: 7, OffsetMilli: 25000}, Target: lucifronTestPlayer, UnitType: int32(unitdb.UnitTypePlayer), Affiliation: int32(unitdb.AffiliationFriendly)}
				snapshots[1] = release
				if kind == "stale repeat after release" {
					again := proto.Clone(snapshots[0]).(*chronicleproto.UnitClassification)
					again.Meta = &chronicleproto.EventMeta{Index: 11, OffsetMilli: 28000}
					snapshots = append(snapshots, again)
					casts[0].(*chronicleproto.AuraCast).DurationMS = 30000
				}
			}
			setLucifronControlStreams(t, &e, casts, snapshots)
			p, err := evaluateLucifronEvidence(e)
			require.NoError(t, err)
			require.Equal(t, kind == "stale repeat after release", p.RequiresReparse, p.Reason)
		})
	}
}
