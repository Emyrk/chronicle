package serviceeventrepair

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"testing"

	"github.com/Emyrk/chronicle/api/chronicleproto"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/rankings"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/encoding/protowire"
	"google.golang.org/protobuf/proto"
)

func numericFrame(t *testing.T, e razorgoreEvidence, events ...proto.Message) []byte {
	t.Helper()
	var body []byte
	for _, event := range events {
		b, err := proto.Marshal(event)
		require.NoError(t, err)
		body = protowire.AppendBytes(body, b)
	}
	c := e.Encounters[0]
	data := protowire.AppendString(nil, c.ID.String())
	data = protowire.AppendVarint(data, uint64(c.StartTime.Time.UnixMilli()))
	data = protowire.AppendVarint(data, uint64(len(events)))
	data = protowire.AppendVarint(data, uint64(len(body)))
	data = append(data, body...)
	var b bytes.Buffer
	z := gzip.NewWriter(&b)
	_, err := z.Write(data)
	require.NoError(t, err)
	require.NoError(t, z.Close())
	return b.Bytes()
}

func fixtureRazorgoreNumeric(t *testing.T) razorgoreEvidence {
	t.Helper()
	e := fixtureRazorgore(t)
	c := e.Encounters[0]
	e.Phases[0].EndOffsetMs = 30000
	p2 := e.Phases[0]
	p2.ID = uuid.MustParse("00000000-0000-0000-0000-000000000030")
	p2.Key = "razorgore_p2"
	p2.PhaseOrder = 1
	p2.StartOffsetMs = 30000
	p2.EndOffsetMs = 60000
	e.Phases = append(e.Phases, p2)
	player := "0x0000000000000001"
	healer := "0x0000000000000002"
	boss := e.Hostiles[0].ID.String()
	add := "0xF130003090000001"
	meta := func(index int32, ms int64) *chronicleproto.EventMeta {
		return &chronicleproto.EventMeta{Index: index, OffsetMilli: ms}
	}
	absorb := uint32(20)
	e.Events = []database.LogInstanceEvent{
		{InstanceID: e.Instance.ID, Type: database.LogInstanceEventTypeDamage, Events: numericFrame(t, e,
			&chronicleproto.Damage{Meta: meta(1, 5000), Caster: &boss, Target: player, Amount: 200},
			&chronicleproto.Damage{Meta: meta(2, 10000), Caster: &player, Target: boss, Amount: 100},
			&chronicleproto.Damage{Meta: meta(3, 12000), Caster: &player, Target: add, Amount: 50},
			&chronicleproto.Damage{Meta: meta(7, 30000), Caster: &healer, Target: boss, Amount: 40},
			&chronicleproto.Damage{Meta: meta(9, 40000), Caster: &player, Target: boss, Amount: 200, Overkill: 20, Tailers: []*chronicleproto.Tailer{{Amount: &absorb, HitType: uint32(types.HitTypePartialAbsorb)}}},
			&chronicleproto.Damage{Meta: meta(10, 42000), Caster: &player, Target: add, Amount: 70},
			&chronicleproto.Damage{Meta: meta(15, 60000), Caster: &player, Target: boss, Amount: 30})},
		{InstanceID: e.Instance.ID, Type: database.LogInstanceEventTypeHeal, Events: numericFrame(t, e,
			&chronicleproto.Heal{Meta: meta(4, 15000), Caster: healer, Target: player, Amount: 80},
			&chronicleproto.Heal{Meta: meta(11, 43000), Caster: healer, Target: player, Amount: 100, Overheal: 30})},
		{InstanceID: e.Instance.ID, Type: database.LogInstanceEventTypeAbsorbed, Events: numericFrame(t, e,
			&chronicleproto.Absorbed{Meta: meta(5, 20000), Caster: healer, Target: player, Amount: 10},
			&chronicleproto.Absorbed{Meta: meta(12, 44000), Caster: healer, Target: player, Amount: 20})},
		{InstanceID: e.Instance.ID, Type: database.LogInstanceEventTypeSlain, Events: numericFrame(t, e,
			&chronicleproto.Slain{Meta: meta(6, 25000), Target: player},
			&chronicleproto.Slain{Meta: meta(13, 50000), Target: player},
			&chronicleproto.Slain{Meta: meta(16, 60000), Target: boss})},
		{InstanceID: e.Instance.ID, Type: database.LogInstanceEventTypeRessurection, Events: numericFrame(t, e,
			&chronicleproto.Resurrection{Meta: meta(8, 35000), Target: player},
			&chronicleproto.Resurrection{Meta: meta(14, 55000), Target: player})},
	}
	e.Rankings[0].PlayerGuid = player
	e.Rankings[0].DamageDone = 330
	e.Rankings[0].UnrankedDamageDone = 120
	e.Rankings[0].PlayerClass = "WARRIOR"
	e.Rankings[0].PlayerSpec = "Fury"
	e.Rankings[0].PlayerSubSpec = "preserved"
	e.Rankings[0].TalentBuildID = uuid.NullUUID{UUID: uuid.MustParse("00000000-0000-0000-0000-000000000031"), Valid: true}
	e.Rankings[0].DurationSecs = 60
	h := e.Rankings[0]
	h.ID = uuid.MustParse("00000000-0000-0000-0000-000000000032")
	h.PlayerGuid = healer
	h.PlayerClass = "PRIEST"
	h.PlayerSpec = "Holy"
	h.DamageDone = 40
	h.UnrankedDamageDone = 0
	h.HealingDone = 150
	h.AbsorbedDone = 30
	e.Rankings = append(e.Rankings, h)
	payload := rankings.SpeedrunProofPayload{}
	for _, req := range instances.BlackwingLairSpeedrunRequirements(database.WoWFlavor{}) {
		proof := rankings.SpeedrunProof{Requirement: req, Kills: []rankings.KillRecord{}}
		if req.EntryIDs[0] == 12435 {
			proof.Satisfied = true
			proof.Kills = append(proof.Kills, rankings.KillRecord{EntryID: 12435, GUID: e.Hostiles[0].ID, Timestamp: c.EndTime.Time})
		}
		payload.Proof = append(payload.Proof, proof)
	}
	proof, err := json.Marshal(payload)
	require.NoError(t, err)
	e.Speedruns = []database.InstanceSpeedrun{{InstanceID: e.Instance.ID, RealmID: e.Instance.RealmID, InstanceName: e.Instance.Name, StartTime: c.StartTime, CompletionTime: c.EndTime, DurationMs: 60000, RankedStartTime: c.StartTime, RankedCompletionTime: c.EndTime, RankedDurationMs: pgtype.Int8{Int64: 60000, Valid: true}, BossToBossStartTime: c.StartTime, BossToBossCompletionTime: c.EndTime, BossToBossDurationMs: pgtype.Int8{Int64: 60000, Valid: true}, Proof: proof}}
	return e
}

