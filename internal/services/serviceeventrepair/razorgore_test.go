package serviceeventrepair

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"fmt"
	"slices"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/api/chronicleproto"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/encoding/protowire"
	"google.golang.org/protobuf/proto"
)

func fixtureRazorgore(t *testing.T) razorgoreEvidence {
	t.Helper()
	id := uuid.MustParse("00000000-0000-0000-0000-000000000001")
	enc := uuid.MustParse("00000000-0000-0000-0000-000000000002")
	boss, err := guid.FromString("0xF130003093000001")
	require.NoError(t, err)
	entry, ok := boss.GetEntry()
	require.True(t, ok)
	require.EqualValues(t, 12435, entry)
	start := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	end := start.Add(time.Minute)
	e := razorgoreEvidence{
		Instance:   database.LogInstance{ID: id, Name: "Blackwing Lair", StartTime: database.Timestamptz(start), EndTime: database.Timestamptz(end)},
		Encounters: []database.LogInstanceEncounter{{ID: enc, InstanceID: id, Name: "Razorgore the Untamed", Boss: true, StartTime: database.Timestamptz(start), EndTime: database.Timestamptz(end), KillType: database.KillTypeClean}},
		Phases:     []database.LogInstanceEncounterPhase{{ID: uuid.MustParse("00000000-0000-0000-0000-000000000003"), EncounterID: enc, Key: "razorgore_p1", StartOffsetMs: 0, EndOffsetMs: 60000, KillType: database.KillTypeClean}},
		Hostiles:   []database.LogInstanceEncounterHostile{{EncounterID: enc, ID: boss, Boss: true, Periods: database.Periods{{Start: &database.PeriodMoment{Timestamp: start}, End: &database.PeriodMoment{Timestamp: end, Reason: "slain"}, EndState: database.EndStateSlain}}}},
		Rankings:   []database.EncounterDpsRanking{{ID: uuid.MustParse("00000000-0000-0000-0000-000000000004"), InstanceID: id, EncounterID: uuid.NullUUID{UUID: enc, Valid: true}, DamageDone: 1000}},
		Speedruns:  []database.InstanceSpeedrun{{InstanceID: id, Proof: []byte(`{"proof":[{"requirement":{"name":"Razorgore the Untamed"},"satisfied":true}]}`)}},
	}
	e.Instance.RealmID = uuid.MustParse("00000000-0000-0000-0000-000000000020")
	e.Realm = database.WowServerRealm{ID: e.Instance.RealmID, ServerID: uuid.MustParse("00000000-0000-0000-0000-000000000021")}
	e.Server = database.WowServer{ID: e.Realm.ServerID, TenantID: uuid.NullUUID{UUID: uuid.MustParse("00000000-0000-0000-0000-000000000022"), Valid: true}}
	e.Events = []database.LogInstanceEvent{{InstanceID: id, Type: database.LogInstanceEventTypeSlain, Events: encodeDeaths(t, enc, start, &chronicleproto.Slain{Meta: &chronicleproto.EventMeta{Index: 12, OffsetMilli: 60000}, Target: boss.String()})}}
	return e
}

func encodeDeaths(t *testing.T, id uuid.UUID, start time.Time, events ...*chronicleproto.Slain) []byte {
	t.Helper()
	var body []byte
	for _, event := range events {
		b, err := proto.Marshal(event)
		require.NoError(t, err)
		body = protowire.AppendBytes(body, b)
	}
	data := protowire.AppendString(nil, id.String())
	data = protowire.AppendVarint(data, uint64(start.UnixMilli()))
	data = protowire.AppendVarint(data, uint64(len(events)))
	data = protowire.AppendVarint(data, uint64(len(body)))
	data = append(data, body...)
	var b bytes.Buffer
	w := gzip.NewWriter(&b)
	_, err := w.Write(data)
	require.NoError(t, err)
	require.NoError(t, w.Close())
	return b.Bytes()
}

