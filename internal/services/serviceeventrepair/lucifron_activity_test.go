package serviceeventrepair

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

type lucifronActivityStore struct {
	*razorgoreStore
	eventFetches int
}

func (s *lucifronActivityStore) RazorgoreRepairEvents(ctx context.Context, id uuid.UUID) ([]database.LogInstanceEvent, error) {
	s.eventFetches++
	return s.razorgoreStore.RazorgoreRepairEvents(ctx, id)
}
func fixtureLucifronActivity(t *testing.T) razorgoreEvidence {
	t.Helper()
	e := fixtureLucifron(t)
	c := e.Encounters[0]
	for _, id := range []string{lucifronTestBoss, lucifronTestProtector, "0xF130002F57000002"} {
		unit, err := guid.FromString(id)
		require.NoError(t, err)
		e.Hostiles = append(e.Hostiles, database.LogInstanceEncounterHostile{EncounterID: c.ID, ID: unit, Periods: database.Periods{{Start: &database.PeriodMoment{Timestamp: c.StartTime.Time}, End: &database.PeriodMoment{Timestamp: c.EndTime.Time}}}})
	}
	return e
}
func TestLucifronActivityMetadataSkipsWithoutStreams(t *testing.T) {
	t.Parallel()
	e := fixtureLucifronActivity(t)
	before, err := json.Marshal(e)
	require.NoError(t, err)
	store := &lucifronActivityStore{razorgoreStore: &razorgoreStore{e: e}}
	p, err := EvaluateLucifron(context.Background(), store, e.Instance.ID)
	require.NoError(t, err)
	require.True(t, p.RequiresReparse)
	require.Equal(t, lucifronActivitySkipReason, p.Reason)
	require.Zero(t, store.eventFetches)
	require.NoError(t, RevalidateLucifron(context.Background(), store, p))
	require.Zero(t, store.eventFetches, "metadata skip revalidation must not fetch blobs either")
	require.Error(t, ApplyLucifron(context.Background(), store, p))
	require.Empty(t, store.writes)
	after, err := json.Marshal(store.e)
	require.NoError(t, err)
	require.JSONEq(t, string(before), string(after))
	// The original fixture has incidental hound damage. This deliberately exercises
	// the approved possible false negative: activity is not damage correctness proof.
	store.e.Hostiles = nil
	require.ErrorIs(t, RevalidateLucifron(context.Background(), store, p), ErrStaleEvidence)
}
func TestLucifronActivityFallbackFetchesStreams(t *testing.T) {
	t.Parallel()
	for name, change := range map[string]func(*razorgoreEvidence){
		"missing":            func(e *razorgoreEvidence) { e.Hostiles = nil },
		"empty activity":     func(e *razorgoreEvidence) { e.Hostiles[0].Periods = nil },
		"missing period end": func(e *razorgoreEvidence) { e.Hostiles[0].Periods[0].End = nil },
		"duplicate guid":     func(e *razorgoreEvidence) { e.Hostiles[2].ID = e.Hostiles[1].ID },
		"one protector":      func(e *razorgoreEvidence) { e.Hostiles = e.Hostiles[:2] },
		"additional hostile": func(e *razorgoreEvidence) {
			h := e.Hostiles[0]
			h.ID = guid.GUID(0xF130002D99000001)
			e.Hostiles = append(e.Hostiles, h)
		},
		"ambiguous period": func(e *razorgoreEvidence) {
			e.Hostiles[0].Periods[0].End.Timestamp = e.Hostiles[0].Periods[0].Start.Timestamp
		},
		"duplicate encounter":               func(e *razorgoreEvidence) { e.Encounters = append(e.Encounters, e.Encounters[0]) },
		"missing rankings":                  func(e *razorgoreEvidence) { e.Rankings = nil },
		"second encounter missing activity": func(e *razorgoreEvidence) { appendLucifronActivityEncounter(e, false) },
		"second encounter additional hostile": func(e *razorgoreEvidence) {
			appendLucifronActivityEncounter(e, true)
			h := e.Hostiles[len(e.Hostiles)-1]
			h.ID = guid.GUID(0xF130002D99000001)
			e.Hostiles = append(e.Hostiles, h)
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			e := fixtureLucifronActivity(t)
			change(&e)
			store := &lucifronActivityStore{razorgoreStore: &razorgoreStore{e: e}}
			p, err := EvaluateLucifron(context.Background(), store, e.Instance.ID)
			require.NoError(t, err)
			require.Equal(t, 1, store.eventFetches)
			require.NotEqual(t, lucifronActivitySkipReason, p.Reason)
		})
	}
}
func appendLucifronActivityEncounter(e *razorgoreEvidence, withActivity bool) {
	c := e.Encounters[0]
	c.ID = uuid.New()
	e.Encounters = append(e.Encounters, c)
	row := e.Rankings[0]
	row.ID = uuid.New()
	row.EncounterID.UUID = c.ID
	e.Rankings = append(e.Rankings, row)
	if withActivity {
		for _, h := range e.Hostiles[:3] {
			h.EncounterID = c.ID
			e.Hostiles = append(e.Hostiles, h)
		}
	}
}
func TestLucifronActivityChecksEveryRankedEncounter(t *testing.T) {
	t.Parallel()
	e := fixtureLucifronActivity(t)
	appendLucifronActivityEncounter(&e, true)
	store := &lucifronActivityStore{razorgoreStore: &razorgoreStore{e: e}}
	p, err := EvaluateLucifron(context.Background(), store, e.Instance.ID)
	require.NoError(t, err)
	require.Equal(t, lucifronActivitySkipReason, p.Reason)
	require.Zero(t, store.eventFetches)
}
func TestLucifronActivityPreservesEarlierGuards(t *testing.T) {
	t.Parallel()
	for _, guard := range []string{"version", "receipt", "identity"} {
		t.Run(guard, func(t *testing.T) {
			t.Parallel()
			e := fixtureLucifronActivity(t)
			switch guard {
			case "version":
				e.Instance.ParserVersion = "v1.0.173"
			case "receipt":
				e.Receipts = []database.EventRepairReceipt{{Operation: OperationLucifron}}
			case "identity":
				e.Instance.Name = "Blackwing Lair"
			}
			store := &lucifronActivityStore{razorgoreStore: &razorgoreStore{e: e}}
			p, err := EvaluateLucifron(context.Background(), store, e.Instance.ID)
			require.NoError(t, err)
			require.True(t, p.RequiresReparse)
			require.NotEqual(t, lucifronActivitySkipReason, p.Reason)
		})
	}
}
func TestLucifronActivitySkipCompletesLifecycle(t *testing.T) {
	t.Parallel()
	f := lucifronLifecycleFixture(t, 1)
	instance := receiptInstance(t, f)
	e := fixtureLucifronActivity(t)
	e.Instance.ID = instance
	e.Server.TenantID.UUID = f.tenant
	for i := range e.Encounters {
		e.Encounters[i].InstanceID = instance
	}
	for i := range e.Rankings {
		e.Rankings[i].InstanceID = instance
	}
	store := &lucifronActivityStore{razorgoreStore: &razorgoreStore{e: e}}
	job := f.service.jobs[OperationLucifron]
	job.evaluate = func(ctx context.Context, _ database.Store, id uuid.UUID) (*RepairPlan, error) {
		return EvaluateLucifron(ctx, store, id)
	}
	job.revalidate = func(ctx context.Context, _ database.Store, p *RepairPlan) error {
		return RevalidateLucifron(ctx, store, p)
	}
	_, err := f.service.ProcessPage(f.ctx, f.id, "dry_running")
	require.NoError(t, err)
	report, err := f.service.Get(f.ctx, f.id)
	require.NoError(t, err)
	require.Equal(t, "completed", report.State)
	require.Equal(t, "skipped", report.Items[0].State)
	require.Equal(t, lucifronActivitySkipReason, report.Items[0].Reason)
	require.Zero(t, store.eventFetches)
	require.Zero(t, f.canonicalJobs(t))
	require.Empty(t, store.writes)
	receipts, err := f.db.ListInstanceEventRepairReceipts(f.ctx, instance)
	require.NoError(t, err)
	require.Empty(t, receipts)
}

