package serviceeventrepair

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/Emyrk/chronicle/api/chronicleproto"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

const lucifronTestPlayer = "0x0000000000000001"
const lucifronTestBoss = "0xF130002F56000001"
const lucifronTestProtector = "0xF130002F57000001"
const lucifronTestHound = "0xF130002D99000001"
const lucifronTestPet = "0xF140000001000001"

func lucifronDamage(index int32, caster, target string, amount int32) *chronicleproto.Damage {
	return &chronicleproto.Damage{Meta: &chronicleproto.EventMeta{Index: index, OffsetMilli: int64(index) * 1000}, Caster: &caster, Target: target, Amount: amount}
}
func fixtureLucifron(t *testing.T) razorgoreEvidence {
	t.Helper()
	e := fixtureRazorgore(t)
	e.Instance.Name = "Molten Core"
	e.Instance.ParserVersion = "v1.0.172"
	e.Encounters[0].Name = "Lucifron"
	e.Phases = nil
	e.Hostiles = nil
	e.Rankings[0].PlayerGuid = lucifronTestPlayer
	e.Rankings[0].PlayerName = "Warrior"
	e.Rankings[0].DurationSecs = 60
	e.Rankings[0].DamageDone = 100
	e.Rankings[0].UnrankedDamageDone = 100
	e.Rankings[0].Dps = 100.0 / 60
	absorb := uint32(20)
	boss := lucifronDamage(1, lucifronTestPlayer, lucifronTestBoss, 100)
	boss.Overkill = 20
	boss.Tailers = []*chronicleproto.Tailer{{Amount: &absorb, HitType: uint32(types.HitTypePartialAbsorb)}}
	e.Events = []database.LogInstanceEvent{{InstanceID: e.Instance.ID, Type: database.LogInstanceEventTypeDamage, Events: numericFrame(t, e,
		boss, lucifronDamage(2, lucifronTestPlayer, lucifronTestProtector, 70), lucifronDamage(3, lucifronTestPlayer, lucifronTestHound, 30))}}
	return e
}

func TestLucifronVersions(t *testing.T) {
	t.Parallel()
	for _, v := range []string{"v1.0.172", "1.0.172", "v1.0.99", "v0.99.999"} {
		require.True(t, lucifronVersionEligible(v), v)
	}
	for _, v := range []string{"", "unknown", "v1.0.173", "v1.0.174", "v1.1.0", "v2.0.0", "v1.0.173-rc.1", "v1.0.172-5-gabc", "v1.0.172-dirty", "v1.0.172+abc", "v1.0", " v1.0.172", "v1.00.172"} {
		require.False(t, lucifronVersionEligible(v), v)
	}
}

func TestLucifronEffectiveTargetsAndImmutability(t *testing.T) {
	t.Parallel()
	e := fixtureLucifron(t)
	other := e.Encounters[0]
	other.ID = uuid.New()
	other.Name = "Magmadar"
	e.Encounters = append(e.Encounters, other)
	row := e.Rankings[0]
	row.ID = uuid.New()
	row.EncounterID.UUID = other.ID
	row.DamageDone = 98765
	e.Rankings = append(e.Rankings, row)
	before, err := json.Marshal(e)
	require.NoError(t, err)
	p, err := evaluateLucifronEvidence(e)
	require.NoError(t, err)
	require.False(t, p.RequiresReparse, p.Reason)
	require.Equal(t, []uint32{12118, 12119}, p.Details["ranked_target_entries"])
	require.Empty(t, p.Details["omissions"])
	require.Len(t, p.lucifron.Metrics, 1)
	update := p.lucifron.Metrics[0]
	require.EqualValues(t, 170, update.DamageDone)
	require.EqualValues(t, 30, update.UnrankedDamageDone)
	require.Equal(t, 170.0/60, update.Dps)
	require.Equal(t, e.Encounters[0].ID, update.EncounterID)
	after, err := json.Marshal(e)
	require.NoError(t, err)
	require.JSONEq(t, string(before), string(after))
	details, err := json.Marshal(p.Details)
	require.NoError(t, err)
	require.Contains(t, string(details), `"omissions":[]`)
	require.Contains(t, string(details), `"before_ranked_damage":100`)
}

