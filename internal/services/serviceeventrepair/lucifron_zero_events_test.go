package serviceeventrepair

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/Emyrk/chronicle/api/chronicleproto"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
)

const lucifronZeroGUID = "0x0000000000000000"

func fixtureLucifronZeroEvents(t *testing.T) razorgoreEvidence {
	t.Helper()
	e := fixtureLucifron(t)
	e.Events[0].Events = numericFrame(t, e, lucifronDamage(1, lucifronTestPlayer, lucifronTestBoss, 200), lucifronDamage(2, lucifronTestPlayer, lucifronZeroGUID, 0))
	e.Events = append(e.Events, database.LogInstanceEvent{InstanceID: e.Instance.ID, Type: database.LogInstanceEventTypeUnitClassification, Events: numericFrame(t, e,
		&chronicleproto.UnitClassification{Meta: &chronicleproto.EventMeta{Index: 0, OffsetMilli: 0}, Target: lucifronZeroGUID, UnitType: int32(unitdb.UnitTypePlayer)},
		&chronicleproto.UnitClassification{Meta: &chronicleproto.EventMeta{Index: 3, OffsetMilli: 60000}, Target: lucifronZeroGUID, UnitType: int32(unitdb.UnitTypePlayer)})})
	return e
}

func TestLucifronZeroInvalidEventsWarnAndPreserveSource(t *testing.T) {
	t.Parallel()
	e := fixtureLucifronZeroEvents(t)
	original, err := json.Marshal(e)
	require.NoError(t, err)
	store := &lucifronStore{razorgoreStore: &razorgoreStore{e: e}, affected: 1}
	p, err := EvaluateLucifron(context.Background(), store, e.Instance.ID)
	require.NoError(t, err)
	require.False(t, p.RequiresReparse, p.Reason)
	require.Len(t, p.Warnings, 2)
	require.Contains(t, p.Warnings[0], "Skipped 1 invalid-GUID damage records with zero effective damage")
	require.Contains(t, p.Warnings[1], "Skipped 2 harmless zero-entity classification records")
	require.Empty(t, p.Details["omissions"])
	require.NoError(t, RevalidateLucifron(context.Background(), store, p))
	after, err := json.Marshal(e)
	require.NoError(t, err)
	require.Equal(t, original, after)
	p.Warnings = nil
	require.ErrorContains(t, ApplyLucifron(context.Background(), store, p), "modified")
	require.Empty(t, store.updates)
}

func TestLucifronInvalidGUIDUsesEffectiveDamage(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		name             string
		amount, overkill int32
		hit              types.HitType
		trailer          bool
		eligible         bool
	}{
		{name: "zero", eligible: true},
		{name: "overkill removes raw damage", amount: 20, overkill: 20, eligible: true},
		{name: "resisted zero", hit: types.HitTypeFullResist, trailer: true, eligible: true},
		{name: "blocked zero", hit: types.HitTypeFullBlock, trailer: true, eligible: true},
		{name: "positive health damage", amount: 1},
		{name: "fully absorbed", hit: types.HitTypeFullAbsorb, trailer: true},
		{name: "partial absorb after overkill", amount: 20, overkill: 20, hit: types.HitTypePartialAbsorb, trailer: true},
		{name: "resisted trailer cannot erase health damage", amount: 1, hit: types.HitTypeFullResist, trailer: true},
		{name: "negative amount", amount: -1},
		{name: "negative overkill", overkill: -1},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			e := fixtureLucifron(t)
			invalid := lucifronDamage(2, lucifronTestPlayer, lucifronZeroGUID, tc.amount)
			invalid.Overkill = tc.overkill
			if tc.trailer {
				amount := uint32(20)
				invalid.Tailers = []*chronicleproto.Tailer{{Amount: &amount, HitType: uint32(tc.hit)}}
			}
			e.Events[0].Events = numericFrame(t, e, lucifronDamage(1, lucifronTestPlayer, lucifronTestBoss, 200), invalid)
			p, err := evaluateLucifronEvidence(e)
			require.NoError(t, err)
			require.Equal(t, !tc.eligible, p.RequiresReparse, p.Reason)
			if tc.eligible {
				require.Len(t, p.Warnings, 1)
			} else {
				require.Empty(t, p.Changes)
			}
		})
	}
}

func TestLucifronSentinelAndStructuralErrorsRemainStrict(t *testing.T) {
	t.Parallel()
	for _, kind := range []string{"owned", "controlled", "spell", "affiliation", "wrong type", "malformed classification", "duplicate cross-stream index", "backwards dropped timestamp", "malformed stream", "invalid caster positive", "invalid caster zero"} {
		t.Run(kind, func(t *testing.T) {
			t.Parallel()
			e := fixtureLucifron(t)
			sentinel := &chronicleproto.UnitClassification{Meta: &chronicleproto.EventMeta{Index: 0}, Target: lucifronZeroGUID, UnitType: int32(unitdb.UnitTypePlayer)}
			invalid := lucifronDamage(2, lucifronTestPlayer, lucifronZeroGUID, 0)
			owner := lucifronTestPlayer
			switch kind {
			case "owned":
				sentinel.Owner = &owner
			case "controlled":
				sentinel.Controller = &owner
			case "spell":
				sentinel.SpellId = 20604
			case "affiliation":
				sentinel.Affiliation = int32(unitdb.AffiliationFriendly)
			case "wrong type":
				sentinel.UnitType = int32(unitdb.UnitTypeCreature)
			case "malformed classification":
				sentinel.Target = "bad-guid"
			case "duplicate cross-stream index":
				sentinel.Meta.Index = 1
				sentinel.Meta.OffsetMilli = 1000
			case "backwards dropped timestamp":
				invalid.Meta.OffsetMilli = 500
			case "malformed stream": // Corrupt framing below, never tolerated as a zero record.
			case "invalid caster positive":
				bad := "bad-guid"
				invalid.Caster = &bad
				invalid.Target = lucifronTestBoss
				invalid.Amount = 1
			case "invalid caster zero":
				bad := "bad-guid"
				invalid.Caster = &bad
				invalid.Target = lucifronTestBoss
			}
			e.Events[0].Events = numericFrame(t, e, lucifronDamage(1, lucifronTestPlayer, lucifronTestBoss, 200), invalid)
			e.Events = append(e.Events, database.LogInstanceEvent{InstanceID: e.Instance.ID, Type: database.LogInstanceEventTypeUnitClassification, Events: numericFrame(t, e, sentinel)})
			if kind == "malformed stream" {
				e.Events[0].Events = []byte("corrupt")
			}
			p, err := evaluateLucifronEvidence(e)
			require.NoError(t, err)
			if kind == "invalid caster zero" {
				require.False(t, p.RequiresReparse, p.Reason)
			} else {
				require.True(t, p.RequiresReparse, p.Reason)
				require.Empty(t, p.Changes)
			}
		})
	}
}
