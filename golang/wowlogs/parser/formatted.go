package parser

import (
	"fmt"
	"log/slog"
	"strconv"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/golang/wowlogs/combatant"
)

func (p *Parser) fCombatantInfo(ts time.Time, content string) (Message, error) {
	if !strings.HasPrefix(content, "COMBATANT_INFO:") {
		return notHandled()
	}

	cbt, err := combatant.ParseCombatantInfo(content)
	if err != nil {
		return nil, fmt.Errorf("failed to parse combatant info: %v", err)
	}

	var _ = cbt // TODO: use combatant info

	return SkippedMessage{
		MessageBase: Base(ts),
		Reason:      "combatant info",
	}, nil
}

func (p *Parser) fCombatantGUID(ts time.Time, content string) (Message, error) {
	if !strings.HasPrefix(content, "COMBATANT_GUID:") {
		return notHandled()
	}

	cbt, err := combatant.ParseCombatantGUID(content)
	if err != nil {
		return nil, fmt.Errorf("failed to parse combatant guid: %v", err)
	}

	var _ = cbt // TODO: use combatant guid

	return SkippedMessage{
		MessageBase: Base(ts),
		Reason:      "combatant guid",
	}, nil
}

func (p *Parser) fBugDamageSpellHitOrCrit(ts time.Time, content string) (Message, error) {
	if !reBugDamageSpellHitOrCrit.MatchString(content) {
		return notHandled()
	}

	p.logger.Error("bugged line in logs, skipping",
		slog.String("content", content),
	)
	return &SkippedMessage{
		MessageBase: Base(ts),
		Reason:      "bugged line in logs",
	}, nil
}

// 10/29 22:09:40.825  Randgriz begins to cast Flash Heal.
// 10/29 22:09:42.175  Randgriz casts Flash Heal on Katrix.
// 10/29 22:09:42.175  Randgriz 's Flash Heal critically heals Katrix for 2534.
func (p *Parser) fSpellCastAttempt(ts time.Time, content string) (Message, error) {
	matches := reSpellCastAttempt.FindStringSubmatch(content)
	if matches == nil {
		return notHandled()
	}

	unit, spell := matches[1], matches[2]
	return SpellCastAttempt{
		MessageBase: Base(ts),
		Caster: Unit{
			Name: unit,
		},
		SpellName: spell,
	}, nil
}

func (p *Parser) fGain(ts time.Time, content string) (Message, error) {
	matches := reGain.FindStringSubmatch(content)
	if matches == nil {
		return notHandled()
	}

	target, amountStr, resource, caster, spell := matches[1], matches[2], matches[3], matches[4], matches[5]
	amount, err := strconv.ParseUint(amountStr, 10, 64)
	if err != nil {
		return nil, fmt.Errorf("resource gain amount %q is not valid: %v", amountStr, err)
	}

	return ResourceGain{
		MessageBase: Base(ts),
		Target:      Unit{Name: target},
		Amount:      uint32(amount),
		Resource:    resource,
		Caster:      Unit{Name: caster},
		Spell:       spell,
	}, nil
}