func TestRazorgoreFalseKillAndProvenNoop(t *testing.T) {
	t.Parallel()
	e := fixtureRazorgore(t)
	p, err := evaluateRazorgoreEvidence(e)
	require.NoError(t, err)
	require.False(t, p.RequiresReparse, p.Reason)
	require.Equal(t, database.KillTypeReset, p.Outcome)
	require.Len(t, p.Changes, 5)
	// Apply the expected source mutations, retaining original combat timing/events.
	e.Encounters[0].KillType = p.Outcome
	e.Phases[0].KillType = p.Outcome
	e.Hostiles[0] = *p.hostile
	e.Rankings = nil
	e.Speedruns = nil
	again, err := evaluateRazorgoreEvidence(e)
	require.NoError(t, err)
	require.False(t, again.RequiresReparse, again.Reason)
	require.Empty(t, again.Changes)
	require.NotEqual(t, p.EvidenceHash, again.EvidenceHash)
	// A superficially repaired phase is not sufficient for no-op.
	e.Encounters[0].RankingStartOffsetMs = pgtype.Int8{Int64: 10, Valid: true}
	again, err = evaluateRazorgoreEvidence(e)
	require.NoError(t, err)
	require.NotEmpty(t, again.Changes)
}

func TestRazorgorePlayerDeathMeansWipe(t *testing.T) {
	t.Parallel()
	e := fixtureRazorgore(t)
	e.Events[0].Events = encodeDeaths(t, e.Encounters[0].ID, e.Encounters[0].StartTime.Time,
		&chronicleproto.Slain{Meta: &chronicleproto.EventMeta{Index: 1, OffsetMilli: 1000}, Target: "0x0000000000000001"},
		&chronicleproto.Slain{Meta: &chronicleproto.EventMeta{Index: 12, OffsetMilli: 60000}, Target: e.Hostiles[0].ID.String()})
	p, err := evaluateRazorgoreEvidence(e)
	require.NoError(t, err)
	require.False(t, p.RequiresReparse, p.Reason)
	require.Equal(t, database.KillTypeWipe, p.Outcome)
}

func TestRazorgoreInsufficientEvidence(t *testing.T) {
	t.Parallel()
	cases := map[string]func(*razorgoreEvidence){
		"no phase":       func(e *razorgoreEvidence) { e.Phases = nil },
		"phase two":      func(e *razorgoreEvidence) { e.Phases[0].Key = "razorgore_p2" },
		"partial phase":  func(e *razorgoreEvidence) { e.Phases[0].EndOffsetMs-- },
		"missing stream": func(e *razorgoreEvidence) { e.Events = nil },
		"corrupt stream": func(e *razorgoreEvidence) { e.Events[0].Events = []byte("broken") },
		"missing boss death": func(e *razorgoreEvidence) {
			e.Events[0].Events = encodeDeaths(t, e.Encounters[0].ID, e.Encounters[0].StartTime.Time)
		},
		"another successful boss": func(e *razorgoreEvidence) {
			c := e.Encounters[0]
			c.ID = uuid.New()
			c.Name = "Vaelastrasz"
			e.Encounters = append(e.Encounters, c)
		},
		"multiple pulls": func(e *razorgoreEvidence) {
			c := e.Encounters[0]
			c.ID = uuid.New()
			e.Encounters = append(e.Encounters, c)
		},
		"missing activity": func(e *razorgoreEvidence) { e.Hostiles = nil },
		"timeout":          func(e *razorgoreEvidence) { e.Hostiles[0].Periods[0].EndState = database.EndStateTimeout },
		"aggregate source": func(e *razorgoreEvidence) {
			e.Rankings = append(e.Rankings, database.EncounterDpsRanking{EncounterName: "All Bosses"})
		},
		"authoritative encounter": func(e *razorgoreEvidence) { e.Instance.Capabilities = []string{"server-side"} },
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			e := fixtureRazorgore(t)
			mutate(&e)
			p, err := evaluateRazorgoreEvidence(e)
			require.NoError(t, err)
			require.True(t, p.RequiresReparse)
			require.NotEmpty(t, p.Reason)
			require.Empty(t, p.Changes)
		})
	}
}

