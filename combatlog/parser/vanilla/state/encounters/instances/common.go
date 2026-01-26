package instances

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"strings"

	"github.com/Emyrk/chronicle/api/chronicleproto"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/types/unitinfo"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/combatmetrics"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/combatproto"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters/character"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/unitdb"
	"github.com/Emyrk/chronicle/internal/ptr"
	"github.com/gogo/protobuf/proto"
)

var _ Instance = (*Common)(nil)

// Common is used for instances that have no custom mechanics beyond character
// mechanics.
type Common struct {
	name          string
	zoneNameMatch string

	logger *slog.Logger
	db     *unitdb.Units

	CurrentZone zone.Zone
	Characters  *character.Characters
	*Identifier

	// Live fight tracking
	currentFight    *OngoingFight
	completedFights []Fight
	combatValues    *combatmetrics.Metrics
	combatProto     *combatproto.CombatProto
}

type FinalizedInstance struct {
	Encounters []Encounter
	SeenUnits  map[guid.GUID]unitinfo.Info
}

func (c *Common) Finalize(ctx context.Context) (*FinalizedInstance, error) {
	if false && c.currentFight != nil {
		// TODO: We need to end any ongoing fight with what timestamp?
		// Finalize any current fight that hasn't been completed yet
		err := c.finalizeFight()
		if err != nil {
			return nil, fmt.Errorf("finalizing ongoing fight: %w", err)
		}
	}

	zipOut := bytes.NewBuffer(nil)
	ziper := gzip.NewWriter(zipOut)
	encounters := make([]Encounter, 0, len(c.completedFights))
	totalSize := int64(0)
	totalMessages := int64(0)
	totalCustomSize := int64(0)
	last := 0
	for _, fight := range c.completedFights {
		encounterName := ""
		encounterType := types.EncounterTypeTRASH
		boss := false
		for hid, h := range fight.Hostiles {
			if hid != h.ID {
				panic("inconsistent hostile ID mapping")
			}

			id := c.IdentifyUnit(h.ID)
			if !id.Hostile {
				continue
			}
			if id.Boss {
				boss = true
			}

			// Always take the encounter name if set
			if id.EncounterName != "" {
				encounterName = id.EncounterName
				encounterType = types.EncounterTypeBOSS
			}

			if encounterName == "" {
				info, hasInfo := c.db.Get(h.ID)
				if hasInfo {
					encounterName = info.Name
				}
			}
		}
		cdata, err := CustomMarshal(fight.damage)
		if err != nil {
			return nil, fmt.Errorf("marshalling damage: %w", err)
		}
		totalCustomSize += int64(len(cdata))

		data, _ := proto.Marshal(&chronicleproto.DamageReport{
			Damages: fight.damage,
		})
		totalSize += int64(len(data))
		totalMessages += int64(len(fight.damage))
		_, err = ziper.Write(data)
		if err != nil {
			return nil, fmt.Errorf("writing to gzip: %w", err)
		}
		err = ziper.Flush()
		if err != nil {
			return nil, fmt.Errorf("flushing gzip: %w", err)
		}

		zdiff := zipOut.Len() - last
		last = zipOut.Len()

		c.logger.Info("fight size", slog.Int("zip_data", zdiff), slog.Int("cdata_size", len(cdata)), slog.Int("data_size", len(data)), slog.String("fight_name", encounterName), slog.Int("message_count", len(fight.damage)))

		summary, err := c.combatValues.DamageSummary(ctx, fight.Start, fight.End)
		if err != nil {
			return nil, fmt.Errorf("computing damage summary: %w", err)
		}

		remaining := fight.Remaining()
		encounters = append(encounters, Encounter{
			Name:      encounterName,
			Type:      encounterType,
			Combat:    fight,
			IsKill:    len(remaining) == 0,
			Remaining: remaining,
			Boss:      boss,
			Damage:    summary,
		})
	}

	ziper.Flush()
	gzL := zipOut.Len()
	r, err := gzip.NewReader(zipOut)
	if err != nil {
		return nil, fmt.Errorf("creating gzip reader: %w", err)
	}

	zall, err := io.ReadAll(r)
	if err != nil {
		if !strings.Contains(err.Error(), "EOF") && !errors.Is(err, io.EOF) {
			return nil, fmt.Errorf("reading gzip: %w", err)
		}
	}

	if len(zall) != int(totalSize) {
		return nil, fmt.Errorf("zip size mismatch: %d != %d", len(zall), totalSize)
	}

	c.logger.Info("total size", slog.Int("zip_data", gzL), slog.Int64("custom_data_size", totalCustomSize), slog.Int64("message_count", totalMessages), slog.String("instance", c.name), slog.Int64("data_size", totalSize))
	return &FinalizedInstance{
		Encounters: encounters,
	}, nil
}