func TestLucifronStructuralSkips(t *testing.T) {
	t.Parallel()
	tests := map[string]func(*razorgoreEvidence){
		"modern":           func(e *razorgoreEvidence) { e.Instance.ParserVersion = "v1.0.173" },
		"missing stream":   func(e *razorgoreEvidence) { e.Events = nil },
		"corrupt gzip":     func(e *razorgoreEvidence) { e.Events[0].Events = []byte("invalid") },
		"duplicate stream": func(e *razorgoreEvidence) { e.Events = append(e.Events, e.Events[0]) },
		"wrong total":      func(e *razorgoreEvidence) { e.Rankings[0].DamageDone++ },
		"wrong duration":   func(e *razorgoreEvidence) { e.Rankings[0].DurationSecs = 30 },
		"missing row":      func(e *razorgoreEvidence) { e.Rankings = nil },
		"duplicate row":    func(e *razorgoreEvidence) { e.Rankings = append(e.Rankings, e.Rankings[0]) },
		"wrong encounter":  func(e *razorgoreEvidence) { e.Encounters[0].Boss = false },
		"receipt": func(e *razorgoreEvidence) {
			e.Receipts = []database.EventRepairReceipt{{Operation: "lucifron-ranked-damage"}}
		},
	}
	for name, change := range tests {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			e := fixtureLucifron(t)
			change(&e)
			p, err := evaluateLucifronEvidence(e)
			require.NoError(t, err)
			require.True(t, p.RequiresReparse, p.Reason)
			require.Nil(t, p.lucifron)
			require.Empty(t, p.Changes)
		})
	}
}

func TestLucifronMalformedEvents(t *testing.T) {
	t.Parallel()
	for _, kind := range []string{"negative", "bad guid", "synthetic", "missing meta", "duplicate index", "out of order", "outside window"} {
		t.Run(kind, func(t *testing.T) {
			t.Parallel()
			e := fixtureLucifron(t)
			a := lucifronDamage(1, lucifronTestPlayer, lucifronTestBoss, 100)
			b := lucifronDamage(2, lucifronTestPlayer, lucifronTestBoss, 100)
			switch kind {
			case "negative":
				a.Amount = -1
			case "bad guid":
				a.Target = "invalid"
			case "synthetic":
				a.Meta.IsSynthetic = true
			case "missing meta":
				a.Meta = nil
			case "duplicate index":
				b.Meta.Index = 1
			case "out of order":
				b.Meta.OffsetMilli = 0
			case "outside window":
				b.Meta.OffsetMilli = 60001
			}
			e.Events[0].Events = numericFrame(t, e, a, b)
			p, err := evaluateLucifronEvidence(e)
			require.NoError(t, err)
			require.True(t, p.RequiresReparse, p.Reason)
		})
	}
}

func TestLucifronPetOwnershipAndControl(t *testing.T) {
	t.Parallel()
	for _, kind := range []string{"terminal owner", "early owner", "unknown owner", "control"} {
		t.Run(kind, func(t *testing.T) {
			t.Parallel()
			e := fixtureLucifron(t)
			e.Events[0].Events = numericFrame(t, e, lucifronDamage(1, lucifronTestPet, lucifronTestBoss, 200))
			owner := lucifronTestPlayer
			pet, err := guid.FromString(lucifronTestPet)
			require.NoError(t, err)
			snapshot := &chronicleproto.UnitClassification{Meta: &chronicleproto.EventMeta{Index: 2, OffsetMilli: 60000}, Target: lucifronTestPet, UnitType: int32(unitdb.UnitTypeFromGUID(pet)), Owner: &owner}
			switch kind {
			case "early owner":
				snapshot.Meta.OffsetMilli = 59000
			case "unknown owner":
				snapshot.Owner = nil
			case "control":
				snapshot.Controller = &owner
			}
			e.Events = append(e.Events, database.LogInstanceEvent{InstanceID: e.Instance.ID, Type: database.LogInstanceEventTypeUnitClassification, Events: numericFrame(t, e, snapshot)})
			p, err := evaluateLucifronEvidence(e)
			require.NoError(t, err)
			if kind == "terminal owner" {
				require.False(t, p.RequiresReparse, p.Reason)
				require.EqualValues(t, 200, p.lucifron.Metrics[0].DamageDone)
			} else {
				require.True(t, p.RequiresReparse, p.Reason)
			}
		})
	}
}

