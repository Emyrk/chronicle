package instances

import (
	"time"

	"github.com/google/uuid"

	"github.com/Emyrk/chronicle/combatlog/parser/common/encounter"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/creatures"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
)

const (
	razorgoreEncounterName = "Razorgore the Untamed"
	razorgoreEntry         = uint32(12435)
	destroyEggSpellID      = chrondbc.SpellID(19873)
)

// BWLPhaseDetectorFactories returns the per-fight phase detector factories for
// Blackwing Lair. If the flavor is unsupported for phases, it returns nil.
func BWLPhaseDetectorFactories(flavor database.WoWFlavor) []encounter.PhaseDetectorFactory {
	threshold := creatures.RazorgoreEggThreshold(flavor)
	if threshold == 0 {
		return nil
	}
	return []encounter.PhaseDetectorFactory{
		func() encounter.PhaseDetector {
			return &razorgorePhaseDetector{threshold: threshold}
		},
	}
}

type razorgorePhaseDetector struct {
	threshold     int
	eggCount      int
	transitionMsg messages.Message // the SpellGo that crossed the threshold
}

func (d *razorgorePhaseDetector) EncounterName() string {
	return razorgoreEncounterName
}

func (d *razorgorePhaseDetector) ProcessMessage(m messages.Message) {
	if d.transitionMsg != nil {
		return // already transitioned
	}
	sg, ok := m.(*messages.SpellGo)
	if !ok || sg.SpellData == nil {
		return
	}
	if sg.SpellData.ID != destroyEggSpellID {
		return
	}
	entry, ok := sg.Caster.GetEntry()
	if !ok || entry != razorgoreEntry {
		return
	}
	d.eggCount++
	if d.eggCount >= d.threshold {
		d.transitionMsg = m
	}
}

func (d *razorgorePhaseDetector) Finalize(encounterStart, encounterEnd time.Time) []encounter.Phase {
	if d.transitionMsg == nil {
		return []encounter.Phase{
			encounter.PhaseFromTimes(
				uuid.New(),
				"razorgore_p1",
				"Phase 1 – Adds",
				0,
				encounterStart,
				encounterStart,
				encounterEnd,
			),
		}
	}

	transitionTime := d.transitionMsg.Date()
	return []encounter.Phase{
		encounter.PhaseFromTimes(
			uuid.New(),
			"razorgore_p1",
			"Phase 1 – Adds",
			0,
			encounterStart,
			encounterStart,
			transitionTime,
		),
		encounter.PhaseFromTimes(
			uuid.New(),
			"razorgore_p2",
			"Phase 2 – Boss",
			1,
			encounterStart,
			transitionTime,
			encounterEnd,
		),
	}
}

func (d *razorgorePhaseDetector) Reset() {
	d.eggCount = 0
	d.transitionMsg = nil
}