type CommonFactory struct {
	Name     string
	ZoneName string
	Hostiles func() *Identifier
}

func (f *CommonFactory) New(logger *slog.Logger, db *unitdb.Units, z zone.Zone) *Common {
	characters := character.NewCharacters(db)
	c := &Common{
		name:          f.Name,
		zoneNameMatch: f.ZoneName,
		logger:        logger,
		db:            db,
		CurrentZone:   z,
		Characters:    characters,
		Identifier:    f.Hostiles(),
		combatValues:  combatmetrics.New(characters),
	}

	return c
}

func (c *Common) Zone() zone.Zone {
	return c.CurrentZone
}

func (c *Common) CharactersList() map[guid.GUID]character.Character {
	return c.Characters.All.Map()
}

func (c *Common) Name() string {
	return c.name
}

func (c *Common) MatchesZone(z zone.Zone) bool {
	return strings.ToLower(z.Name) == c.zoneNameMatch
}

func (c *Common) Process(m messages.Message) error {
	actChange, err := c.Characters.Process(m)
	if err != nil {
		return fmt.Errorf("processing characters: %w", err)
	}

	if actChange {
		err = c.CharacterActivityChange()
		if err != nil {
			return fmt.Errorf("processing fight: %w", err)
		}
	}

	if c.currentFight != nil {
		switch tm := m.(type) {
		case messages.Damage:
			var caster *string
			if tm.Caster != nil {
				caster = ptr.Ref(tm.Caster.String())
			}

			trailers := make([]*chronicleproto.Tailer, 0)
			for _, t := range tm.Trailer {
				trailers = append(trailers, &chronicleproto.Tailer{
					Amount:  t.Amount,
					HitType: uint32(t.HitType),
				})
			}

			c.currentFight.damage = append(c.currentFight.damage, &chronicleproto.Damage{
				OffsetMilli: 55000, // TODO: Correct offset
				Caster:      caster,
				SpellName:   tm.SpellName,
				Target:      tm.Target.String(),
				HitType:     uint32(tm.HitType),
				Amount:      tm.Amount,
				// TODO:
				School:  chronicleproto.School_None,
				Tailers: trailers,
			})
		}
	}

	err = c.combatValues.Process(m)
	if err != nil {
		return fmt.Errorf("processing combat metrics: %w", err)
	}

	return nil
}

// Fights returns all completed fights minus the current fight in progress.
func (c *Common) Fights() []Fight {
	fights := make([]Fight, len(c.completedFights))
	copy(fights, c.completedFights)
	return fights
}

