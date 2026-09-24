package synthetic

import (
	"context"
	"fmt"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/database/gamedb"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
)

const (
	feignDeathSpellID      chrondbc.SpellID = 28728
	feignDeathDamageWindow                  = 3 * time.Second
)

type feignDeath struct {
	ctx            context.Context
	spells         gamedb.SpellFetcher
	classForPlayer func(guid.GUID) types.HeroClasses
	lastDamage     map[guid.GUID]*messages.Damage
	spell          *chrondbc.Spell
}

func newFeignDeath(
	ctx context.Context,
	spells gamedb.SpellFetcher,
	classForPlayer func(guid.GUID) types.HeroClasses,
) *feignDeath {
	return &feignDeath{
		ctx:            ctx,
		spells:         spells,
		classForPlayer: classForPlayer,
		lastDamage:     make(map[guid.GUID]*messages.Damage),
	}
}

// ProcessMessages replaces hunter death events that look like Feign Death
// with a synthetic spell completion. ChromieCraft does not emit the Feign Death
// cast. A zero-overkill hit within the previous three seconds distinguishes the
// false death without requiring lookahead.
func (f *feignDeath) ProcessMessages(msgs []messages.Message) ([]messages.Message, error) {
	for i, msg := range msgs {
		switch m := msg.(type) {
		case *messages.Damage:
			f.lastDamage[m.Target] = m
		case *messages.Slain:
			isFeignDeath := f.isFeignDeath(m)
			delete(f.lastDamage, m.Victim)
			if !isFeignDeath {
				continue
			}

			spell, err := f.feignDeathSpell()
			if err != nil {
				return nil, err
			}
			target := m.Victim
			msgs[i] = &messages.SpellGo{
				MessageBase: messages.Base(m.Date(), messages.WithSynthetic()),
				SpellData:   spell,
				Caster:      m.Victim,
				Target:      &target,
			}
		}
	}
	return msgs, nil
}

func (f *feignDeath) isFeignDeath(slain *messages.Slain) bool {
	// UNIT_DIED and UNIT_DESTROYED are the WotLK slain forms without a killer.
	// PARTY_KILL and *_INSTAKILL provide one and must remain real deaths.
	if slain.Killer != nil || f.classForPlayer(slain.Victim) != types.HeroClassesHUNTER {
		return false
	}

	damage, ok := f.lastDamage[slain.Victim]
	if !ok || damage.Overkill != 0 {
		return false
	}

	elapsed := slain.Date().Sub(damage.Date())
	return elapsed >= 0 && elapsed <= feignDeathDamageWindow
}

func (f *feignDeath) feignDeathSpell() (*chrondbc.Spell, error) {
	if f.spell != nil {
		return f.spell, nil
	}
	if f.spells == nil {
		return nil, fmt.Errorf("fetching Feign Death spell %d: spell fetcher is nil", feignDeathSpellID)
	}

	spell, err := f.spells.Spell(f.ctx, feignDeathSpellID)
	if err != nil {
		return nil, fmt.Errorf("fetching Feign Death spell %d: %w", feignDeathSpellID, err)
	}
	f.spell = spell
	return spell, nil
}
