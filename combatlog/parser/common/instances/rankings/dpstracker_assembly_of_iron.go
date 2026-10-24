package rankings

import "github.com/Emyrk/chronicle/combatlog/parser/guid"

// DPSTrackerAssemblyOfIron owns Assembly-specific phase damage state.
type DPSTrackerAssemblyOfIron struct {
	phaseTargetEntries map[uint32]struct{}
	phaseDamage        map[guid.GUID]map[guid.GUID]int64
}

func newDPSTrackerAssemblyOfIron() *DPSTrackerAssemblyOfIron {
	return &DPSTrackerAssemblyOfIron{
		phaseTargetEntries: map[uint32]struct{}{
			32857: {},
			32867: {},
			32927: {},
			33692: {},
			33693: {},
			33694: {},
		},
		phaseDamage: make(map[guid.GUID]map[guid.GUID]int64),
	}
}

func (t *DPSTrackerAssemblyOfIron) reset() {
	t.phaseDamage = make(map[guid.GUID]map[guid.GUID]int64)
}

func (t *DPSTrackerAssemblyOfIron) isPhaseTarget(id guid.GUID) bool {
	entry, ok := id.GetEntry()
	if !ok {
		return false
	}
	_, ok = t.phaseTargetEntries[entry]
	return ok
}

func (t *DPSTrackerAssemblyOfIron) trackDamage(target, creditGUID guid.GUID, amount int64) bool {
	if !t.isPhaseTarget(target) {
		return false
	}
	bucket := t.phaseDamage[target]
	if bucket == nil {
		bucket = make(map[guid.GUID]int64)
		t.phaseDamage[target] = bucket
	}
	bucket[creditGUID] += amount
	return true
}

func (t *DPSTrackerAssemblyOfIron) commitTarget(target guid.GUID, damageDone map[guid.GUID]int64) {
	for creditGUID, amount := range t.phaseDamage[target] {
		damageDone[creditGUID] += amount
	}
}

func (t *DPSTrackerAssemblyOfIron) commitSlainTarget(target guid.GUID, damageDone map[guid.GUID]int64) {
	if !t.isPhaseTarget(target) {
		return
	}
	t.commitTarget(target, damageDone)
	clear(t.phaseDamage)
}

func (t *DPSTrackerAssemblyOfIron) commitUnresolved(damageDone map[guid.GUID]int64) {
	for target := range t.phaseDamage {
		t.commitTarget(target, damageDone)
	}
	clear(t.phaseDamage)
}