func TestRazorgoreEvidenceHashCoversSources(t *testing.T) {
	t.Parallel()
	cases := map[string]func(*razorgoreEvidence){
		"identity": func(e *razorgoreEvidence) { e.Instance.ParserVersion = "new" },
		"events": func(e *razorgoreEvidence) {
			e.Events = append(e.Events, database.LogInstanceEvent{Type: database.LogInstanceEventTypeDamage, Events: []byte("changed")})
		},
		"ranking": func(e *razorgoreEvidence) { e.Rankings[0].DamageDone++ },
		"proof":   func(e *razorgoreEvidence) { e.Speedruns[0].Proof = []byte(`{}`) },
		"outcome": func(e *razorgoreEvidence) { e.Encounters[0].KillType = database.KillTypePartial },
		"window":  func(e *razorgoreEvidence) { e.Encounters[0].RankingEndOffsetMs = pgtype.Int8{Int64: 12, Valid: true} },
		"phase":   func(e *razorgoreEvidence) { e.Phases[0].KillType = database.KillTypePartial },
		"hostile": func(e *razorgoreEvidence) { e.Hostiles[0].Periods[0].End.Reason = "different" },
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			e := fixtureRazorgore(t)
			p, err := evaluateRazorgoreEvidence(e)
			require.NoError(t, err)
			mutate(&e)
			next, err := evaluateRazorgoreEvidence(e)
			require.NoError(t, err)
			require.NotEqual(t, p.EvidenceHash, next.EvidenceHash)
		})
	}
}

// Embedding Store makes unexpected database access fail loudly; all evaluator
// inputs and every write are explicitly implemented below.
type razorgoreStore struct {
	database.Store
	e      razorgoreEvidence
	writes []string
}

func (s *razorgoreStore) RazorgoreRepairInstance(context.Context, uuid.UUID) (database.LogInstance, error) {
	return s.e.Instance, nil
}
func (s *razorgoreStore) EncountersByInstanceID(context.Context, uuid.UUID) ([]database.LogInstanceEncounter, error) {
	return s.e.Encounters, nil
}
func (s *razorgoreStore) GetInstanceEncounterCharacterFights(context.Context, uuid.UUID) ([]database.LogInstanceEncounterHostile, error) {
	return s.e.Hostiles, nil
}
func (s *razorgoreStore) GetEncounterPhasesByInstanceID(context.Context, uuid.UUID) ([]database.LogInstanceEncounterPhase, error) {
	return s.e.Phases, nil
}
func (s *razorgoreStore) RazorgoreRepairEvents(context.Context, uuid.UUID) ([]database.LogInstanceEvent, error) {
	return s.e.Events, nil
}
func (s *razorgoreStore) RazorgoreRepairRankings(context.Context, uuid.UUID) ([]database.EncounterDpsRanking, error) {
	return s.e.Rankings, nil
}
func (s *razorgoreStore) RazorgoreRepairSpeedruns(context.Context, uuid.UUID) ([]database.InstanceSpeedrun, error) {
	return s.e.Speedruns, nil
}
func (s *razorgoreStore) RazorgoreRepairEncounter(_ context.Context, p database.RazorgoreRepairEncounterParams) error {
	s.writes = append(s.writes, "encounter")
	s.e.Encounters[0].KillType = p.KillType
	s.e.Encounters[0].RankingStartOffsetMs = pgtype.Int8{}
	s.e.Encounters[0].RankingEndOffsetMs = pgtype.Int8{}
	return nil
}
func (s *razorgoreStore) RazorgoreRepairHostile(_ context.Context, p database.RazorgoreRepairHostileParams) error {
	s.writes = append(s.writes, "hostile")
	s.e.Hostiles[0].Periods = p.Periods
	return nil
}
func (s *razorgoreStore) RazorgoreRepairPhase(_ context.Context, p database.RazorgoreRepairPhaseParams) error {
	s.writes = append(s.writes, "phase")
	s.e.Phases[0].KillType = p.KillType
	return nil
}
func (s *razorgoreStore) RazorgoreRepairDeleteRankings(context.Context, database.RazorgoreRepairDeleteRankingsParams) error {
	s.writes = append(s.writes, "rankings")
	s.e.Rankings = nil
	return nil
}
func (s *razorgoreStore) RazorgoreRepairDeleteSpeedrun(context.Context, uuid.UUID) error {
	s.writes = append(s.writes, "speedrun")
	s.e.Speedruns = nil
	return nil
}

