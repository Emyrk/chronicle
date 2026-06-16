package synthetic

import (
	"context"
	"log/slog"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/zoner"
	"github.com/Emyrk/chronicle/database/gamedb"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc/dbcmem"
	"github.com/Emyrk/chronicle/internal/ptr"
)

// 11815 is the item id for HoJ

type extraAttack struct {
	ctx         context.Context
	WoWDB       gamedb.SpellFetcher
	logger      *slog.Logger
	currentZone *zoner.Location
	lastDamage  map[guid.GUID]*messages.Damage
}

func newExtraAttack(ctx context.Context, logger *slog.Logger, wowDB gamedb.SpellFetcher) *extraAttack {
	return &extraAttack{
		ctx:         ctx,
		WoWDB:       wowDB,
		logger:      logger,
		currentZone: zoner.NewLocation(),
		lastDamage:  make(map[guid.GUID]*messages.Damage),
	}
}

func (s *extraAttack) ProcessMessage(msgs []messages.Message) []messages.Message {
	var add []messages.Message
	for _, msg := range msgs {
		switch m := msg.(type) {
		case *messages.SpellGo:
			if m.SpellData == nil {
				continue
			}
			if extra, ok := dbcmem.ExtraAttackSpells[int32(m.SpellData.ID)]; ok {
				spellData, err := s.WoWDB.Spell(s.ctx, m.SpellData.ID)
				if err != nil {
					if chrondbc.IsSpellNotFound(err) {
						spellData = ptr.Ref(chrondbc.UnknownSpell(m.SpellData.ID))
					}
					s.logger.Error("failed to fetch spell data for extra attack", "spellID", m.SpellData.ID, "error", err)
				}

				add = append(add, &messages.ExtraAttack{
					MessageBase:   messages.Base(msg.Date()),
					Caster:        m.Caster,
					Amount:        extra.NumExtraAttacks,
					Spell:         spellData,
					FromSpellName: extra.Name,
				})
			}
		}
	}

	if len(add) == 0 {
		return msgs
	}

	return append(msgs, add...)
}
