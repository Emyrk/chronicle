package parseresult

import (
	"encoding/json"
	"fmt"
	"reflect"
	"sort"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/vehicles"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/unitname"
	"github.com/Emyrk/chronicle/database/jsontransform"
)

// CoreInstance is the parser-derived portion of an instance row. Realm IDs,
// slugs, guild ID, invalidation, and parser version are write-time inputs.
type CoreInstance struct {
	Category          string            `json:"category"`
	DifficultyName    string            `json:"difficulty_name"`
	MaxPlayers        int32             `json:"max_players"`
	DynamicDifficulty int32             `json:"dynamic_difficulty"`
	Start             time.Time         `json:"start"`
	End               time.Time         `json:"end"`
	Capabilities      []string          `json:"capabilities"`
	VehicleMetadata   vehicles.Metadata `json:"vehicle_metadata"`
}

type Overview struct {
	RequirementsComplete       *bool                   `json:"requirements_complete"`
	PlayerDeaths               int32                   `json:"player_deaths"`
	WipeCount                  int32                   `json:"wipe_count"`
	TopIncomingDamageAbilities []IncomingDamageAbility `json:"top_incoming_damage_abilities"`
	EncounterSpanDurationMs    int64                   `json:"encounter_span_duration_ms"`
	TotalCombatDurationMs      int64                   `json:"total_combat_duration_ms"`
	TotalBossDurationMs        int64                   `json:"total_boss_duration_ms"`
	MetricsVersion             int32                   `json:"metrics_version"`
}

type IncomingDamageAbility struct {
	SpellID         *int32 `json:"spell_id"`
	Name            string `json:"name"`
	Damage          int64  `json:"damage"`
	Hits            int64  `json:"hits"`
	EnvironmentType string `json:"environment_type"`
}

type Fight struct {
	GUID    string        `json:"guid"`
	Boss    bool          `json:"boss"`
	Periods []FightPeriod `json:"periods"`
}

type FightPeriod struct {
	Start      *FightMoment `json:"start"`
	End        *FightMoment `json:"end"`
	LastActive *FightMoment `json:"last_active"`
	EndState   string       `json:"end_state"`
}

type FightMoment struct {
	Timestamp   time.Time       `json:"timestamp"`
	Reason      string          `json:"reason"`
	MessageType string          `json:"message_type"`
	Message     json.RawMessage `json:"message"`
}

type Phase struct {
	ID            string `json:"id"`
	Key           string `json:"key"`
	Name          string `json:"name"`
	Order         int32  `json:"order"`
	StartOffsetMs int64  `json:"start_offset_ms"`
	EndOffsetMs   int64  `json:"end_offset_ms"`
	KillType      string `json:"kill_type"`
}

type RaidSnapshot struct {
	EncounterID *string   `json:"encounter_id"`
	ObservedAt  time.Time `json:"observed_at"`
	// The 8x5 matrix uses string GUIDs in the same arrangement as the DB JSON.
	Composition [8][5]string `json:"composition"`
}

// UnitMetadata is limited to IDs the writer marks seen or participating.
// HasPlayerData distinguishes a guild participant with combatant metadata
// from one the legacy writer would omit from instance_players.
type UnitMetadata struct {
	GUID          string  `json:"guid"`
	Name          string  `json:"name"`
	Entry         uint32  `json:"entry"`
	OwnerGUID     *string `json:"owner_guid"`
	Player        bool    `json:"player"`
	Participating bool    `json:"participating"`
	HasPlayerData bool    `json:"has_player_data"`
	PlayerName    string  `json:"player_name"`
	PlayerLevel   int32   `json:"player_level"`
	PlayerClass   string  `json:"player_class"`
	PlayerRace    string  `json:"player_race"`
}

