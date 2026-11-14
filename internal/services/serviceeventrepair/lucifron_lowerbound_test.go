package serviceeventrepair

import (
	"encoding/json"
	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
	"math"
	"testing"
)

func fixtureLucifronLowerBound(t *testing.T) razorgoreEvidence {
	t.Helper()
	e := fixtureLucifron(t)
	// Same timestamp: event index, not wall time, decides when ownership is known.
	before := lucifronDamage(1, lucifronTestPet, lucifronTestBoss, 50)
	after := lucifronDamage(3, lucifronTestPet, lucifronTestBoss, 120)
	unranked := lucifronDamage(4, lucifronTestPet, lucifronTestHound, 30)
	before.Meta.OffsetMilli = 1000
	after.Meta.OffsetMilli = 1000
	unranked.Meta.OffsetMilli = 1000
	e.Events[0].Events = numericFrame(t, e, before, after, unranked)
	owner := lucifronTestPlayer
	e.Events = append(e.Events, database.LogInstanceEvent{InstanceID: e.Instance.ID, Type: database.LogInstanceEventTypeUnitClassification, Events: numericFrame(t, e, lucifronOwnerSnapshot(t, lucifronTestPet, &owner, 2, 1000))})
	return e
}

func TestLucifronLowerBoundOrderingAndReconciliation(t *testing.T) {
	t.Parallel()
	e := fixtureLucifronLowerBound(t)
	original, err := json.Marshal(e)
	require.NoError(t, err)
	p, err := EvaluateLucifron(t.Context(), &razorgoreStore{e: e}, e.Instance.ID)
	require.NoError(t, err)
	require.False(t, p.RequiresReparse, p.Reason)
	change := p.Details["players"].([]lucifronPlayerChange)[0]
	require.EqualValues(t, 120, change.AfterRankedDamage)
	require.EqualValues(t, 30, change.AfterUnrankedDamage)
	require.Equal(t, 2.0, change.AfterDPS)
	require.Equal(t, []lucifronReconciliation{{e.Encounters[0].ID, lucifronTestPlayer, e.Rankings[0].PlayerName, 200, 150, 50}}, p.Details["reconciliation"])
	omissions := p.Details["omissions"].([]razorgoreOmission)
	require.Len(t, omissions, 1)
	require.EqualValues(t, 50, omissions[0].Amount)
	require.Equal(t, 1, omissions[0].Count)
	require.Contains(t, omissions[0].Reason, "precedes first recorded owner")
	after, err := json.Marshal(e)
	require.NoError(t, err)
	require.Equal(t, original, after)
	require.Contains(t, p.Warnings[len(p.Warnings)-1], "not additive")
	require.NoError(t, RevalidateLucifron(t.Context(), &razorgoreStore{e: e}, p))
	// A valid unexplained gap without any missing source is still reported, not fabricated as unranked.
	e.Events[0].Events = numericFrame(t, e, lucifronDamage(3, lucifronTestPlayer, lucifronTestBoss, 120))
	p, err = evaluateLucifronEvidence(e)
	require.NoError(t, err)
	require.False(t, p.RequiresReparse, p.Reason)
	require.Empty(t, p.Details["omissions"])
	require.EqualValues(t, 80, p.Details["reconciliation"].([]lucifronReconciliation)[0].UnexplainedDamage)
	require.Zero(t, p.Details["players"].([]lucifronPlayerChange)[0].AfterUnrankedDamage)
	e.Rankings[0].DamageDone = 119
	p, err = evaluateLucifronEvidence(e)
	require.NoError(t, err)
	require.True(t, p.RequiresReparse)
	require.Contains(t, p.Reason, "exceeds")
}

func TestLucifronLowerBoundReceiptAndSeals(t *testing.T) {
	t.Parallel()
	assertLucifronWarningsPersist(t, fixtureLucifronLowerBound(t), []string{"Stable recorded-owner inference", "Omitted damage", "Conservative lower bound"}, 1)
	for _, field := range []string{"reconciliation", "omissions", "warnings"} {
		t.Run(field, func(t *testing.T) {
			t.Parallel()
			e := fixtureLucifronLowerBound(t)
			store := &lucifronStore{razorgoreStore: &razorgoreStore{e: e}, affected: 1}
			p, err := EvaluateLucifron(t.Context(), store, e.Instance.ID)
			require.NoError(t, err)
			if field == "warnings" {
				p.Warnings = nil
			} else {
				delete(p.Details, field)
			}
			require.ErrorContains(t, ApplyLucifron(t.Context(), store, p), "modified")
			require.Empty(t, store.updates)
		})
	}
}

func TestLucifronLowerBoundRejectsInvalidSourceNumbers(t *testing.T) {
	t.Parallel()
	for _, kind := range []string{"negative ranked", "negative unranked", "overflow", "nan dps", "infinite dps"} {
		t.Run(kind, func(t *testing.T) {
			t.Parallel()
			e := fixtureLucifronLowerBound(t)
			switch kind {
			case "negative ranked":
				e.Rankings[0].DamageDone = -1
			case "negative unranked":
				e.Rankings[0].UnrankedDamageDone = -1
			case "overflow":
				e.Rankings[0].DamageDone = math.MaxInt64
				e.Rankings[0].UnrankedDamageDone = 1
			case "nan dps":
				e.Rankings[0].Dps = math.NaN()
			case "infinite dps":
				e.Rankings[0].Dps = math.Inf(1)
			}
			p, err := evaluateLucifronEvidence(e)
			// Non-finite evidence cannot even be hashed into an executable plan.
			if err == nil {
				require.True(t, p.RequiresReparse, p.Reason)
				require.Nil(t, p.lucifron)
			}
		})
	}
}
