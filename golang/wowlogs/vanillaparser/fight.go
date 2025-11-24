package vanillaparser

import (
	"github.com/Emyrk/chronicle/golang/wowlogs/guid"
)

// Fight represents a start & end of combat.
type Fight struct {
	// Players is a map of the players and their last message of activity
	Players map[guid.GUID]Message
	// Enemies is a map of the enemies and their last message of activity
	Enemies map[guid.GUID]Message

	// Who is alive
	PlayersAlive map[guid.GUID]struct{}
	EnemiesAlive map[guid.GUID]struct{}
}

func NewFight() *Fight {
	return &Fight{
		Players:      make(map[guid.GUID]Message),
		Enemies:      make(map[guid.GUID]Message),
		PlayersAlive: make(map[guid.GUID]struct{}),
		EnemiesAlive: make(map[guid.GUID]struct{}),
	}
}
