package characterset

import (
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/go-playground/locales/om"
	orderedmap "github.com/wk8/go-ordered-map/v2"
)

const (
	Dormancy = time.Minute * 20
	// SlainDormancy is a shorter dormancy for characters that died.
	// Dead characters rarely become active again (boss phase transitions
	// are the main exception, handled by re-adding via Touch).
	SlainDormancy = time.Minute * 5
)

var _ = om.New()

type IsActive interface {
	IsActive() bool
	LastEndState() period.EndState
	ID() guid.GUID
}

type awakeEntry[T IsActive] struct {
	character T
	touchedAt time.Time
	dormancy  time.Duration
}

type Set[T IsActive] struct {
	// characters are all characters ever seen.
	characters *orderedmap.OrderedMap[guid.GUID, T]
	// awake is any non-dormant character.
	awake *orderedmap.OrderedMap[guid.GUID, awakeEntry[T]]
}

func New[T IsActive]() *Set[T] {
	return &Set[T]{
		characters: orderedmap.New[guid.GUID, T](),
		awake:      orderedmap.New[guid.GUID, awakeEntry[T]](),
	}
}

func (s *Set[T]) Get(id guid.GUID) (T, bool) {
	char, exists := s.characters.Get(id)
	return char, exists
}

func (s *Set[T]) ForEach(f func(T) error) error {
	for pair := s.characters.Oldest(); pair != nil; pair = pair.Next() {
		if err := f(pair.Value); err != nil {
			return err
		}
	}
	return nil
}

// ForEachAwake iterates only non-dormant characters.
func (s *Set[T]) ForEachAwake(now time.Time, f func(T) error) error {
	var remove []guid.GUID
	for pair := s.awake.Oldest(); pair != nil; pair = pair.Next() {
		entry := &pair.Value
		if err := f(entry.character); err != nil {
			return err
		}

		if entry.character.IsActive() {
			entry.touchedAt = now
			entry.dormancy = 0
		} else {
			if entry.dormancy == 0 {
				entry.dormancy = Dormancy
				if entry.character.LastEndState() == period.EndStateSlain {
					entry.dormancy = SlainDormancy
				}
			}
			if now.Sub(entry.touchedAt) > entry.dormancy {
				remove = append(remove, pair.Key)
			}
		}
	}

	for _, id := range remove {
		s.awake.Delete(id)
	}
	return nil
}

func (s *Set[T]) Len() int {
	return s.characters.Len()
}

func (s *Set[T]) Add(char T, now time.Time) {
	s.characters.Set(char.ID(), char)
	s.awake.Set(char.ID(), awakeEntry[T]{character: char, touchedAt: now})
}

func (s *Set[T]) Touch(id guid.GUID, now time.Time) {
	char, exists := s.characters.Get(id)
	if !exists {
		panic("NOO")
	}
	if pair := s.awake.GetPair(id); pair != nil {
		pair.Value.touchedAt = now
		pair.Value.dormancy = 0
		return
	}
	s.awake.Set(id, awakeEntry[T]{character: char, touchedAt: now})
}