func buildCore(in Input, out *Result) error {
	fin := in.Finalized
	out.Core = CoreInstance{
		Category: in.Category, DifficultyName: in.DifficultyName,
		MaxPlayers: in.MaxPlayers, DynamicDifficulty: in.DynamicDifficulty,
		Capabilities: append([]string(nil), in.Capabilities...),
	}
	// Vehicle metadata has slices and optional GUID pointers. JSON cloning keeps
	// this boundary independent of parser-side mutable tracker state.
	vehicleJSON, err := json.Marshal(fin.VehicleMetadata)
	if err != nil {
		return fmt.Errorf("marshal vehicle metadata: %w", err)
	}
	if err := json.Unmarshal(vehicleJSON, &out.Core.VehicleMetadata); err != nil {
		return fmt.Errorf("clone vehicle metadata: %w", err)
	}
	for _, enc := range fin.Encounters {
		if out.Core.Start.IsZero() || enc.Combat.Start.Before(out.Core.Start) {
			out.Core.Start = enc.Combat.Start
		}
		if out.Core.End.IsZero() || enc.Combat.End.After(out.Core.End) {
			out.Core.End = enc.Combat.End
		}
	}
	summary := fin.Overview
	out.Overview = Overview{
		PlayerDeaths: summary.PlayerDeaths, WipeCount: summary.WipeCount,
		EncounterSpanDurationMs:    summary.EncounterSpanDuration.Milliseconds(),
		TotalCombatDurationMs:      summary.TotalCombatDuration.Milliseconds(),
		TotalBossDurationMs:        summary.TotalBossDuration.Milliseconds(),
		MetricsVersion:             summary.MetricsVersion,
		TopIncomingDamageAbilities: make([]IncomingDamageAbility, 0, len(summary.TopIncomingDamageAbilities)),
	}
	if summary.RequirementsComplete != nil {
		value := *summary.RequirementsComplete
		out.Overview.RequirementsComplete = &value
	}
	for _, ability := range summary.TopIncomingDamageAbilities {
		item := IncomingDamageAbility{Name: ability.Name, Damage: ability.Damage, Hits: ability.Hits, EnvironmentType: ability.EnvironmentType}
		if ability.SpellID != nil {
			id := *ability.SpellID
			item.SpellID = &id
		}
		out.Overview.TopIncomingDamageAbilities = append(out.Overview.TopIncomingDamageAbilities, item)
	}
	out.RaidSnapshots = make([]RaidSnapshot, 0, len(fin.RaidGroupSnapshots))
	for _, snapshot := range fin.RaidGroupSnapshots {
		item := RaidSnapshot{ObservedAt: snapshot.ObservedAt}
		if snapshot.EncounterID != nil {
			id := snapshot.EncounterID.String()
			item.EncounterID = &id
		}
		for group := range item.Composition {
			for member := range item.Composition[group] {
				item.Composition[group][member] = snapshot.Composition[group][member].String()
			}
		}
		out.RaidSnapshots = append(out.RaidSnapshots, item)
	}
	return buildUnits(in, out)
}

func buildMoment(moment *period.Moment) (*FightMoment, error) {
	if moment == nil {
		return nil, nil
	}
	message, err := jsontransform.MarshalForStorage(moment.Timestamp)
	if err != nil {
		return nil, fmt.Errorf("encode fight moment: %w", err)
	}
	return &FightMoment{Timestamp: moment.Timestamp.Date(), Reason: moment.String(), MessageType: reflect.TypeOf(moment.Timestamp).String(), Message: message}, nil
}

func buildFightPeriod(p period.Period) (FightPeriod, error) {
	out := FightPeriod{EndState: string(p.EndState)}
	var err error
	if out.Start, err = buildMoment(p.Start); err != nil {
		return out, err
	}
	if out.End, err = buildMoment(p.End); err != nil {
		return out, err
	}
	if out.LastActive, err = buildMoment(p.LastActive); err != nil {
		return out, err
	}
	return out, nil
}

func buildUnits(in Input, out *Result) error {
	fin := in.Finalized
	seen := map[guid.GUID]struct{}{}
	if fin.Participants != nil {
		for id := range fin.Participants.Active {
			seen[id] = struct{}{}
		}
	}
	for _, id := range fin.PersistedUnits {
		seen[id] = struct{}{}
	}
	if fin.Guilds != nil {
		for id := range fin.Guilds.Participant {
			seen[id] = struct{}{}
		}
	}
	for _, enc := range fin.Encounters {
		for id := range enc.Combat.Hostiles {
			seen[id] = struct{}{}
		}
	}
	out.Units = make([]UnitMetadata, 0, len(seen))
	if len(seen) > 0 && in.Units == nil {
		return fmt.Errorf("unit database required for observed units")
	}
	for id := range seen {
		if id == 0 {
			continue
		}
		entry, _ := id.GetEntry()
		item := UnitMetadata{GUID: id.String(), Entry: entry, Player: id.IsPlayer()}
		if fin.Guilds != nil {
			_, item.Participating = fin.Guilds.Participant[id]
		}
		if !item.Player {
			item.Name = unitname.ByGUID(id)
		} else {
			item.Name = "Unknown Player"
		}
		if info, ok := in.Units.Get(id); ok {
			if info.Name != "" {
				item.Name = info.Name
			}
			if info.Owner != nil {
				owner := info.Owner.String()
				item.OwnerGUID = &owner
			}
		}
		if player, ok := in.Units.GetPlayer(id); ok {
			if player.Name != "" {
				item.Name = player.Name
			}
			item.HasPlayerData = true
			item.PlayerName = player.Name
			item.PlayerClass = string(player.HeroClass)
			item.PlayerRace = string(player.Race)
			if info, ok := in.Units.Get(id); ok {
				item.PlayerLevel = info.Level
			}
			if player.Level != nil && *player.Level > 0 {
				item.PlayerLevel = *player.Level
			}
		}
		out.Units = append(out.Units, item)
	}
	sort.Slice(out.Units, func(i, j int) bool { return out.Units[i].GUID < out.Units[j].GUID })
	return nil
}
