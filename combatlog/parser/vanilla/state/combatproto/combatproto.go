package combatproto

import "github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"

type CombatProto struct {
	damage []any
}

func New() *CombatProto {
	return &CombatProto{}
}

func (c *CombatProto) Process(m messages.Message) error {
	return nil
}
