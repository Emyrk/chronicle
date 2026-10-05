package encounterevents

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
)

type unitPositionSnapshot struct {
	x      float64
	y      float64
	mapID  int32
	facing float64
}

type unitResourcesSnapshot struct {
	currentHealth int64
	maximumHealth int64
	absorb        int32
	powerType     types.Resource
	currentPower  int32
	maximumPower  int32
	attackPower   int32
	spellPower    int32
	armor         int32
}

type unitTelemetryDeduplicator struct {
	positions map[guid.GUID]unitPositionSnapshot
	resources map[guid.GUID]unitResourcesSnapshot
}

func newUnitTelemetryDeduplicator() *unitTelemetryDeduplicator {
	return &unitTelemetryDeduplicator{
		positions: make(map[guid.GUID]unitPositionSnapshot),
		resources: make(map[guid.GUID]unitResourcesSnapshot),
	}
}

func (d *unitTelemetryDeduplicator) duplicate(msg messages.Message) bool {
	switch typed := msg.(type) {
	case *messages.UnitPosition:
		snapshot := unitPositionSnapshot{
			x:      typed.X,
			y:      typed.Y,
			mapID:  typed.MapID,
			facing: typed.Facing,
		}
		previous, ok := d.positions[typed.Unit]
		d.positions[typed.Unit] = snapshot
		return ok && previous == snapshot
	case *messages.UnitResources:
		snapshot := unitResourcesSnapshot{
			currentHealth: typed.CurrentHealth,
			maximumHealth: typed.MaximumHealth,
			absorb:        typed.Absorb,
			powerType:     typed.PowerType,
			currentPower:  typed.CurrentPower,
			maximumPower:  typed.MaximumPower,
			attackPower:   typed.AttackPower,
			spellPower:    typed.SpellPower,
			armor:         typed.Armor,
		}
		previous, ok := d.resources[typed.Unit]
		d.resources[typed.Unit] = snapshot
		return ok && previous == snapshot
	default:
		return false
	}
}
