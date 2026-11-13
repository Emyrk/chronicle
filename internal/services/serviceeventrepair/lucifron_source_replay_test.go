package serviceeventrepair

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/Emyrk/chronicle/api/chronicleproto"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/rankings"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/unitinfo"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/proto"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
	"time"
)

// TestLucifronCapturedSourceReplay is an opt-in acceptance check for privately
// captured public API evidence. No logs/player fixtures are checked into Git.
// The expected split is computed independently with production DPSTracker,
// never seeded from the repair's proposed values. See docs/admin-event-repairs.md.
func TestLucifronCapturedSourceReplay(t *testing.T) {
	dir := os.Getenv("CHRONICLE_LUCIFRON_EVIDENCE_DIR")
	if dir == "" {
		t.Skip("set CHRONICLE_LUCIFRON_EVIDENCE_DIR for captured-source acceptance")
	}
	t.Parallel()
	dir = filepath.Clean(dir) + string(os.PathSeparator)
	ctx := context.Background()
	read := func(name string) []byte { b, err := os.ReadFile(dir + name); require.NoError(t, err); return b }
	var meta struct {
		ID, RealmID, LogGroupID uuid.UUID
		Format                  string
		Flavor                  []string
		Versions                database.VersionsMap
		Encounters              []json.RawMessage
	}
	var envelope map[string]json.RawMessage
	require.NoError(t, json.Unmarshal(read("metadata"), &envelope))
	require.NoError(t, json.Unmarshal(envelope["id"], &meta.ID))
	require.NoError(t, json.Unmarshal(envelope["realm_id"], &meta.RealmID))
	require.NoError(t, json.Unmarshal(envelope["log_group_id"], &meta.LogGroupID))
	require.NoError(t, json.Unmarshal(envelope["format"], &meta.Format))
	require.NoError(t, json.Unmarshal(envelope["flavor"], &meta.Flavor))
	require.NoError(t, json.Unmarshal(envelope["versions"], &meta.Versions))
	require.NoError(t, json.Unmarshal(envelope["encounters"], &meta.Encounters))
	require.NotEqual(t, uuid.Nil, meta.ID)
	var e razorgoreEvidence
	e.Instance = database.LogInstance{ID: meta.ID, RealmID: meta.RealmID, LogGroupID: meta.LogGroupID, Name: "Molten Core", Versions: meta.Versions}
	e.Instance.ParserVersion = strings.TrimSpace(string(read("parser_version.txt")))
	// Exact parser_version supplied by the user admin report; public export omits it.
	e.Group.Flavor = meta.Flavor
	e.Group.Format = database.NullLogFormat{LogFormat: database.LogFormat(meta.Format), Valid: true}
	e.Realm = database.WowServerRealm{ID: meta.RealmID, ServerID: uuid.New()}
	e.Server = database.WowServer{ID: e.Realm.ServerID, TenantID: uuid.NullUUID{UUID: uuid.New(), Valid: true}}
	for _, raw := range meta.Encounters {
		var c database.LogInstanceEncounter
		require.NoError(t, json.Unmarshal(raw, &c))
		e.Encounters = append(e.Encounters, c)
		var h struct {
			Hostiles []database.LogInstanceEncounterHostile `json:"hostiles"`
		}
		require.NoError(t, json.Unmarshal(raw, &h))
		for _, v := range h.Hostiles {
			v.EncounterID = c.ID
			e.Hostiles = append(e.Hostiles, v)
		}
	}
	require.NoError(t, json.Unmarshal(read("_ranking-records"), &e.Rankings))
	var exported []map[string]json.RawMessage
	require.NoError(t, json.Unmarshal(read("_ranking-records"), &exported))
	for i := range e.Rankings {
		e.Rankings[i].InstanceID = meta.ID
		e.Rankings[i].InstanceName = "Molten Core"
		if _, present := exported[i]["unranked_damage_done"]; !present {
			require.Equal(t, "1", os.Getenv("CHRONICLE_REPAIR_ASSUME_HISTORICAL_UNRANKED_ZERO"), "public export lacks current unranked column: explicitly acknowledge historical-zero assumption")
		}
	}
	// Unranked values omitted by the public export are historical-default assumptions,
	// not independently observed current database columns. Full totals are still
	// checked against production replay, never copied from its expected split.
	for _, pair := range []struct {
		kind database.LogInstanceEventType
		file string
	}{{database.LogInstanceEventTypeDamage, "_events_damage"}, {database.LogInstanceEventTypeUnitClassification, "_events_unit_classification"}, {database.LogInstanceEventTypeAuraCast, "_events_aura_cast"}} {
		e.Events = append(e.Events, database.LogInstanceEvent{InstanceID: meta.ID, Type: pair.kind, Events: read(pair.file)})
	}
	var c database.LogInstanceEncounter
	for _, candidate := range e.Encounters {
		if candidate.Name == "Lucifron" && candidate.KillType == database.KillTypeClean {
			require.Equal(t, uuid.Nil, c.ID, "probe currently requires one clean Lucifron encounter")
			c = candidate
		}
	}
	require.NotEqual(t, uuid.Nil, c.ID)
	// Independent reference: production DPSTracker + unitdb possession machinery,
	// not repair arithmetic. No persisted ranking value feeds this computation.
	replay, err := lucifronEvents(e, c)
	require.NoError(t, err)
	raw, err := razorgoreFrame(read("_events_aura_cast"), c.ID, c.StartTime.Time)
	require.NoError(t, err)
	controls, targetless := 0, 0
	for _, b := range raw {
		var a chronicleproto.AuraCast
		require.NoError(t, proto.Unmarshal(b, &a))
		if a.EffectAuraName != 2 && a.EffectAuraName != 6 {
			continue
		}
		if a.Target == nil {
			targetless++

			continue
		}
		target, err := guid.FromString(a.GetTarget())
		require.NoError(t, err)
		caster, err := guid.FromString(a.Caster)
		require.NoError(t, err)
		if target == caster {
			continue
		}
		controls++

		at := c.StartTime.Time.Add(time.Duration(a.Meta.OffsetMilli) * time.Millisecond)
		replay = append(replay, razorgoreReplayEvent{index: a.Meta.Index, at: at, message: &messages.PossessionChange{MessageBase: messages.Base(at), Target: target, Controller: caster, Spell: &chrondbc.Spell{ID: chrondbc.SpellID(a.Spell.Id)}, Gained: true, Duration: time.Duration(a.DurationMS) * time.Millisecond}})
	}
	sort.Slice(replay, func(i, j int) bool { return replay[i].index < replay[j].index })
	units := unitdb.New()
	tracker := rankings.NewDPSTracker(units, nil, rankings.DamageRuleNone)
	tracker.FightStarted(c.ID, nil)
	var damage []*messages.Damage
	for _, event := range replay {
		require.NoError(t, units.ProcessMessage(event.message))
		switch m := event.message.(type) {
		case *messages.UnitClassificationEvent:
			info := units.Info[m.Target]
			info.Guid = m.Target
			info.Owner = m.Owner
			info.IsPlayer = m.Target.IsPlayer()
			if m.Controller == nil {
				info.Affiliation = m.Affiliation
				units.ClearPossessed(m.Target)
			} else if m.Target.IsPlayer() {
				info.Affiliation = unitdb.AffiliationFriendly
			}
			units.Info[m.Target] = info
		case *messages.Damage:
			if _, ok := units.Info[m.Target]; !ok && !m.Target.IsPlayer() {
				entry, _ := m.Target.GetEntry()
				if _, known := instances.MoltenCoreHostiles()[entry]; known {
					units.Info[m.Target] = unitinfo.Info{Guid: m.Target, Affiliation: unitdb.AffiliationHostile}
				}
			}
			require.NoError(t, tracker.ProcessMessage(true, c.ID, m))
			damage = append(damage, m)
		}
	}
	tracker.FightEnded(c.ID, &messages.Damage{MessageBase: messages.Base(c.EndTime.Time)})
	rule := instances.MoltenCoreDamageTargets(database.FlavorFromStrings(meta.Flavor))["Lucifron"]
	for _, d := range damage {
		tracker.ClassifyDamage(c.ID, rule, d, nil)
	}
	result := razorgoreMergePetDamage(tracker.Result()[c.ID])
	var full, ranked, unranked int64
	players := 0
	lines := "player_guid,player_name,historical_total,reference_total,reference_ranked,reference_unranked,reference_dps\n"
	for _, r := range e.Rankings {
		if !r.EncounterID.Valid || r.EncounterID.UUID != c.ID {
			continue
		}
		g, err := guid.FromString(r.PlayerGuid)
		require.NoError(t, err)
		v := result.Units[g]
		if v == nil {
			v = &rankings.UnitCombatStats{}
		}
		require.Equal(t, r.DamageDone, v.DamageDone, "historical total for %s", r.PlayerName)
		players++
		full += v.DamageDone
		ranked += v.RankedDamageDone
		unranked += v.UnrankedDamageDone
		lines += fmt.Sprintf("%s,%s,%d,%d,%d,%d,%.9f\n", r.PlayerGuid, r.PlayerName, r.DamageDone, v.DamageDone, v.RankedDamageDone, v.UnrankedDamageDone, float64(v.RankedDamageDone)/r.DurationSecs)
	}
	require.NoError(t, os.WriteFile(dir+"independent-reference.csv", []byte(lines), 0600))
	t.Logf("REFERENCE players=%d full=%d ranked=%d unranked=%d controls=%d targetless=%d duration=%.3f", players, full, ranked, unranked, controls, targetless, c.EndTime.Time.Sub(c.StartTime.Time).Seconds())
	before, err := json.Marshal(e)
	require.NoError(t, err)
	p, err := EvaluateLucifron(ctx, &razorgoreStore{e: e}, meta.ID)
	require.NoError(t, err)
	after, err := json.Marshal(e)
	require.NoError(t, err)
	require.Equal(t, before, after, "evaluation must not mutate original source evidence")
	require.False(t, p.RequiresReparse, p.Reason)
	require.Empty(t, p.Details["omissions"], "source acceptance must not silently omit contributions")
	require.Len(t, p.Details["players"], players)
	t.Logf("READY players=%d warnings=%d parser=%s", players, len(p.Warnings), e.Instance.ParserVersion)
	if !p.RequiresReparse {
		for _, d := range p.Details["players"].([]lucifronPlayerChange) {
			g, err := guid.FromString(d.PlayerGUID)
			require.NoError(t, err)
			v := result.Units[g]
			if v == nil {
				v = &rankings.UnitCombatStats{}
			}
			require.Equal(t, v.RankedDamageDone, d.AfterRankedDamage, d.PlayerName)
			require.Equal(t, v.UnrankedDamageDone, d.AfterUnrankedDamage, d.PlayerName)
			require.InDelta(t, float64(v.RankedDamageDone)/c.EndTime.Time.Sub(c.StartTime.Time).Seconds(), d.AfterDPS, 1e-9, d.PlayerName)
		}
	}
}
