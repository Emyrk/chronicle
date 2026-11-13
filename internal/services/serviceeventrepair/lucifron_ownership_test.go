package serviceeventrepair

import (
	"testing"

	"github.com/Emyrk/chronicle/api/chronicleproto"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/proto"
)

func lucifronOwnerSnapshot(t *testing.T, source string, owner *string, index int32, ms int64) *chronicleproto.UnitClassification {
	t.Helper()
	g, err := guid.FromString(source)
	require.NoError(t, err)
	return &chronicleproto.UnitClassification{Meta: &chronicleproto.EventMeta{Index: index, OffsetMilli: ms}, Target: source, Owner: owner, UnitType: int32(unitdb.UnitTypeFromGUID(g)), Affiliation: int32(unitdb.AffiliationFriendly)}
}
func lucifronOwnershipFixture(t *testing.T, source string) (razorgoreEvidence, []proto.Message) {
	t.Helper()
	e := fixtureLucifron(t)
	e.Events[0].Events = numericFrame(t, e, lucifronDamage(2, source, lucifronTestBoss, 120), lucifronDamage(3, source, lucifronTestHound, 80))
	owner := lucifronTestPlayer
	snapshots := []proto.Message{lucifronOwnerSnapshot(t, source, &owner, 1, 1000)}
	e.Events = append(e.Events, database.LogInstanceEvent{InstanceID: e.Instance.ID, Type: database.LogInstanceEventTypeUnitClassification, Events: numericFrame(t, e, snapshots...)})
	return e, snapshots
}

// fixtureLucifronStableOwner supplies real stored frames for lifecycle tests,
// with one stable pre-damage owner observation and no terminal ownership proof.
func fixtureLucifronStableOwner(t *testing.T) razorgoreEvidence {
	t.Helper()
	e, _ := lucifronOwnershipFixture(t, lucifronTestPet)
	return e
}

func TestLucifronStableOwnerLifecycleFixture(t *testing.T) {
	t.Parallel()
	e := fixtureLucifronStableOwner(t)
	store := &lucifronStore{razorgoreStore: &razorgoreStore{e: e}, affected: 1}
	p, err := EvaluateLucifron(t.Context(), store, e.Instance.ID)
	require.NoError(t, err)
	require.False(t, p.RequiresReparse, p.Reason)
	require.Len(t, p.Warnings, 1)
	require.Contains(t, p.Warnings[0], "Stable recorded-owner inference")
	require.NoError(t, RevalidateLucifron(t.Context(), store, p))
	require.Len(t, p.lucifron.Metrics, 1)
}

func TestLucifronStableRecordedOwnerInference(t *testing.T) {
	t.Parallel()
	for _, source := range []string{lucifronTestPet, "0xF1300009DB000001", "0xF110000001000001", "0xF110000A01000001"} {
		t.Run(source, func(t *testing.T) {
			t.Parallel()
			e, snapshots := lucifronOwnershipFixture(t, source)
			owner := lucifronTestPlayer
			snapshots = append(snapshots, lucifronOwnerSnapshot(t, source, &owner, 4, 4000))
			e.Events[1].Events = numericFrame(t, e, snapshots...)
			p, err := evaluateLucifronEvidence(e)
			require.NoError(t, err)
			require.False(t, p.RequiresReparse, p.Reason)
			require.Len(t, p.lucifron.Metrics, 1)
			require.EqualValues(t, 120, p.lucifron.Metrics[0].DamageDone)
			require.EqualValues(t, 80, p.lucifron.Metrics[0].UnrankedDamageDone)
			require.Len(t, p.Warnings, 1)
			require.Contains(t, p.Warnings[0], "Stable recorded-owner inference")
			require.Contains(t, p.Warnings[0], source)
			require.Contains(t, p.Warnings[0], owner)
			require.Contains(t, p.Warnings[0], "terminal ownership is not proven")
			// A genuine terminal observation keeps the proof path and needs no inference warning.
			snapshots = append(snapshots, lucifronOwnerSnapshot(t, source, &owner, 5, 60000))
			e.Events[1].Events = numericFrame(t, e, snapshots...)
			p, err = evaluateLucifronEvidence(e)
			require.NoError(t, err)
			require.False(t, p.RequiresReparse, p.Reason)
			require.Empty(t, p.Warnings)
		})
	}
}

