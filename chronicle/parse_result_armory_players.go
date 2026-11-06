package chronicle

import (
	"context"
	"fmt"
	"slices"
	"time"

	"github.com/Emyrk/chronicle/chronicle/parseresult"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/guildrenames"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

// ParsedArmoryWrite contains primary-side inputs that are not parser observations.
// The caller owns the transaction and parse-generation fence. Pass an authz
// backed store when guild relationships must be published.
type ParsedArmoryWrite struct {
	RealmID       uuid.UUID
	RealmName     string
	DatasetID     uuid.UUID
	InstanceID    uuid.UUID
	InstanceStart time.Time
	Unlisted      bool
}

// InsertParsedArmory persists guilds, players, gear and gear history from a
// finalized observation. It does not insert per-instance participation rows.
// Call within the same transaction as the instance insert; for unlisted logs
// instance provenance and gear history are deliberately omitted.
func InsertParsedArmory(ctx context.Context, store database.Store, observation parseresult.ArmoryObservation, write ParsedArmoryWrite) (*database.Guild, error) {
	type parsedPlayer struct {
		id          guid.GUID
		observation parseresult.ObservedPlayer
	}
	players := make([]parsedPlayer, 0, len(observation.Players))
	seen := make(map[guid.GUID]struct{}, len(observation.Players))
	for _, player := range observation.Players {
		id, err := guid.FromString(player.GUID)
		if err != nil || id.IsZero() || !id.IsPlayer() {
			return nil, fmt.Errorf("invalid player GUID %q: %v", player.GUID, err)
		}
		if _, exists := seen[id]; exists {
			return nil, fmt.Errorf("duplicate player GUID %s", player.GUID)
		}
		seen[id] = struct{}{}
		if len(player.Gear) > 19 {
			return nil, fmt.Errorf("player %s has %d gear slots (max 19)", player.GUID, len(player.Gear))
		}
		if !database.WowPlayableClass(player.Class).Valid() || !database.WowPlayableGender(player.Gender).Valid() || !database.WowPlayableRace(player.Race).Valid() {
			return nil, fmt.Errorf("invalid class, gender or race for player %s", player.GUID)
		}
		players = append(players, parsedPlayer{id: id, observation: player})
	}
	slices.SortFunc(players, func(a, b parsedPlayer) int {
		if a.id < b.id {
			return -1
		}
		if a.id > b.id {
			return 1
		}
		return 0
	})
	guildIDs, majority, err := insertParsedGuildsWithIDs(ctx, store, write.RealmID, write.RealmName, write.InstanceStart, observation)
	if err != nil {
		return nil, err
	}

	itemIDs, itemNames := make([]int32, 0), make([]string, 0)
	itemSeen := make(map[int32]struct{})
	for _, player := range players {
		for _, item := range player.observation.Gear {
			if item.ItemID <= 0 {
				continue
			}
			if _, ok := itemSeen[item.ItemID]; ok {
				continue
			}
			itemSeen[item.ItemID] = struct{}{}
			itemIDs = append(itemIDs, item.ItemID)
			itemNames = append(itemNames, item.Name)
		}
	}
	itemMeta := make(map[int32]database.GetItemTemplateMetadataBatchRow)
	itemMetaByName := make(map[string]database.GetItemTemplateMetadataBatchRow)
	if len(itemIDs) != 0 {
		rows, err := store.GetItemTemplateMetadataBatch(ctx, database.GetItemTemplateMetadataBatchParams{DatasetID: write.DatasetID, ItemIds: itemIDs, ItemNames: itemNames})
		if err != nil {
			return nil, fmt.Errorf("get item metadata: %w", err)
		}
		for _, row := range rows {
			itemMeta[row.Entry] = row
			itemMetaByName[row.Name] = row
		}
	}
	provenance := armoryProvenanceInstanceID(write.InstanceID, write.Unlisted)
	inserts := make([]database.UpsertPlayersParams, 0, len(players))
	history := make([]database.UpsertPlayerGearHistoryParams, 0, len(players))
	for _, parsed := range players {
		player := parsed.observation
		guildName := player.GuildName
		if !write.InstanceStart.IsZero() {
			guildName = guildrenames.Resolve(write.RealmName, write.InstanceStart, guildName)
		}
		guildID := guildIDs[guildName]
		var outfit database.PlayerOutfit
		hasGear := false
		for i, item := range player.Gear {
			hasGear = hasGear || item.ItemID != 0
			gear := database.PlayerGear{ItemID: item.ItemID, EnchantID: item.EnchantID, TransmogID: item.TransmogID}
			if item.GemEnchantIDs != [4]int32{} {
				gear.GemEnchantIDs = item.GemEnchantIDs[:]
			}
			meta, ok := itemMeta[item.ItemID]
			if !ok {
				meta, ok = itemMetaByName[item.Name]
				ok = ok && meta.Name != ""
			}
			if ok {
				gear.ItemName = meta.Name
				gear.ItemQuality = meta.Quality
				gear.ItemIcon = meta.Icon
				gear.ItemID = meta.Entry
				gear.ItemLevel = &meta.ItemLevel
			}
			outfit[i] = gear
		}
		var gearPtr *database.PlayerOutfit
		if hasGear {
			gearPtr = &outfit
		}
		if hasGear && provenance != uuid.Nil {
			history = append(history, database.UpsertPlayerGearHistoryParams{PlayerID: parsed.id, RealmID: write.RealmID,
				InstanceID: provenance, Gear: outfit, AvgIlvl: parsedAverageItemLevel(outfit), EquippedAt: database.Timestamptz(player.Seen)})
		}
		var talents *database.PlayerTalents
		if player.Talents != nil {
			talents = &database.PlayerTalents{}
			for i, tab := range player.Talents.Tabs {
				talents.Trees[i] = database.PlayerTalentTab{TabName: tab.Name, PointsSpent: tab.PointsSpent, Ranks: tab.Ranks}
			}
		}
		inserts = append(inserts, database.UpsertPlayersParams{ID: parsed.id, RealmID: write.RealmID, Name: player.Name,
			GuildID: uuid.NullUUID{UUID: guildID, Valid: guildID != uuid.Nil},
			Class:   database.WowPlayableClass(player.Class), Gender: database.WowPlayableGender(player.Gender), Race: database.WowPlayableRace(player.Race),
			Gear: gearPtr, Level: player.Level, Talents: talents,
			UpdatedFromInstance: uuid.NullUUID{UUID: provenance, Valid: provenance != uuid.Nil}, UpdatedAt: database.Timestamptz(player.Seen)})
	}
	if err := store.UpsertPlayers(ctx, inserts).Close(); err != nil {
		return nil, fmt.Errorf("closing upsert players batch: %w", err)
	}
	if len(history) > 0 {
		if err := store.UpsertPlayerGearHistory(ctx, history).Close(); err != nil {
			return nil, fmt.Errorf("closing upsert gear history batch: %w", err)
		}
	}
	return majority, nil
}

// Match the legacy outfit average: only known item levels on equipped slots
// contribute, excluding shirt (3) and tabard (18).
func parsedAverageItemLevel(outfit database.PlayerOutfit) pgtype.Float4 {
	var sum, count int32
	for i, item := range outfit {
		if i == 3 || i == 18 || item.ItemID == 0 || item.ItemLevel == nil {
			continue
		}
		sum += *item.ItemLevel
		count++
	}
	if count == 0 {
		return pgtype.Float4{}
	}
	return pgtype.Float4{Float32: float32(sum) / float32(count), Valid: true}
}