func TestLucifronOmissions(t *testing.T) {
	t.Parallel()
	e := fixtureLucifron(t)
	e.Rankings[0].DamageDone = 0
	e.Rankings[0].UnrankedDamageDone = 0
	e.Rankings[0].Dps = 0
	e.Events[0].Events = numericFrame(t, e, lucifronDamage(1, lucifronTestPet, lucifronTestBoss, 100), lucifronDamage(2, lucifronTestPet, lucifronTestBoss, 50))
	p, err := evaluateLucifronEvidence(e)
	require.NoError(t, err)
	require.False(t, p.RequiresReparse, p.Reason)
	omissions := p.Details["omissions"].([]razorgoreOmission)
	require.Len(t, omissions, 1)
	require.EqualValues(t, 150, omissions[0].Amount)
	require.Equal(t, 2, omissions[0].Count)
	require.NotEmpty(t, p.Warnings)
	// Equality is insufficient when unattributed pet credit could offset excluded
	// direct-player damage. Never silently bless that coincidental equality.
	e.Rankings[0].DamageDone = 200
	e.Events[0].Events = numericFrame(t, e, lucifronDamage(1, lucifronTestPet, lucifronTestBoss, 50), lucifronDamage(2, lucifronTestPlayer, lucifronTestBoss, 200))
	p, err = evaluateLucifronEvidence(e)
	require.NoError(t, err)
	require.True(t, p.RequiresReparse)
	require.Contains(t, p.Reason, "upper-bound")
}

type lucifronStore struct {
	*razorgoreStore
	affected int64
	updates  []database.LucifronRepairRankingParams
}

func (s *lucifronStore) LucifronRepairRanking(_ context.Context, p database.LucifronRepairRankingParams) (int64, error) {
	s.updates = append(s.updates, p)
	return s.affected, nil
}
func TestLucifronPreparedLifecycle(t *testing.T) {
	t.Parallel()
	s := &lucifronStore{razorgoreStore: &razorgoreStore{e: fixtureLucifron(t)}, affected: 1}
	ctx := context.Background()
	p, err := EvaluateLucifron(ctx, s, s.e.Instance.ID)
	require.NoError(t, err)
	require.False(t, p.RequiresReparse, p.Reason)
	require.NoError(t, RevalidateLucifron(ctx, s, p))
	require.NoError(t, ApplyLucifron(ctx, s, p))
	require.Len(t, s.updates, 1)
	p.lucifron.Metrics[0].DamageDone++
	require.Error(t, ApplyLucifron(ctx, s, p))
	require.Len(t, s.updates, 1)
	p, err = EvaluateLucifron(ctx, s, s.e.Instance.ID)
	require.NoError(t, err)
	s.e.Instance.ParserVersion = "v1.0.173"
	require.ErrorIs(t, RevalidateLucifron(ctx, s, p), ErrStaleEvidence)
	s.affected = 0
	require.ErrorIs(t, ApplyLucifron(ctx, s, p), ErrStaleEvidence)
	data, err := json.Marshal(p)
	require.NoError(t, err)
	var decoded RepairPlan
	require.NoError(t, json.Unmarshal(data, &decoded))
	require.Error(t, ApplyLucifron(ctx, s, &decoded))
}

func TestLucifronFullyAbsorbedAndOverkillDamage(t *testing.T) {
	t.Parallel()
	e := fixtureLucifron(t)
	absorbed := uint32(40)
	a := lucifronDamage(1, lucifronTestPlayer, lucifronTestProtector, 0)
	a.Tailers = []*chronicleproto.Tailer{{Amount: &absorbed, HitType: uint32(types.HitTypeFullAbsorb)}}
	b := lucifronDamage(2, lucifronTestPlayer, lucifronTestBoss, 10)
	b.Overkill = 20
	e.Events[0].Events = numericFrame(t, e, a, b)
	e.Rankings[0].DamageDone = 0
	e.Rankings[0].UnrankedDamageDone = 40
	p, err := evaluateLucifronEvidence(e)
	require.NoError(t, err)
	require.False(t, p.RequiresReparse, p.Reason)
	require.EqualValues(t, 40, p.lucifron.Metrics[0].DamageDone)
	require.Zero(t, p.lucifron.Metrics[0].UnrankedDamageDone)
}