func TestLucifronActivityShortcutAndControlReplayTogether(t *testing.T) {
	t.Parallel()
	for _, extraHostile := range []bool{false, true} {
		t.Run(map[bool]string{false: "activity-only skip", true: "control replay fallback"}[extraHostile], func(t *testing.T) {
			t.Parallel()
			e, _, _ := lucifronControlFixture(t)
			e.Instance.LogGroupID = uuid.New()
			e.Hostiles = fixtureLucifronActivity(t).Hostiles
			if extraHostile {
				h := e.Hostiles[0]
				h.ID = guid.GUID(0xF130002D99000001)
				e.Hostiles = append(e.Hostiles, h)
			}
			store := &lucifronActivityStore{razorgoreStore: &razorgoreStore{e: e}}
			p, err := EvaluateLucifron(context.Background(), store, e.Instance.ID)
			require.NoError(t, err)
			require.NoError(t, RevalidateLucifron(context.Background(), store, p))
			if !extraHostile {
				require.True(t, p.RequiresReparse)
				require.Equal(t, lucifronActivitySkipReason, p.Reason)
				require.Zero(t, store.eventFetches)
			} else {
				require.False(t, p.RequiresReparse, p.Reason)
				require.Equal(t, 2, store.eventFetches, "evaluation and revalidation fetch normal evidence")
				require.Len(t, p.lucifron.Metrics, 1)
				require.EqualValues(t, 100, p.lucifron.Metrics[0].DamageDone)
				require.EqualValues(t, 100, p.lucifron.Metrics[0].UnrankedDamageDone)
			}
		})
	}
}