// CharacterActivityChange updates live fight state based on character activity changes.
// Call this after Characters.Process returns true (activity changed).
func (c *Common) CharacterActivityChange() error {
	if c.currentFight == nil {
		c.currentFight = &OngoingFight{
			ActiveHostiles: make(map[guid.GUID]struct{}),
			damage:         make([]*chronicleproto.Damage, 0),
			Start:          nil,
			End:            nil,
		}
	}

	// First handle the start time
	activeTotal := 0
	var latestEnd *period.Moment
	for _, char := range c.Characters.All.Map() {
		if info := c.IdentifyUnit(char.ID()); !info.Hostile {
			// Only consider hostile characters for fights
			continue
		}

		pd, ok := char.CurrentPeriod()
		if !ok {
			continue
		}

		if pd.IsActive() {
			// If the character is active, update the fight start time if needed.
			activeTotal++
			c.currentFight.ActiveHostiles[char.ID()] = struct{}{}

			if c.currentFight.Start == nil {
				c.currentFight.Start = pd.Start
			} else if c.currentFight.Start.Timestamp.Date().After(pd.Start.Timestamp.Date()) {
				c.currentFight.Start = pd.Start
			}
		}

		if !pd.IsActive() {
			// If the character is no longer active, check if they were part of the fight
			if _, inFight := c.currentFight.ActiveHostiles[char.ID()]; !inFight {
				// If the character is not part of the fight, then skip
				continue
			}

			// If the latestEnd is not yet set, we still are trying to find it.
			if latestEnd == nil {
				latestEnd = pd.End
			} else if pd.End != nil && latestEnd.Timestamp.Date().Before(pd.End.Timestamp.Date()) {
				latestEnd = pd.End
			}
		}
	}

	if c.currentFight.Start == nil {
		// No active characters in the fight
		return nil
	}

	// Now handle the end time
	if activeTotal == 0 {
		c.currentFight.End = latestEnd
		err := c.finalizeFight()
		if err != nil {
			return fmt.Errorf("finalizing fight: %w", err)
		}
	}
	return nil
}

func (c *Common) finalizeFight() error {
	fight := Fight{
		Hostiles: map[guid.GUID]CharacterFight{},
		Start:    c.currentFight.Start.Timestamp.Date(),
		End:      c.currentFight.End.Timestamp.Date(),
		damage:   c.currentFight.damage,
	}

	for id := range c.currentFight.ActiveHostiles {
		char, ok := c.Characters.Get(id)
		if !ok {
			return fmt.Errorf("could not find character for hostile %s", id)
		}

		during, err := period.PeriodsDuring(char.Periods(), fight.Start, fight.End)
		if err != nil {
			return fmt.Errorf("getting periods during fight for character %s: %w", id, err)
		}

		fight.Hostiles[id] = CharacterFight{
			ID:       id,
			Activity: during,
		}
	}

	c.currentFight = nil
	// End the fight
	c.completedFights = append(c.completedFights, fight)
	return nil
}

func CustomMarshal(dmgs []*chronicleproto.Damage) ([]byte, error) {
	var buf bytes.Buffer
	for _, d := range dmgs {
		err := CustomMarshalSingle(d, &buf)
		if err != nil {
			return nil, err
		}
	}

	return buf.Bytes(), nil
}

func CustomMarshalSingle(dmg *chronicleproto.Damage, buf *bytes.Buffer) error {
	endian := binary.LittleEndian

	err := binary.Write(buf, endian, dmg.OffsetMilli)
	if err != nil {
		return err
	}

	err = binary.Write(buf, endian, dmg.Caster != nil)
	if err != nil {
		return err
	}

	if dmg.Caster != nil {
		_, err = buf.WriteString(*dmg.Caster)
		if err != nil {
			return err
		}
	}

	err = binary.Write(buf, endian, dmg.SpellName != nil)
	if err != nil {
		return err
	}
	if dmg.SpellName != nil {
		_, err = buf.WriteString(*dmg.SpellName)
		if err != nil {
			return err
		}
	}

	_, err = buf.WriteString(dmg.Target)
	if err != nil {
		return err
	}

	err = binary.Write(buf, endian, uint32(dmg.HitType))
	if err != nil {
		return err
	}

	err = binary.Write(buf, endian, dmg.Amount)
	if err != nil {
		return err
	}

	err = binary.Write(buf, endian, uint32(dmg.School))
	if err != nil {
		return err
	}

	err = binary.Write(buf, endian, uint32(len(dmg.Tailers)))
	if err != nil {
		return err
	}

	for _, t := range dmg.Tailers {
		err = binary.Write(buf, endian, t.Amount != nil)
		if err != nil {
			return err
		}

		if t.Amount != nil {
			err = binary.Write(buf, endian, *t.Amount)
			if err != nil {
				return err
			}
		}

		err = binary.Write(buf, endian, uint32(t.HitType))
		if err != nil {
			return err
		}
	}

	return nil
}
