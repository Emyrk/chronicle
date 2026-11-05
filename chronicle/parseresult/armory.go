package parseresult

import (
	"fmt"
	"time"

	"github.com/Emyrk/chronicle/api/db2sdk"
	"github.com/Emyrk/chronicle/combatlog/parser/common/armory"
)

// ArmoryObservation preserves the inputs to guild and player upserts. Guild
// names are pre-rename observations: the primary must apply realm/time-based
// guild renames before upserting, as the legacy worker does. Item metadata
// (including name fallback, icon, quality and item level), average item level,
// gear-history eligibility, realm/dataset/instance IDs and guild creation
// timestamps are write-time decisions, not serialized observations. Player
// gear includes only fields read by Insert; suffixes, temporary enchants,
// bonus IDs and modern combatant statistics are intentionally omitted.
type ArmoryObservation struct {
	Guilds           []ObservedGuild  `json:"guilds"`
	ParticipantCount int              `json:"participant_count"`
	Players          []ObservedPlayer `json:"players"`
}

type ObservedGuild struct {
	Name    string   `json:"name"`
	Members []string `json:"members"`
}

type ObservedPlayer struct {
	GUID      string           `json:"guid"`
	Name      string           `json:"name"`
	GuildName string           `json:"guild_name"`
	Class     string           `json:"class"`
	Gender    string           `json:"gender"`
	Race      string           `json:"race"`
	Seen      time.Time        `json:"seen"`
	Level     int16            `json:"level"`
	Gear      []ObservedGear   `json:"gear"`
	Talents   *ObservedTalents `json:"talents"`
}

type ObservedGear struct {
	ItemID        int32    `json:"item_id"`
	Name          string   `json:"name"`
	EnchantID     *int32   `json:"enchant_id"`
	TransmogID    *int32   `json:"transmog_id"`
	GemEnchantIDs [4]int32 `json:"gem_enchant_ids"`
}

type ObservedTalents struct {
	Tabs [3]ObservedTalentTab `json:"tabs"`
}

type ObservedTalentTab struct {
	Name        string `json:"name"`
	PointsSpent int    `json:"points_spent"`
	Ranks       string `json:"ranks"`
}

func buildArmory(snapshot armory.Observation) (ArmoryObservation, error) {
	out := ArmoryObservation{ParticipantCount: snapshot.ParticipantCount}
	for _, guild := range snapshot.Guilds {
		members := make([]string, 0, len(guild.Members))
		for _, id := range guild.Members {
			members = append(members, id.String())
		}
		out.Guilds = append(out.Guilds, ObservedGuild{Name: guild.Name, Members: members})
	}
	for _, player := range snapshot.Players {
		// Insert indexes a fixed 19-slot outfit. Reject malformed input rather
		// than emit a payload that would panic when replayed.
		if len(player.Gear) > 19 {
			return ArmoryObservation{}, fmt.Errorf("player %s has %d gear slots (max 19)", player.GUID, len(player.Gear))
		}
		obs := ObservedPlayer{GUID: player.GUID.String(), Name: player.Name, GuildName: player.GuildName,
			Class: string(db2sdk.HeroClassToDB(player.HeroClass)), Gender: string(db2sdk.HeroGenderToDB(player.Gender)),
			Race: string(db2sdk.HeroRaceToDB(player.Race)), Seen: player.Seen, Level: player.Level}
		for _, gear := range player.Gear {
			obs.Gear = append(obs.Gear, ObservedGear{ItemID: gear.ItemID, Name: gear.Name,
				EnchantID: gear.EnchantID, TransmogID: gear.TransmogID, GemEnchantIDs: gear.GemEnchantIDs})
		}
		if player.Talents != nil {
			obs.Talents = &ObservedTalents{}
			for i, ranks := range player.Talents.Trees {
				digits := make([]byte, len(ranks))
				for j, rank := range ranks {
					digits[j] = '0' + rank
				}
				obs.Talents.Tabs[i] = ObservedTalentTab{Name: player.Talents.TabNames[i],
					PointsSpent: int(player.Talents.Summary[i]), Ranks: string(digits)}
			}
		}
		out.Players = append(out.Players, obs)
	}
	return out, nil
}