func TestRazorgoreApplyRejectsDiagnosticPlan(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	s := &razorgoreStore{e: fixtureRazorgore(t)}
	p, err := EvaluateRazorgore(ctx, s, s.e.Instance.ID)
	require.NoError(t, err)
	data, err := json.Marshal(p)
	require.NoError(t, err)
	var diagnostic RazorgoreRepairPlan
	require.NoError(t, json.Unmarshal(data, &diagnostic))
	diagnostic.Outcome = database.KillTypeClean
	diagnostic.Changes = nil // never trusted
	require.ErrorContains(t, ApplyRazorgore(ctx, s, &diagnostic), "missing prepared")
	require.Empty(t, s.writes)
	require.NoError(t, RevalidateRazorgore(ctx, s, p))
	require.NoError(t, ApplyRazorgore(ctx, s, p))
	require.Len(t, s.writes, 5)
	require.Equal(t, database.KillTypeReset, s.e.Encounters[0].KillType)
	fresh, err := EvaluateRazorgore(ctx, s, s.e.Instance.ID)
	require.NoError(t, err)
	require.Empty(t, fresh.Changes)
	require.NoError(t, ApplyRazorgore(ctx, s, fresh))
	require.Len(t, s.writes, 5)
	require.ErrorIs(t, RevalidateRazorgore(ctx, s, p), ErrStaleEvidence)
	require.Len(t, s.writes, 5)
}

func TestRazorgoreApplyRejectsChangedEvidence(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	s := &razorgoreStore{e: fixtureRazorgore(t)}
	p, err := EvaluateRazorgore(ctx, s, s.e.Instance.ID)
	require.NoError(t, err)
	s.e.Rankings[0].DamageDone++
	require.ErrorIs(t, RevalidateRazorgore(ctx, s, p), ErrStaleEvidence)
	require.Empty(t, s.writes)
	require.Error(t, ApplyRazorgore(ctx, s, nil))
}

func TestRazorgoreSlainStreamValidation(t *testing.T) {
	t.Parallel()
	for _, name := range []string{"early boss death", "synthetic", "out of range", "duplicate index", "duplicate frame", "truncated gzip", "wrong origin", "missing target"} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			e := fixtureRazorgore(t)
			enc := e.Encounters[0]
			event := &chronicleproto.Slain{Meta: &chronicleproto.EventMeta{Index: 12, OffsetMilli: 60000}, Target: e.Hostiles[0].ID.String()}
			start := enc.StartTime.Time
			events := []*chronicleproto.Slain{event}
			switch name {
			case "early boss death":
				event.Meta.OffsetMilli--
			case "synthetic":
				event.Meta.IsSynthetic = true
			case "out of range":
				event.Meta.OffsetMilli++
			case "duplicate index":
				events = append(events, event)
			case "wrong origin":
				start = start.Add(time.Millisecond)
			case "missing target":
				event.Target = ""
			}
			data := encodeDeaths(t, enc.ID, start, events...)
			if name == "duplicate frame" {
				data = append(data, data...)
			}
			if name == "truncated gzip" {
				data = data[:len(data)-1]
			}
			e.Events[0].Events = data
			p, err := evaluateRazorgoreEvidence(e)
			require.NoError(t, err)
			require.True(t, p.RequiresReparse, p.Reason)
			require.Empty(t, p.Changes)
		})
	}
}

func TestRazorgoreApplyRejectsUnsupportedFreshPlan(t *testing.T) {
	t.Parallel()
	s := &razorgoreStore{e: fixtureRazorgore(t)}
	s.e.Phases = nil
	p, err := EvaluateRazorgore(context.Background(), s, s.e.Instance.ID)
	require.NoError(t, err)
	p.RequiresReparse = false // even public diagnostics are covered by the seal
	require.ErrorContains(t, ApplyRazorgore(context.Background(), s, p), "was modified")
	require.Empty(t, s.writes)
}

type missingRazorgoreStore struct{ database.Store }

