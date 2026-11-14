package encounterevents

import (
	"fmt"
	"time"

	"github.com/Emyrk/chronicle/api/chronicleproto"
	"github.com/Emyrk/chronicle/api/chronicleproto/types2proto"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
)

// PendingDamageState is only the active, unencoded Damage builder. Other
// builders (notably already-serialized Slain) are outside this adapter and must
// retain their existing bytes; they must not be rebuilt from attributed Damage.
type PendingDamageState struct {
	First   time.Time
	Count   int64
	Entries []PendingDamageReference
}
type PendingDamageReference struct {
	Path  string
	Index int32
}

// CapturePendingDamage visits actual pending objects in stable event order. The
// callback assigns canonical owner paths and can register pointer aliases.
func CapturePendingDamage(b *Builder[*messages.Damage, *chronicleproto.Damage], capture func(int, *messages.Damage) (string, error)) (PendingDamageState, error) {
	if b == nil || b.done || !b.buffered || b.data == nil || b.data.Len() != 0 {
		return PendingDamageState{}, fmt.Errorf("damage builder is not an active unencoded buffer")
	}
	if b.Count != int64(len(b.pending)) {
		return PendingDamageState{}, fmt.Errorf("inconsistent pending damage count")
	}
	s := PendingDamageState{First: b.First, Count: b.Count}
	if b.pending != nil {
		s.Entries = make([]PendingDamageReference, len(b.pending))
	}
	for i, entry := range b.pending {
		if capture == nil {
			return PendingDamageState{}, fmt.Errorf("missing damage capture callback")
		}
		p, err := capture(i, entry.message)
		if err != nil {
			return PendingDamageState{}, err
		}
		if p == "" {
			return PendingDamageState{}, fmt.Errorf("empty damage reference")
		}
		s.Entries[i] = PendingDamageReference{Path: p, Index: entry.index}
	}
	return s, nil
}

func (s PendingDamageState) Restore(resolve func(string) (*messages.Damage, error)) (*Builder[*messages.Damage, *chronicleproto.Damage], error) {
	if s.Count != int64(len(s.Entries)) {
		return nil, fmt.Errorf("inconsistent pending damage count")
	}
	b := NewBufferedBuilder[*messages.Damage, *chronicleproto.Damage]()
	b.First = s.First
	b.Count = s.Count
	b.convert = types2proto.Damage
	if s.Entries != nil {
		b.pending = make([]bufferedMessage[*messages.Damage], len(s.Entries))
	}
	for i, entry := range s.Entries {
		if resolve == nil || entry.Path == "" {
			return nil, fmt.Errorf("missing damage resolver or reference")
		}
		damage, err := resolve(entry.Path)
		if err != nil {
			return nil, err
		}
		if damage == nil {
			return nil, fmt.Errorf("nil pending damage")
		}
		b.pending[i] = bufferedMessage[*messages.Damage]{message: damage, index: entry.Index}
	}
	return b, nil
}