func TestLucifronOwnershipInferenceRejectsGapsAndTransitions(t *testing.T) {
	t.Parallel()
	for _, kind := range []string{"owner after damage", "owner changed before damage", "owner changed after damage", "owner cleared", "initial nil", "chain", "duplicate index", "unclassified source", "unknown owner", "reconciliation", "owned player", "nonplayer control"} {
		t.Run(kind, func(t *testing.T) {
			t.Parallel()
			e, snapshots := lucifronOwnershipFixture(t, lucifronTestPet)
			first := snapshots[0].(*chronicleproto.UnitClassification)
			other := "0x0000000000000002"
			switch kind {
			case "owner after damage":
				first.Meta.Index = 4
				first.Meta.OffsetMilli = 4000
			case "owner changed before damage":
				first.Meta.Index = 0
				first.Meta.OffsetMilli = 0
				snapshots = append(snapshots, lucifronOwnerSnapshot(t, lucifronTestPet, &other, 1, 1000))
			case "owner changed after damage":
				snapshots = append(snapshots, lucifronOwnerSnapshot(t, lucifronTestPet, &other, 4, 4000))
			case "owner cleared":
				snapshots = append(snapshots, lucifronOwnerSnapshot(t, lucifronTestPet, nil, 4, 4000))
			case "initial nil":
				first.Meta.Index = 0
				first.Meta.OffsetMilli = 0
				owner := *first.Owner
				first.Owner = nil
				snapshots = append(snapshots, lucifronOwnerSnapshot(t, lucifronTestPet, &owner, 1, 1000))
			case "chain":
				npc := lucifronTestBoss
				first.Owner = &npc
			case "duplicate index":
				snapshots = append(snapshots, proto.Clone(first))
			case "unclassified source":
				snapshots = nil
			case "unknown owner":
				first.Owner = nil
			case "reconciliation":
				e.Rankings[0].DamageDone++
			case "owned player":
				snapshots = append(snapshots, lucifronOwnerSnapshot(t, lucifronTestPlayer, &other, 4, 4000))
			case "nonplayer control":
				first.Controller = &other
				first.SpellId = 20604
			}
			e.Events[1].Events = numericFrame(t, e, snapshots...)
			p, err := evaluateLucifronEvidence(e)
			require.NoError(t, err)
			require.True(t, p.RequiresReparse, p.Reason)
			require.Nil(t, p.lucifron)
		})
	}
}

func TestLucifronOwnershipRespectsTargetsAndOrdinaryNPCs(t *testing.T) {
	t.Parallel()
	e, snapshots := lucifronOwnershipFixture(t, lucifronTestPet)
	e.Events[0].Events = numericFrame(t, e,
		lucifronDamage(2, lucifronTestPet, lucifronTestBoss, 120), lucifronDamage(3, lucifronTestPet, lucifronTestHound, 80),
		lucifronDamage(4, lucifronTestBoss, lucifronTestPet, 500),   // ordinary boss damage, not a missing-owner pet
		lucifronDamage(5, lucifronTestPlayer, lucifronTestPet, 600)) // player-owned targets are excluded
	e.Events[1].Events = numericFrame(t, e, snapshots...)
	p, err := evaluateLucifronEvidence(e)
	require.NoError(t, err)
	require.False(t, p.RequiresReparse, p.Reason)
	require.Empty(t, p.Details["omissions"])
	require.Len(t, p.Warnings, 1)
	require.EqualValues(t, 120, p.lucifron.Metrics[0].DamageDone)
	require.EqualValues(t, 80, p.lucifron.Metrics[0].UnrankedDamageDone)
}

func TestLucifronOwnershipDoesNotBorrowOtherEncounterSnapshots(t *testing.T) {
	t.Parallel()
	e, _ := lucifronOwnershipFixture(t, lucifronTestPet)
	other := e
	other.Encounters = append([]database.LogInstanceEncounter(nil), e.Encounters...)
	other.Encounters[0].ID = uuid.New()
	owner := lucifronTestPlayer
	e.Events[1].Events = numericFrame(t, other, lucifronOwnerSnapshot(t, lucifronTestPet, &owner, 1, 1000))
	p, err := evaluateLucifronEvidence(e)
	require.NoError(t, err)
	require.True(t, p.RequiresReparse, p.Reason)
}

func TestLucifronOwnershipInferenceCoexistsWithPlayerControl(t *testing.T) {
	t.Parallel()
	e, casts, snapshots := lucifronControlFixture(t)
	owner := lucifronTestPlayer
	snapshots = append([]proto.Message{lucifronOwnerSnapshot(t, lucifronTestPet, &owner, 0, 0)}, snapshots...)
	// Preserve all validated control evidence while adding owned-source damage.
	e.Events[0].Events = numericFrame(t, e, lucifronDamage(1, lucifronTestPet, lucifronTestBoss, 200))
	setLucifronControlStreams(t, &e, casts, snapshots)
	p, err := evaluateLucifronEvidence(e)
	require.NoError(t, err)
	require.False(t, p.RequiresReparse, p.Reason)
	require.EqualValues(t, 200, p.Details["players"].([]lucifronPlayerChange)[0].AfterRankedDamage)
	require.Len(t, p.Warnings, 1)
}
