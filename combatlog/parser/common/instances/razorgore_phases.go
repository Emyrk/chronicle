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

// razorgorePhaseNS is a fixed UUID namespace used with the encounter ID to
// produce stable phase IDs that remain unique across pulls.
var razorgorePhaseNS = uuid.MustParse("a1b2c3d4-e5f6-7890-abcd-ef1234567890")

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

func (d *razorgorePhaseDetector) Finalize(encounterID uuid.UUID, encounterStart, encounterEnd time.Time) []encounter.Phase {
	phaseID := func(key string) uuid.UUID {
		return uuid.NewSHA1(razorgorePhaseNS, []byte(encounterID.String()+":"+key))
	}

	if d.transitionMsg == nil {
		return []encounter.Phase{
			encounter.PhaseFromTimes(
				phaseID("razorgore_p1"),
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
			phaseID("razorgore_p1"),
			"razorgore_p1",
			"Phase 1 – Adds",
			0,
			encounterStart,
			encounterStart,
			transitionTime,
		),
		encounter.PhaseFromTimes(
			phaseID("razorgore_p2"),
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