func (*missingRazorgoreStore) RazorgoreRepairInstance(context.Context, uuid.UUID) (database.LogInstance, error) {
	return database.LogInstance{}, pgx.ErrNoRows
}
func TestRazorgoreDisappearedInstanceIsTerminalSkip(t *testing.T) {
	t.Parallel()
	id := uuid.MustParse("00000000-0000-0000-0000-000000000010")
	s := &missingRazorgoreStore{}
	p, err := EvaluateRazorgore(context.Background(), s, id)
	require.NoError(t, err)
	require.True(t, p.RequiresReparse)
	require.Equal(t, id, p.InstanceID)
	require.NotEmpty(t, p.EvidenceHash)
	require.Empty(t, p.Changes)
	require.Contains(t, p.Reason, "no longer exists")
	require.ErrorContains(t, ApplyRazorgore(context.Background(), s, p), "requires reparse")
}

func (s *razorgoreStore) GetWoWServerRealm(context.Context, uuid.UUID) (database.WowServerRealm, error) {
	return s.e.Realm, nil
}
func (s *razorgoreStore) GetWoWServer(context.Context, uuid.UUID) (database.WowServer, error) {
	return s.e.Server, nil
}

func TestRazorgoreTenantIdentity(t *testing.T) {
	t.Parallel()
	s := &razorgoreStore{e: fixtureRazorgore(t)}
	ctx := context.Background()
	p, err := EvaluateRazorgore(ctx, s, s.e.Instance.ID)
	require.NoError(t, err)
	require.False(t, p.RequiresReparse, p.Reason)
	require.Equal(t, s.e.Server.TenantID.UUID, p.TenantID)
	s.e.Server.TenantID.UUID = uuid.MustParse("00000000-0000-0000-0000-000000000023")
	moved, err := EvaluateRazorgore(ctx, s, s.e.Instance.ID)
	require.NoError(t, err)
	require.NotEqual(t, p.TenantID, moved.TenantID)
	require.NotEqual(t, p.EvidenceHash, moved.EvidenceHash)
	require.ErrorIs(t, RevalidateRazorgore(ctx, s, p), ErrStaleEvidence)
	require.Empty(t, s.writes)
	s.e.Server.TenantID = uuid.NullUUID{}
	missing, err := EvaluateRazorgore(ctx, s, s.e.Instance.ID)
	require.NoError(t, err)
	require.True(t, missing.RequiresReparse)
	require.Equal(t, uuid.Nil, missing.TenantID)
}

// This Store exposes mutations only. Any evidence read by Apply panics through
// the nil embedded Store, proving reconstruction cannot leak into the write phase.
type razorgoreWriteOnlyStore struct {
	database.Store
	target *razorgoreStore
}

func (s *razorgoreWriteOnlyStore) RazorgoreRepairEncounter(ctx context.Context, p database.RazorgoreRepairEncounterParams) error {
	return s.target.RazorgoreRepairEncounter(ctx, p)
}
func (s *razorgoreWriteOnlyStore) RazorgoreRepairHostile(ctx context.Context, p database.RazorgoreRepairHostileParams) error {
	return s.target.RazorgoreRepairHostile(ctx, p)
}
func (s *razorgoreWriteOnlyStore) RazorgoreRepairPhase(ctx context.Context, p database.RazorgoreRepairPhaseParams) error {
	return s.target.RazorgoreRepairPhase(ctx, p)
}
func (s *razorgoreWriteOnlyStore) RazorgoreRepairDeleteRankings(ctx context.Context, p database.RazorgoreRepairDeleteRankingsParams) error {
	return s.target.RazorgoreRepairDeleteRankings(ctx, p)
}
func (s *razorgoreWriteOnlyStore) RazorgoreRepairDeleteSpeedrun(ctx context.Context, id uuid.UUID) error {
	return s.target.RazorgoreRepairDeleteSpeedrun(ctx, id)
}
func (s *razorgoreWriteOnlyStore) RazorgoreRepairRankingWindow(ctx context.Context, p database.RazorgoreRepairRankingWindowParams) error {
	return s.target.RazorgoreRepairRankingWindow(ctx, p)
}
func (s *razorgoreWriteOnlyStore) RazorgoreRepairMetrics(ctx context.Context, p database.RazorgoreRepairMetricsParams) error {
	return s.target.RazorgoreRepairMetrics(ctx, p)
}