func TestLucifronOrdinaryNPCIsNotMissingOwner(t *testing.T) {
	t.Parallel()
	e := fixtureLucifron(t)
	e.Events[0].Events = numericFrame(t, e, lucifronDamage(1, lucifronTestPlayer, lucifronTestBoss, 200), lucifronDamage(2, lucifronTestHound, lucifronTestPet, 50))
	npc, err := guid.FromString(lucifronTestHound)
	require.NoError(t, err)
	snapshot := &chronicleproto.UnitClassification{Meta: &chronicleproto.EventMeta{Index: 3, OffsetMilli: 60000}, Target: lucifronTestHound, UnitType: int32(unitdb.UnitTypeFromGUID(npc))}
	e.Events = append(e.Events, database.LogInstanceEvent{InstanceID: e.Instance.ID, Type: database.LogInstanceEventTypeUnitClassification, Events: numericFrame(t, e, snapshot)})
	p, err := evaluateLucifronEvidence(e)
	require.NoError(t, err)
	require.False(t, p.RequiresReparse, p.Reason)
	require.Empty(t, p.Details["omissions"])
	require.EqualValues(t, 200, p.lucifron.Metrics[0].DamageDone)
}

func TestLucifronProvenOwnerlessOmissionPreservesPlayerTotal(t *testing.T) {
	t.Parallel()
	e := fixtureLucifron(t)
	e.Events[0].Events = numericFrame(t, e, lucifronDamage(1, lucifronTestPlayer, lucifronTestBoss, 200), lucifronDamage(2, lucifronTestPet, lucifronTestBoss, 50))
	pet, err := guid.FromString(lucifronTestPet)
	require.NoError(t, err)
	snapshot := &chronicleproto.UnitClassification{Meta: &chronicleproto.EventMeta{Index: 3, OffsetMilli: 60000}, Target: lucifronTestPet, UnitType: int32(unitdb.UnitTypeFromGUID(pet))}
	e.Events = append(e.Events, database.LogInstanceEvent{InstanceID: e.Instance.ID, Type: database.LogInstanceEventTypeUnitClassification, Events: numericFrame(t, e, snapshot)})
	p, err := evaluateLucifronEvidence(e)
	require.NoError(t, err)
	require.False(t, p.RequiresReparse, p.Reason)
	omissions := p.Details["omissions"].([]razorgoreOmission)
	require.Len(t, omissions, 1)
	require.EqualValues(t, 50, omissions[0].Amount)
	require.Contains(t, omissions[0].Reason, "excluded from player rollup")
	update := p.lucifron.Metrics[0]
	require.EqualValues(t, 200, update.DamageDone+update.UnrankedDamageDone)
	require.EqualValues(t, 200, update.DamageDone)
}

func TestLucifronRejectsWrongScriptPreparedPlan(t *testing.T) {
	t.Parallel()
	s := &lucifronStore{razorgoreStore: &razorgoreStore{e: fixtureLucifron(t)}, affected: 1}
	ctx := context.Background()
	p, err := EvaluateLucifron(ctx, s, s.e.Instance.ID)
	require.NoError(t, err)
	require.Equal(t, OperationLucifron, p.operation)
	// Even a correctly sealed payload is unusable by the wrong script.
	p.operation = OperationRazorgore
	p.seal, err = razorgorePlanSeal(p)
	require.NoError(t, err)
	require.Error(t, RevalidateLucifron(ctx, s, p))
	require.Error(t, ApplyLucifron(ctx, s, p))
	require.Empty(t, s.updates)
	// Changing the private operation after sealing also invalidates the seal.
	p.operation = OperationLucifron
	require.Error(t, ApplyLucifron(ctx, s, p))
	require.Empty(t, s.updates)
}

func TestRepairApplyRejectsOtherScriptsSealedPlan(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	lucifron := &lucifronStore{razorgoreStore: &razorgoreStore{e: fixtureLucifron(t)}, affected: 1}
	lucifronPlan, err := EvaluateLucifron(ctx, lucifron, lucifron.e.Instance.ID)
	require.NoError(t, err)
	require.NoError(t, validateRazorgorePlan(lucifronPlan))
	require.Error(t, ApplyRazorgore(ctx, lucifron, lucifronPlan))
	require.Empty(t, lucifron.updates)
	razorgore := &razorgoreStore{e: fixtureRazorgoreNumeric(t)}
	razorgorePlan, err := EvaluateRazorgore(ctx, razorgore, razorgore.e.Instance.ID)
	require.NoError(t, err)
	require.False(t, razorgorePlan.RequiresReparse, razorgorePlan.Reason)
	require.NoError(t, validateRazorgorePlan(razorgorePlan))
	require.Error(t, ApplyLucifron(ctx, lucifron, razorgorePlan))
	require.Empty(t, lucifron.updates)
}
