package instances

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/auras"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounter"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestVariantBossAuraIsolation(t *testing.T) {
	t.Parallel()
	start := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	boss := guid.GUID(0xF130000000000000 | uint64(33113)<<24 | 1)
	otherBoss := boss + 1
	unrelated := guid.GUID(0xF130000000000000 | uint64(33288)<<24 | 1)
	h := &Hookable{
		variantAuraSpells:     variantAuraSpellSet([]int32{62702}),
		variantBossAuraSpells: map[uint32][]int32{33113: {65075}},
		variantAuraEvidence:   make(map[uuid.UUID][]variantAuraObservation),
	}
	h.Auras = auras.New(nil)
	fight := encounter.Fight{EncounterID: uuid.New(), Start: start, End: start.Add(time.Minute), Hostiles: map[guid.GUID]encounter.CharacterFight{boss: {}}}
	h.currentFight = &ongoingFight{EncounterID: fight.EncounterID}
	h.recordVariantAura(guid.GUID(1), start, 65075) // Player-target tower is not evidence.
	h.recordVariantAura(unrelated, start, 65075)
	h.recordVariantAura(boss, start, 62702)      // Boss-target keeper is not evidence.
	h.recordVariantAura(otherBoss, start, 65075) // Same entry, different nonparticipating unit.
	require.Empty(t, h.variantAurasDuring(fight))
	h.recordVariantAura(boss, start, 65075)
	require.Equal(t, []int32{65075}, h.variantAurasDuring(fight))
	next := fight
	next.EncounterID = uuid.New()
	h.currentFight = &ongoingFight{EncounterID: next.EncounterID}
	require.Empty(t, h.variantAurasDuring(next), "evidence must not cross attempts")
	h.recordVariantAura(boss, start.Add(-time.Second), 65075)
	h.recordVariantAura(boss, start.Add(2*time.Minute), 65075)
	require.Empty(t, h.variantAurasDuring(next), "evidence must be inside finalized boundaries")
}
