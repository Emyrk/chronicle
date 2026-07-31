package overviewmetrics

import (
	"context"
	"sort"

	"github.com/google/uuid"

	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/instancehook"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

const DeadliestAbilityLimit = 10

type DeadliestAbility struct {
	SpellID         *int32
	Name            string
	Damage          int64
	Hits            int64
	EnvironmentType string
}

type abilityKey struct {
	spellID         int32
	name            string
	environmentType string
}

type Tracker struct {
	instancehook.BaseHook
	units     *unitdb.Units
	abilities map[abilityKey]*DeadliestAbility
}

func NewTracker(units *unitdb.Units) *Tracker {
	return &Tracker{
		units:     units,
		abilities: make(map[abilityKey]*DeadliestAbility),
	}
}

func (t *Tracker) ProcessMessage(active bool, _ uuid.UUID, m messages.Message) error {
	if !active {
		return nil
	}

	msg, ok := m.(*messages.Damage)
	if !ok || msg.Amount <= 0 || !t.isPlayerOrPlayerOwned(msg.Target) {
		return nil
	}

	key, ability := deadliestAbility(msg)
	current, ok := t.abilities[key]
	if !ok {
		current = &ability
		t.abilities[key] = current
	}
	current.Damage += int64(msg.Amount)
	current.Hits++
	return nil
}

func (t *Tracker) Finalize(context.Context) error { return nil }

func (t *Tracker) Result() []DeadliestAbility {
	abilities := make([]DeadliestAbility, 0, len(t.abilities))
	for _, ability := range t.abilities {
		abilities = append(abilities, *ability)
	}
	sort.Slice(abilities, func(i, j int) bool {
		if abilities[i].Damage != abilities[j].Damage {
			return abilities[i].Damage > abilities[j].Damage
		}
		if abilities[i].Hits != abilities[j].Hits {
			return abilities[i].Hits > abilities[j].Hits
		}
		if abilities[i].Name != abilities[j].Name {
			return abilities[i].Name < abilities[j].Name
		}
		return spellIDValue(abilities[i].SpellID) < spellIDValue(abilities[j].SpellID)
	})
	if len(abilities) > DeadliestAbilityLimit {
		abilities = abilities[:DeadliestAbilityLimit]
	}
	return abilities
}

func (t *Tracker) isPlayerOrPlayerOwned(unitGUID guid.GUID) bool {
	cls := t.units.Classify(unitGUID)
	if cls.Type == unitdb.UnitTypePlayer {
		return true
	}
	if !cls.Relation.HasOwner() {
		return false
	}
	return t.units.Classify(*cls.Relation.Owner).Type == unitdb.UnitTypePlayer
}

func deadliestAbility(msg *messages.Damage) (abilityKey, DeadliestAbility) {
	name := "Melee"
	var spellID *int32
	if msg.SpellData != nil {
		id := int32(msg.SpellData.ID)
		spellID = &id
	}
	if msg.SpellName != nil && *msg.SpellName != "" {
		name = *msg.SpellName
	}

	environmentType := ""
	if msg.EnvironmentType != nil {
		environmentType = string(*msg.EnvironmentType)
		if msg.SpellName == nil {
			name = environmentType
		}
	}

	key := abilityKey{name: name, environmentType: environmentType}
	if spellID != nil {
		key = abilityKey{spellID: *spellID}
	}
	return key, DeadliestAbility{
		SpellID:         spellID,
		Name:            name,
		EnvironmentType: environmentType,
	}
}

func spellIDValue(spellID *int32) int32 {
	if spellID == nil {
		return 0
	}
	return *spellID
}
