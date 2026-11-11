package instances

import (
	"context"

	"github.com/Emyrk/chronicle/combatlog/parser/common/armory"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/instancehook"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/google/uuid"
)

type EmitStrategy string

const (
	EmitAllActive  EmitStrategy = "all_active"
	EmitAllPlayers EmitStrategy = "all_players"
)

// Verify interface compliance.
var _ instancehook.Hook = (*CombatantInfoEmitter)(nil)
var _ characters.SetHook = (*CombatantInfoEmitter)(nil)

// CombatantInfoEmitter injects Combatant messages into the current fight's
// event builder when a fight starts, snapshotting each active player's gear,
// talents, and other COMBATANT_INFO data.
type CombatantInfoEmitter struct {
	instancehook.BaseHook

	armory     *armory.Tracker
	characters *characters.Characters
	units      *unitdb.Units
	emit       func(*messages.Combatant)
	strategy   EmitStrategy
}

// characters.SetHook — emit combatant info when a player becomes active mid-fight.
func (ce *CombatantInfoEmitter) ActivityChange(m messages.Message, chars ...characters.Character) {
	for _, c := range chars {
		if !c.IsActive() || !c.ID().IsPlayer() {
			continue
		}
		player, ok := ce.player(c.ID())
		if !ok {
			continue
		}
		ce.emit(&messages.Combatant{
			MessageBase: messages.Base(m.Date()),
			Combatant:   player.Clone(),
		})
	}
}

// characters.SetHook — no-op.
func (ce *CombatantInfoEmitter) CharacterAdded(_ messages.Message, _ ...characters.Character) {}

// instancehook.Hook — no-op for messages (armory tracker handles COMBATANT_INFO).
func (ce *CombatantInfoEmitter) ProcessMessage(_ bool, _ uuid.UUID, _ messages.Message) error {
	return nil
}

// instancehook.Hook
func (ce *CombatantInfoEmitter) Finalize(_ context.Context) error { return nil }

// instancehook.Hook — emit combatant info for all active players when a fight starts.
func (ce *CombatantInfoEmitter) FightStarted(_ uuid.UUID, m messages.Message) {
	switch ce.strategy {
	case EmitAllActive:
		ce.emitAllActive(m)
	case EmitAllPlayers:
		for gid := range ce.armory.PlayerObservations {
			player, ok := ce.armory.CurrentPlayer(gid)
			if !ok {
				continue
			}
			ce.emit(&messages.Combatant{
				MessageBase: messages.Base(m.Date()),
				Combatant:   player.Clone(),
			})
		}
	default:
		ce.emitAllActive(m)
	}
}

// player uses canonical current metadata, including players whose snapshot was
// logged before this instance's armory existed (for example, an earlier wing).
func (ce *CombatantInfoEmitter) player(id guid.GUID) (combatant.Combatant, bool) {
	if player, ok := ce.armory.CurrentPlayer(id); ok {
		return player, true
	}
	if ce.units != nil {
		return ce.units.GetPlayer(id)
	}
	return combatant.Combatant{}, false
}

// instancehook.Hook — no-op on fight end (gear snapshot at start is sufficient).
func (ce *CombatantInfoEmitter) FightEnded(_ uuid.UUID, _ messages.Message) {}

func (ce *CombatantInfoEmitter) emitAllActive(m messages.Message) {
	_ = ce.characters.All.ForEach(func(char characters.Character) error {
		if !char.IsActive() || !char.ID().IsPlayer() {
			return nil
		}
		player, ok := ce.player(char.ID())
		if !ok {
			return nil
		}
		ce.emit(&messages.Combatant{
			MessageBase: messages.Base(m.Date()),
			Combatant:   player.Clone(),
		})
		return nil
	})
}
