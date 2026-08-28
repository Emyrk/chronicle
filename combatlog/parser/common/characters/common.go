package characters

import (
	"fmt"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
)

const (
	InactivityTimeout = time.Second * 60
)

type Common struct {
	*Base[*period.InactivityPeriod]
	timeout        time.Duration
	timeoutAsDeath bool
}

func NewCommonCharacter(id guid.GUID, all *Characters) *Common {
	return &Common{
		Base:    NewBaseCharacter[*period.InactivityPeriod](id, all),
		timeout: InactivityTimeout,
	}
}

func (c *Common) WithTimeout(timeout time.Duration) *Common {
	c.timeout = timeout
	return c
}

func (c *Common) WithTimeoutAsDeath() *Common {
	c.timeoutAsDeath = true
	return c
}

func (c *Common) Process(m messages.Message) error {
	// Timeouts should be checked on every timestamp
	cur, ok := c.Activity.Current()
	if ok {
		cur.HandleTimeout(m.Date())
	}

	return ProcessCommonActivity(c, m)
}

func (c *Common) Start(reason string, m messages.Message) {
	c.Activity.Start(
		period.NewInactivityPeriod(c.ID(), c.timeout).WithTimeoutAsDeath(c.timeoutAsDeath),
		reason, m,
	)
}

type CharacterBase interface {
	Character

	End(reason string, m messages.Message, state period.EndState)
	Died(reason string, m messages.Message)
	Bump(reason string, m messages.Message)
	Start(reason string, m messages.Message)
	CurrentPeriodIsPeriod() (period.IsPeriod, bool)

	Owner() (guid.GUID, bool)
	Lookup() *Characters
	ContainsMe(ids ...guid.GUID) bool
}

// IsImmobilizeCC reports whether a spell uses the generic crowd-control activity behavior.
func IsImmobilizeCC(spellName string) bool {
	switch spellName {
	case "Polymorph", "Freezing Trap Effect", "Sap", "Hibernate", "Banish":
		return true
	}
	return strings.HasPrefix(spellName, "Polymorph: ")
}

// ProcessCommonActivity handles the basics of activity processing for a character.
// nolint: staticcheck
func ProcessCommonActivity(c CharacterBase, m messages.Message) error {
	if m.MarksExist() {
		if reason, ok := m.MarkHas(messages.MarkTypeStart, c.ID()); ok {
			c.Start(reason, m)
		}
		if reason, ok := m.MarkHas(messages.MarkTypeBump, c.ID()); ok {
			c.Bump(reason, m)
		}
		if _, ok := m.MarkHas(messages.MarkTypeIgnoreActivity, c.ID()); ok {
			return nil
		}
		// Let the regular logic apply.
	}

	switch data := m.(type) {
	case *messages.Cast:
		if data.Target != nil && (*data.Target).Gid == c.ID() {
			if data.Action == types.CastActionsCasts && IsImmobilizeCC(data.Spell.Name) {
				c.Start(fmt.Sprintf("cc_%s", data.Spell.Name), m)
			}
		}
	case *messages.SpellStart:
	case *messages.SpellGo:
	case *messages.Aura:
		if c.ID() != data.Target {
			return nil
		}

		applied := data.Amount > 0
		removed := data.Amount == 0

		if IsImmobilizeCC(data.SpellName) {
			if applied {
				c.Start(fmt.Sprintf("cc_%s", data.SpellName), m)
			} else if removed {
				// Enter grace period instead of immediate reset
				// If activity occurs within 5s, the reset is cancelled
				cur, ok := c.CurrentPeriodIsPeriod()
				if ok {
					cur.EnterResetGracePeriod("cc removed", m)
				}
			}
		}

		if data.SpellData != nil && applied {
			if data.SpellData.SpellDamageType().Has(chrondbc.SpellDamageActiveDebuff) {
				if c.RecentlySlain(m) {
					c.Bump(fmt.Sprintf("debuff_%s", data.SpellData.Name()), m)
				} else {
					// Faerie fire, sunder armor, etc.
					c.Start(fmt.Sprintf("debuff_%s", data.SpellData.Name()), m)
				}
			}
		}
	case *messages.Slain:
		if c.ID() == data.Victim {
			c.Died(ReasonSlain, m)
			return nil
		}

		// Pets are tied to their owners.
		owner, ok := c.Owner()
		if ok && owner == data.Victim {
			// A temporarily possessed unit (e.g. Mind Control, Orb of Dominion)
			// can report its controller as an owner, but it does not die when
			// the controller dies — the possession just ends. Death of the
			// permanent owner still kills the pet, possessed or not.
			ps, possessed := c.Lookup().DB().GetPossession(c.ID())
			if !possessed || ps.Controller != data.Victim {
				c.Died(ReasonOwnerSlain, m)
				return nil
			}
		}

		// Being the killer does not indicate activity.
		// Could be killed from a dot for example.
	case *messages.Damage:
		// Damage can tick after death, so ignore if recently slain.
		if c.RecentlySlain(m) {
			return nil
		}

		target, ok := c.Lookup().Get(data.Target)
		if ok && target.RecentlySlain(m) {
			// Damaging a recently killed target is not activity
			return nil
		}

		isMe := c.ContainsMe(data.Affects()...)
		// Owner counts if we are active, and the owner is doing something.
		owner, hasOwner := c.Owner()
		ownerConditions := hasOwner && c.IsActive() && ((data.Caster != nil && owner == *data.Caster) || owner == data.Target)

		if isMe || ownerConditions {
			if !data.RequiresActive() {
				// Cannot start an activity, but will bump.
				c.Bump("periodic damage", data)
				return nil
			}

			if data.HitType.Has(types.HitTypeImmune) || data.HitType.Has(types.HitTypeEvade) {
				c.Bump("immune/evade damage", data)
				return nil
			}

			c.Start("direct damage", data)
			return nil
		}
		return nil
	}
	return nil
}

func (c *Common) Is(entry uint32) bool {
	charEntry, ok := c.ID().GetEntry()
	if !ok {
		return false
	}
	return charEntry == entry
}
