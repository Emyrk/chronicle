package serviceeventrepair

import (
	"errors"
	"fmt"
	"slices"
	"time"

	"github.com/Emyrk/chronicle/api/chronicleproto"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"google.golang.org/protobuf/proto"
)

// Only damage and optional historical classification are needed. Healing,
// absorbs, deaths and unrelated boss metrics are not replayed or rewritten.
func lucifronEvents(e razorgoreEvidence, c database.LogInstanceEncounter) ([]razorgoreReplayEvent, error) {
	result := []razorgoreReplayEvent{}
	seen := map[database.LogInstanceEventType]bool{}
	parse := func(s string) (guid.GUID, error) {
		g, err := guid.FromString(s)
		if err != nil || g.IsZero() {
			return 0, errors.New("invalid event GUID")
		}
		return g, nil
	}
	for _, row := range e.Events {
		if row.Type != database.LogInstanceEventTypeDamage && row.Type != database.LogInstanceEventTypeUnitClassification {
			continue
		}
		if seen[row.Type] || row.InstanceID != e.Instance.ID {
			return nil, errors.New("duplicate or unrelated event stream")
		}
		seen[row.Type] = true
		raw, err := razorgoreFrame(row.Events, c.ID, c.StartTime.Time)
		if err != nil {
			return nil, fmt.Errorf("%s: %w", row.Type, err)
		}
		previous := int32(-1)
		for _, b := range raw {
			var event proto.Message = &chronicleproto.Damage{}
			if row.Type == database.LogInstanceEventTypeUnitClassification {
				event = &chronicleproto.UnitClassification{}
			}
			if err := proto.Unmarshal(b, event); err != nil {
				return nil, err
			}
			meta := event.(interface {
				GetMeta() *chronicleproto.EventMeta
			}).GetMeta()
			if meta == nil || meta.IsSynthetic || meta.Index <= previous || meta.OffsetMilli < 0 || meta.OffsetMilli > c.EndTime.Time.Sub(c.StartTime.Time).Milliseconds() {
				return nil, errors.New("invalid damage/classification event metadata")
			}
			previous = meta.Index
			at := c.StartTime.Time.Add(time.Duration(meta.OffsetMilli) * time.Millisecond)
			base := messages.Base(at)
			var message messages.Message
			switch m := event.(type) {
			case *chronicleproto.Damage:
				target, err := parse(m.Target)
				if err != nil {
					return nil, err
				}
				damage := &messages.Damage{MessageBase: base, Target: target, Amount: m.Amount, Overkill: m.Overkill, HitType: types.HitType(m.HitType)}
				if m.Caster != nil {
					caster, err := parse(*m.Caster)
					if err != nil {
						return nil, err
					}
					damage.Caster = &caster
				}
				for _, tail := range m.Tailers {
					if tail == nil {
						return nil, errors.New("nil damage trailer")
					}
					damage.Trailer = append(damage.Trailer, types.TrailerEntry{Amount: tail.Amount, HitType: types.HitType(tail.HitType)})
				}
				message = damage
			case *chronicleproto.UnitClassification:
				target, err := parse(m.Target)
				if err != nil {
					return nil, err
				}
				classification := &messages.UnitClassificationEvent{MessageBase: base, Target: target, UnitType: unitdb.UnitType(m.UnitType), Affiliation: unitdb.Affiliation(m.Affiliation)}
				if m.Owner != nil {
					owner, err := guid.FromString(*m.Owner)
					if err != nil {
						return nil, err
					}
					if !owner.IsZero() {
						classification.Owner = &owner
					}
				}
				if m.Controller != nil {
					controller, err := parse(*m.Controller)
					if err != nil {
						return nil, err
					}
					classification.Controller = &controller
					if m.SpellId != 0 {
						classification.Spell = &chrondbc.Spell{ID: chrondbc.SpellID(m.SpellId)}
					}
				}
				message = classification
			}
			result = append(result, razorgoreReplayEvent{index: meta.Index, at: at, message: message})
		}
	}
	if !seen[database.LogInstanceEventTypeDamage] {
		return nil, errors.New("missing damage stream")
	}
	slices.SortFunc(result, func(a, b razorgoreReplayEvent) int {
		if a.index < b.index {
			return -1
		}
		if a.index > b.index {
			return 1
		}
		return 0
	})
	for i := 1; i < len(result); i++ {
		if result[i].index == result[i-1].index || result[i].at.Before(result[i-1].at) {
			return nil, errors.New("ambiguous damage/classification chronology")
		}
	}
	return result, nil
}
