package consumeeach

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
)

type Each struct {
	do func(m messages.Message) error
}

func New(p func(m messages.Message) error) *Each {
	s := &Each{
		do: p,
	}
	return s
}

func (s *Each) Process(m messages.Message) error {
	return s.do(m)
}
