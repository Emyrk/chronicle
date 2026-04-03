package armory

import (
	"context"
	"fmt"
	"time"

	"github.com/Emyrk/chronicle/api/db2sdk"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters/instances/instancehook"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/unitdb"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/internal/ptr"
	"github.com/google/uuid"
)

var _ instancehook.Hook = (*Tracker)(nil)

type Tracker struct {
	instancehook.BaseHook

	Guilds      map[string]map[guid.GUID]struct{}
	Participant map[guid.GUID]struct{}
	Players     map[guid.GUID]combatant.Combatant
}

func New() *Tracker {
	return &Tracker{
		Guilds:      make(map[string]map[guid.GUID]struct{}),
		Participant: make(map[guid.GUID]struct{}),
		Players:     make(map[guid.GUID]combatant.Combatant),
	}
}

func (g *Tracker) Insert(ctx context.Context, udb *unitdb.Units, instanceID uuid.UUID, realmID uuid.UUID, tx *authz.AuthzTX) (*database.Guild, error) {
	guildIDs := make(map[string]uuid.UUID)
	mostGuildPlayers := 0
	var guildWithMostPlayers *database.Guild
	for name, players := range g.Guilds {
		insertedGuild, err := tx.UpsertGuild(ctx, database.UpsertGuildParams{
			RealmID:   realmID,
			Name:      name,
			CreatedAt: database.Timestamptz(time.Now()),
		})
		if err != nil {
			return nil, fmt.Errorf("upsert guild: %w", err)
		}

		// This should never not be the case, but just in case.
		if insertedGuild.RealmID == realmID {
			guildIDs[name] = insertedGuild.ID
		}

		if len(players) > mostGuildPlayers {
			mostGuildPlayers = len(players)
			guildWithMostPlayers = &insertedGuild
		}
	}

	// Collect unique item IDs and names for batch metadata fetch.
	// Names are used as fallback for transmog IDs that don't exist in the item table.
	itemIDSet := make(map[int32]struct{})
	itemIDList := make([]int32, 0)
	itemNameList := make([]string, 0)
	for _, player := range g.Players {
		for _, item := range player.GearSetups {
			if item.ItemID > 0 {
				if _, exists := itemIDSet[int32(item.ItemID)]; !exists {
					itemIDList = append(itemIDList, int32(item.ItemID))
					itemNameList = append(itemNameList, item.Name)
				}
				itemIDSet[int32(item.ItemID)] = struct{}{}
			}
		}
	}

	itemMeta := make(map[int32]database.GetItemTemplateMetadataBatchRow)
	itemMetaByName := make(map[string]database.GetItemTemplateMetadataBatchRow)
	if len(itemIDSet) > 0 {
		rows, err := tx.GetItemTemplateMetadataBatch(ctx, database.GetItemTemplateMetadataBatchParams{
			ItemIds:   itemIDList,
			ItemNames: itemNameList,
		})
		if err != nil {
			return nil, fmt.Errorf("get item metadata: %w", err)
		}
		for _, row := range rows {
			itemMeta[row.Entry] = row
			itemMetaByName[row.Name] = row
		}
	}

	inserts := make([]database.UpsertPlayersParams, 0, len(g.Players))
	for _, player := range g.Players {
		guildID := uuid.Nil
		if player.Guild != nil {
			guildID = guildIDs[player.Guild.Name]
		}

		var dbGear database.PlayerOutfit
		for i, item := range player.GearSetups {
			dbGear[i] = database.PlayerGear{
				ItemID: int32(item.ItemID),
			}
			if item.EnchantID != nil {
				dbGear[i].EnchantID = ptr.Ref(int32(*item.EnchantID))
			}
			if meta, ok := itemMeta[int32(item.ItemID)]; ok {
				dbGear[i].ItemName = meta.Name
				dbGear[i].ItemQuality = meta.Quality
				dbGear[i].ItemIcon = meta.Icon
				dbGear[i].ItemID = meta.Entry
			} else if meta, ok := itemMetaByName[item.Name]; ok && meta.Name != "" {
				dbGear[i].ItemName = meta.Name
				dbGear[i].ItemQuality = meta.Quality
				dbGear[i].ItemIcon = meta.Icon
				dbGear[i].ItemID = meta.Entry
			}
		}

		var level int16
		info, ok := udb.Get(player.Guid)
		if ok {
			level = int16(info.Level)
		}

		inserts = append(inserts, database.UpsertPlayersParams{
			ID:      player.Guid,
			RealmID: realmID,
			Name:    player.Name,
			GuildID: uuid.NullUUID{
				UUID:  guildID,
				Valid: guildID != uuid.Nil,
			},
			Class:  db2sdk.HeroClassToDB(player.HeroClass),
			Gender: db2sdk.HeroGenderToDB(player.Gender),
			Race:   db2sdk.HeroRaceToDB(player.Race),
			Gear:   dbGear,
			Level:  level,
			UpdatedFromInstance: uuid.NullUUID{
				UUID:  instanceID,
				Valid: instanceID != uuid.Nil,
			},
			UpdatedAt: database.Timestamptz(player.Seen),
		})
	}

	res := tx.UpsertPlayers(ctx, inserts)
	if err := res.Close(); err != nil {
		return nil, fmt.Errorf("closing upsert players batch: %w", err)
	}

	if mostGuildPlayers > len(g.Participant)/2 && guildWithMostPlayers != nil {
		return guildWithMostPlayers, nil
	}
	return nil, nil
}

func (g *Tracker) Finalize(ctx context.Context) error {
	return nil
}

func (g *Tracker) ProcessMessage(active bool, encounterID uuid.UUID, msg messages.Message) error {
	switch ty := msg.(type) {
	case *messages.Damage:
		if !active {
			return nil
		}
		if ty.Caster != nil && (*ty.Caster).IsPlayer() {
			g.Participant[*ty.Caster] = struct{}{}
		}
	case *messages.Heal:
		if !active {
			return nil
		}
		if ty.Caster.IsPlayer() {
			g.Participant[ty.Caster] = struct{}{}
		}
	case *messages.Combatant:
		g.Guild(ty)
		g.Player(ty)
	}

	return nil
}

func (g *Tracker) Guild(msg *messages.Combatant) {
	if msg.Guild == nil {
		return
	}
	if msg.Guid.IsZero() || !msg.Guid.IsPlayer() {
		return
	}
	if msg.Guild.Name == "" {
		return
	}
	if _, ok := g.Participant[msg.Guid]; !ok {
		return
	}
	if _, ok := g.Guilds[msg.Guild.Name]; !ok {
		g.Guilds[msg.Guild.Name] = make(map[guid.GUID]struct{})
	}
	g.Guilds[msg.Guild.Name][msg.Guid] = struct{}{}
}

func (g *Tracker) Player(msg *messages.Combatant) {
	gid := msg.Guid
	if gid.IsZero() || !gid.IsPlayer() {
		return
	}
	g.Players[msg.Guid] = msg.Combatant
}
