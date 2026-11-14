package instances

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
	"github.com/stretchr/testify/require"
)

func TestXTEvidenceGraphStrictIndependentRestores(t *testing.T) {
	t.Parallel()
	r := ownergraph.NewRegistry()
	require.NoError(t, RegisterXTVariantPreprocessorGraphOwner(r))
	at := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	original := &xtVariantEvidence{observations: []xtAuraEvidence{
		{at: at, unit: creatureGUID(33293), heartBreak: true, transition: messages.AuraTransitionApplied},
		{at: at.Add(time.Second), unit: creatureGUID(33329), heartDeath: true},
	}}
	saved, err := r.Capture(original)
	require.NoError(t, err)
	wire, err := json.Marshal(saved)
	require.NoError(t, err)
	var disk ownergraph.Snapshot
	require.NoError(t, json.Unmarshal(wire, &disk))
	a, err := r.Restore(disk)
	require.NoError(t, err)
	b, err := r.Restore(disk)
	require.NoError(t, err)
	require.Equal(t, original, a)
	require.Equal(t, original, b)
	a.(*xtVariantEvidence).observations[0].heartBreak = false
	require.True(t, b.(*xtVariantEvidence).observations[0].heartBreak)
	for _, observation := range []xtObservationValue{
		{Unit: creatureGUID(1), HeartDeath: true},
		{Unit: creatureGUID(33329), HeartDeath: true, HeartBreak: true},
		{Unit: creatureGUID(33329), HeartDeath: true, Transition: messages.AuraTransitionApplied},
		{Unit: creatureGUID(33329), HeartBreak: true, Transition: messages.AuraTransitionApplied},
		{Unit: creatureGUID(33293), Transition: messages.AuraTransitionRemoved},
		{Unit: creatureGUID(33293), HeartBreak: true},
	} {
		require.Error(t, (xtEvidenceValue{Observations: []xtObservationValue{observation}}).validate())
	}
}