func TestRazorgoreApplyOnlyWritesPreparedPayload(t *testing.T) {
	t.Parallel()
	for _, numeric := range []bool{false, true} {
		t.Run(fmt.Sprint(numeric), func(t *testing.T) {
			t.Parallel()
			e := fixtureRazorgore(t)
			if numeric {
				e = fixtureRazorgoreNumeric(t)
			}
			s := &razorgoreStore{e: e}
			ctx := context.Background()
			p, err := EvaluateRazorgore(ctx, s, e.Instance.ID)
			require.NoError(t, err)
			require.False(t, p.RequiresReparse, p.Reason)
			require.NoError(t, RevalidateRazorgore(ctx, s, p))
			require.NoError(t, ApplyRazorgore(ctx, &razorgoreWriteOnlyStore{target: s}, p))
			require.NotEmpty(t, s.writes)
		})
	}
}

func TestRazorgorePreparedPayloadSeal(t *testing.T) {
	t.Parallel()
	for _, kind := range []string{"diagnostics", "hostile", "numeric"} {
		t.Run(kind, func(t *testing.T) {
			t.Parallel()
			e := fixtureRazorgore(t)
			if kind == "numeric" {
				e = fixtureRazorgoreNumeric(t)
			}
			s := &razorgoreStore{e: e}
			ctx := context.Background()
			p, err := EvaluateRazorgore(ctx, s, e.Instance.ID)
			require.NoError(t, err)
			switch kind {
			case "diagnostics":
				p.Changes = nil
			case "hostile":
				p.hostile.Periods[0].EndState = database.EndStateSlain
			case "numeric":
				p.numeric.Metrics[0].DamageDone++
			}
			require.ErrorContains(t, RevalidateRazorgore(ctx, s, p), "was modified")
			require.ErrorContains(t, ApplyRazorgore(ctx, s, p), "was modified")
			require.Empty(t, s.writes)
		})
	}
}

func TestRazorgoreRevalidateHashesOpaqueCompressedBytes(t *testing.T) {
	t.Parallel()
	s := &razorgoreStore{e: fixtureRazorgore(t)}
	s.e.Events[0].Events = []byte("not a gzip stream")
	// An integrity-only comparison must not require these bytes to be decodable.
	// Constructing this private seal is possible only inside this package's test.
	hash, err := razorgoreEvidenceHash(s.e)
	require.NoError(t, err)
	p := &RazorgoreRepairPlan{InstanceID: s.e.Instance.ID, EvidenceHash: hash}
	p.seal, err = razorgorePlanSeal(p)
	require.NoError(t, err)
	require.NoError(t, RevalidateRazorgore(context.Background(), s, p))
	s.e.Events[0].Events = append(s.e.Events[0].Events, '!')
	require.ErrorIs(t, RevalidateRazorgore(context.Background(), s, p), ErrStaleEvidence)
}

func TestRazorgoreEvidenceHashIgnoresDatabaseRowOrder(t *testing.T) {
	t.Parallel()
	e := fixtureRazorgoreNumeric(t)
	first, err := razorgoreEvidenceHash(e)
	require.NoError(t, err)
	slices.Reverse(e.Events)
	slices.Reverse(e.Phases)
	slices.Reverse(e.Rankings)
	second, err := razorgoreEvidenceHash(e)
	require.NoError(t, err)
	require.Equal(t, first, second)
}

func TestFalseKillBossMayActivateAfterAdds(t *testing.T) {
	t.Parallel()
	e := fixtureRazorgore(t)
	e.Hostiles[0].Periods[0].Start.Timestamp = e.Encounters[0].StartTime.Time.Add(8 * time.Second)
	p, err := evaluateRazorgoreEvidence(e)
	require.NoError(t, err)
	require.False(t, p.RequiresReparse, p.Reason)
	e.Hostiles[0].Periods[0].Start.Timestamp = e.Encounters[0].StartTime.Time.Add(-time.Second)
	p, err = evaluateRazorgoreEvidence(e)
	require.NoError(t, err)
	require.True(t, p.RequiresReparse)
}

func (s *razorgoreStore) ListInstanceEventRepairReceipts(context.Context, uuid.UUID) ([]database.EventRepairReceipt, error) {
	return s.e.Receipts, nil
}