func TestRazorgoreNumericalRepairEndToEnd(t *testing.T) {
	t.Parallel()
	e := fixtureRazorgoreNumeric(t)
	s := &razorgoreStore{e: e}
	ctx := context.Background()
	beforeProof := append([]byte(nil), e.Speedruns[0].Proof...)
	beforeEvents := append([]database.LogInstanceEvent(nil), e.Events...)
	p, err := EvaluateRazorgore(ctx, s, e.Instance.ID)
	require.NoError(t, err)
	require.False(t, p.RequiresReparse, p.Reason)
	require.Len(t, p.numeric.Metrics, 2)
	require.NoError(t, RevalidateRazorgore(ctx, s, p))
	require.NoError(t, ApplyRazorgore(ctx, s, p))
	require.Equal(t, []string{"window", "metrics", "metrics"}, s.writes)
	d := s.e.Rankings[0]
	require.EqualValues(t, 230, d.DamageDone)
	require.EqualValues(t, 220, d.UnrankedDamageDone)
	require.Equal(t, 30.0, d.DurationSecs)
	require.Equal(t, 230.0/30, d.Dps)
	require.EqualValues(t, 1, d.PlayerDeaths.Int32)
	require.InDelta(t, 100.0*20/30, d.AlivePercentage.Float64, 0.000001)
	h := s.e.Rankings[1]
	require.EqualValues(t, 40, h.DamageDone)
	require.EqualValues(t, 70, h.HealingDone)
	require.EqualValues(t, 20, h.AbsorbedDone)
	require.Equal(t, 3.0, h.Hps)
	require.Equal(t, "Fury", d.PlayerSpec)
	require.Equal(t, "preserved", d.PlayerSubSpec)
	require.Equal(t, e.Rankings[0].TalentBuildID, d.TalentBuildID)
	require.Equal(t, beforeProof, s.e.Speedruns[0].Proof)
	require.EqualValues(t, 60000, s.e.Speedruns[0].RankedDurationMs.Int64)
	require.Equal(t, beforeEvents, s.e.Events)
	fresh, err := EvaluateRazorgore(ctx, s, e.Instance.ID)
	require.NoError(t, err)
	require.False(t, fresh.RequiresReparse, fresh.Reason)
	require.Empty(t, fresh.Changes)
	require.NoError(t, RevalidateRazorgore(ctx, s, fresh))
	require.NoError(t, ApplyRazorgore(ctx, s, fresh))
	require.Len(t, s.writes, 3)
}

func (s *razorgoreStore) RazorgoreRepairRankingWindow(_ context.Context, p database.RazorgoreRepairRankingWindowParams) error {
	s.writes = append(s.writes, "window")
	s.e.Encounters[0].RankingStartOffsetMs = p.StartMs
	s.e.Encounters[0].RankingEndOffsetMs = p.EndMs
	return nil
}
func (s *razorgoreStore) RazorgoreRepairMetrics(_ context.Context, p database.RazorgoreRepairMetricsParams) error {
	s.writes = append(s.writes, "metrics")
	for i := range s.e.Rankings {
		r := &s.e.Rankings[i]
		if r.ID != p.ID {
			continue
		}
		r.DamageDone = p.DamageDone
		r.UnrankedDamageDone = p.UnrankedDamageDone
		r.HealingDone = p.HealingDone
		r.AbsorbedDone = p.AbsorbedDone
		r.DurationSecs = p.DurationSecs
		r.Dps = p.Dps
		r.Hps = p.Hps
		r.PlayerRole = p.PlayerRole
		r.PlayerDeaths = p.PlayerDeaths
		r.AlivePercentage = p.AlivePercentage
	}
	return nil
}

func TestRazorgoreNumericalRejectsUnprovableEvidence(t *testing.T) {
	t.Parallel()
	cases := map[string]func(*razorgoreEvidence){
		"upper bound mismatch":   func(e *razorgoreEvidence) { e.Rankings[0].DamageDone-- },
		"missing source player":  func(e *razorgoreEvidence) { e.Rankings = e.Rankings[:1] },
		"missing healing stream": func(e *razorgoreEvidence) { e.Events = append(e.Events[:1], e.Events[2:]...) },
		"lost heal events":       func(e *razorgoreEvidence) { e.Events[1].Events = numericFrame(t, *e) },
		"lost absorbed events":   func(e *razorgoreEvidence) { e.Events[2].Events = numericFrame(t, *e) },
		"duplicate event index": func(e *razorgoreEvidence) {
			e.Events[1].Events = numericFrame(t, *e, &chronicleproto.Heal{Meta: &chronicleproto.EventMeta{Index: 1, OffsetMilli: 15000}, Caster: "0x0000000000000002", Target: "0x0000000000000001", Amount: 150})
		},
		"pet source": func(e *razorgoreEvidence) {
			caster := "0xF130003090000001"
			e.Events[0].Events = numericFrame(t, *e, &chronicleproto.Damage{Meta: &chronicleproto.EventMeta{Index: 1, OffsetMilli: 40000}, Caster: &caster, Target: e.Hostiles[0].ID.String(), Amount: 450})
		},
		"pet healing": func(e *razorgoreEvidence) {
			e.Events[1].Events = numericFrame(t, *e, &chronicleproto.Heal{Meta: &chronicleproto.EventMeta{Index: 4, OffsetMilli: 15000}, Caster: "0xF130003090000001", Target: "0x0000000000000001", Amount: 150})
		},
		"incorrect speedrun duration": func(e *razorgoreEvidence) { e.Speedruns[0].DurationMs = 30000 },
		"missing speedrun":            func(e *razorgoreEvidence) { e.Speedruns = nil },
		"incorrect proof":             func(e *razorgoreEvidence) { e.Speedruns[0].Proof = []byte(`{"proof":[]}`) },
		"phase gap":                   func(e *razorgoreEvidence) { e.Phases[1].StartOffsetMs++ },
		"multiple encounters":         func(e *razorgoreEvidence) { e.Encounters = append(e.Encounters, e.Encounters[0]) },
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			s := &razorgoreStore{e: fixtureRazorgoreNumeric(t)}
			mutate(&s.e)
			p, err := EvaluateRazorgore(context.Background(), s, s.e.Instance.ID)
			require.NoError(t, err)
			require.True(t, p.RequiresReparse, p.Reason)
			require.Empty(t, p.Changes)
			require.Error(t, ApplyRazorgore(context.Background(), s, p))
			require.Empty(t, s.writes)
		})
	}
}

func TestRazorgoreNumericalEmptyStreamsAreExplicit(t *testing.T) {
	t.Parallel()
	e := fixtureRazorgoreNumeric(t)
	// Empty heal/absorb streams are acceptable only when source totals agree.
	e.Events[1].Events = numericFrame(t, e)
	e.Events[2].Events = numericFrame(t, e)
	e.Rankings[1].HealingDone = 0
	e.Rankings[1].AbsorbedDone = 0
	p, err := evaluateRazorgoreEvidence(e)
	require.NoError(t, err)
	require.False(t, p.RequiresReparse, p.Reason)
}

func TestRazorgoreNumericalNoopChecksEveryMetric(t *testing.T) {
	t.Parallel()
	s := &razorgoreStore{e: fixtureRazorgoreNumeric(t)}
	ctx := context.Background()
	p, err := EvaluateRazorgore(ctx, s, s.e.Instance.ID)
	require.NoError(t, err)
	require.NoError(t, RevalidateRazorgore(ctx, s, p))
	require.NoError(t, ApplyRazorgore(ctx, s, p))
	s.e.Rankings[0].Dps = 0
	again, err := EvaluateRazorgore(ctx, s, s.e.Instance.ID)
	require.NoError(t, err)
	require.False(t, again.RequiresReparse, again.Reason)
	require.NotEmpty(t, again.Changes)
}
