package armory

import (
	"context"
	"fmt"
	"slices"
	"time"

	"github.com/Emyrk/chronicle/api/db2sdk"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/instancehook"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/internal/ptr"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

var _ instancehook.Hook = (*Tracker)(nil)

type pendingTalent struct {
	name    string
	talents *combatant.Talents
}

// respecSpellID is the Turtle WoW goblin respec spell.
// When a player casts this, their talent data is invalidated until a new
// COMBATANT_INFO message arrives with fresh talents.
const respecSpellID = 57734

type Tracker struct {
	instancehook.BaseHook

	units          *unitdb.Units
	Guilds         map[string]map[guid.GUID]struct{}
	Participant    map[guid.GUID]struct{}
	Players        map[guid.GUID]combatant.Combatant
	ByName         map[string]guid.GUID
	PendingTalents map[guid.GUID]pendingTalent
	// InvalidatedTalents tracks players who have respecced but haven't yet
	// received a fresh COMBATANT_INFO. Their Talents field is set to nil
	// so downstream consumers (DPS rankings) see "Unknown" spec.
	InvalidatedTalents map[guid.GUID]struct{}

	PlayerLevel map[guid.GUID]int32
}

func New(units *unitdb.Units) *Tracker {
	return &Tracker{
		units:              units,
		Guilds:             make(map[string]map[guid.GUID]struct{}),
		Participant:        make(map[guid.GUID]struct{}),
		Players:            make(map[guid.GUID]combatant.Combatant),
		ByName:             make(map[string]guid.GUID),
		PendingTalents:     make(map[guid.GUID]pendingTalent),
		InvalidatedTalents: make(map[guid.GUID]struct{}),
		PlayerLevel:        make(map[guid.GUID]int32),
	}
}

func (g *Tracker) Insert(ctx context.Context, udb *unitdb.Units, instanceID uuid.UUID, realmID uuid.UUID, datasetID uuid.UUID, tx *authz.AuthzTX) (*database.Guild, error) {
	guildIDs := make(map[string]uuid.UUID)
	mostGuildPlayers := 0
	var guildWithMostPlayers *database.Guild

	// Acquire row locks in a stable order across parser workers and processes.
	// Random map iteration can otherwise deadlock two transactions that share
	// multiple guilds or players but upsert them in opposite orders.
	guildNames := sortedGuildNames(g.Guilds)
	playerGUIDs := sortedPlayerGUIDs(g.Players)

	for _, name := range guildNames {
		players := g.Guilds[name]
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
	for _, playerGUID := range playerGUIDs {
		player := g.Players[playerGUID]
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
			DatasetID: datasetID,
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
	gearHistory := make([]database.UpsertPlayerGearHistoryParams, 0, len(g.Players))
	for _, playerGUID := range playerGUIDs {
		player := g.Players[playerGUID]
		guildID := uuid.Nil
		if player.Guild != nil {
			guildID = guildIDs[player.Guild.Name]
		}

		var dbGear database.PlayerOutfit
		hasGear := false
		for i, item := range player.GearSetups {
			hasGear = hasGear || item.ItemID != 0
			dbGear[i] = database.PlayerGear{
				ItemID:        int32(item.ItemID),
				GemEnchantIDs: optionalGemEnchantIDs(item.GemEnchantIDs),
			}
			if item.EnchantID != nil {
				dbGear[i].EnchantID = ptr.Ref(int32(*item.EnchantID))
			}
			if item.TransmogID != nil {
				dbGear[i].TransmogID = ptr.Ref(int32(*item.TransmogID))
			}
			if meta, ok := itemMeta[int32(item.ItemID)]; ok {
				dbGear[i].ItemName = meta.Name
				dbGear[i].ItemQuality = meta.Quality
				dbGear[i].ItemIcon = meta.Icon
				dbGear[i].ItemID = meta.Entry
				dbGear[i].ItemLevel = ptr.Ref(meta.ItemLevel)
			} else if meta, ok := itemMetaByName[item.Name]; ok && meta.Name != "" {
				dbGear[i].ItemName = meta.Name
				dbGear[i].ItemQuality = meta.Quality
				dbGear[i].ItemIcon = meta.Icon
				dbGear[i].ItemID = meta.Entry
				dbGear[i].ItemLevel = ptr.Ref(meta.ItemLevel)
			}
		}

		var level int16
		info, ok := udb.Get(player.Guid)
		if ok {
			level = int16(info.Level)
		}

		var dbTalents *database.PlayerTalents

		var gearPtr *database.PlayerOutfit
		if hasGear {
			gearPtr = &dbGear
		}

		if hasGear && instanceID != uuid.Nil {
			gearHistory = append(gearHistory, database.UpsertPlayerGearHistoryParams{
				PlayerID:   player.Guid,
				RealmID:    realmID,
				InstanceID: instanceID,
				Gear:       dbGear,
				AvgIlvl:    averageItemLevel(dbGear),
				EquippedAt: database.Timestamptz(player.Seen),
			})
		}

		if player.Talents != nil {
			dbTalents = &database.PlayerTalents{}
			for i := 0; i < 3 && i < len(player.Talents.Trees); i++ {
				ranks := make([]byte, len(player.Talents.Trees[i]))
				for j, r := range player.Talents.Trees[i] {
					ranks[j] = '0' + r
				}
				dbTalents.Trees[i] = database.PlayerTalentTab{
					TabName:     player.Talents.TabNames[i],
					PointsSpent: int(player.Talents.Summary[i]),
					Ranks:       string(ranks),
				}
			}
		}

		inserts = append(inserts, database.UpsertPlayersParams{
			ID:      player.Guid,
			RealmID: realmID,
			Name:    player.Name,
			GuildID: uuid.NullUUID{
				UUID:  guildID,
				Valid: guildID != uuid.Nil,
			},
			Class:   db2sdk.HeroClassToDB(player.HeroClass),
			Gender:  db2sdk.HeroGenderToDB(player.Gender),
			Race:    db2sdk.HeroRaceToDB(player.Race),
			Gear:    gearPtr,
			Level:   level,
			Talents: dbTalents,
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

	// Gear history rows FK into game_players, so they must be inserted after
	// the players batch commits its upserts.
	if len(gearHistory) > 0 {
		hres := tx.UpsertPlayerGearHistory(ctx, gearHistory)
		if err := hres.Close(); err != nil {
			return nil, fmt.Errorf("closing upsert gear history batch: %w", err)
		}
	}

	if mostGuildPlayers > len(g.Participant)/2 && guildWithMostPlayers != nil {
		return guildWithMostPlayers, nil
	}
	return nil, nil
}

// RenameGuilds canonicalizes guild names before they are persisted. If multiple
// parsed names resolve to the same guild, their member sets are merged.
func (g *Tracker) RenameGuilds(resolve func(string) string) {
	renamedGuilds := make(map[string]map[guid.GUID]struct{}, len(g.Guilds))
	for name, members := range g.Guilds {
		resolvedName := resolve(name)
		resolvedMembers, ok := renamedGuilds[resolvedName]
		if !ok {
			resolvedMembers = make(map[guid.GUID]struct{}, len(members))
			renamedGuilds[resolvedName] = resolvedMembers
		}
		for playerGUID := range members {
			resolvedMembers[playerGUID] = struct{}{}
		}
	}
	g.Guilds = renamedGuilds

	for playerGUID, player := range g.Players {
		if player.Guild == nil {
			continue
		}
		resolvedName := resolve(player.Guild.Name)
		if resolvedName == player.Guild.Name {
			continue
		}
		guild := *player.Guild
		guild.Name = resolvedName
		player.Guild = &guild
		g.Players[playerGUID] = player
	}
}

func sortedGuildNames(guilds map[string]map[guid.GUID]struct{}) []string {
	names := make([]string, 0, len(guilds))
	for name := range guilds {
		names = append(names, name)
	}
	slices.Sort(names)
	return names
}

func sortedPlayerGUIDs(players map[guid.GUID]combatant.Combatant) []guid.GUID {
	guids := make([]guid.GUID, 0, len(players))
	for playerGUID := range players {
		guids = append(guids, playerGUID)
	}
	slices.Sort(guids)
	return guids
}

func optionalGemEnchantIDs(gems [4]int) []int32 {
	if gems == [4]int{} {
		return nil
	}

	ids := make([]int32, len(gems))
	for i, gemID := range gems {
		ids[i] = int32(gemID)
	}
	return ids
}

// Slot indices in a PlayerOutfit that never count toward average item level.
const (
	slotShirt  = 3
	slotTabard = 18
)

// averageItemLevel averages item_level across equipped slots, skipping shirt
// and tabard. Invalid (NULL) when no equipped item has a known item level.
func averageItemLevel(outfit database.PlayerOutfit) pgtype.Float4 {
	var sum, count int32
	for i, item := range outfit {
		if i == slotShirt || i == slotTabard {
			continue
		}
		if item.ItemID == 0 || item.ItemLevel == nil {
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
	case *messages.Unit:
		g.Unit(ty)
	case *messages.Combatant:
		g.Guild(ty)
		g.Player(ty)
		if ty.Talents != nil {
			// Fresh COMBATANT_INFO talent data repairs invalidation.
			delete(g.InvalidatedTalents, ty.Guid)
		}
	case *messages.CombatantTalents:
		g.CombatantTalents(ty)
		// Fresh talent data also repairs invalidation.
		delete(g.InvalidatedTalents, ty.Guid)
	case *messages.SpellGo:
		// Detect respec: when a player casts the goblin respec spell,
		// invalidate their talent data until the next talent update.
		if ty.SpellData != nil && int(ty.SpellData.ID) == respecSpellID && ty.Caster.IsPlayer() {
			g.InvalidatedTalents[ty.Caster] = struct{}{}
			if p, ok := g.Players[ty.Caster]; ok {
				p.Talents = nil
				g.Players[ty.Caster] = p
			}
			g.units.InvalidatePlayerTalents(ty.Caster)
		}
	case *messages.Transmog:
		g.Transmog(ty)
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

	if _, ok := g.Guilds[msg.Guild.Name]; !ok {
		g.Guilds[msg.Guild.Name] = make(map[guid.GUID]struct{})
	}
	g.Guilds[msg.Guild.Name][msg.Guid] = struct{}{}
}

func (g *Tracker) Unit(unit *messages.Unit) {
	if !unit.Guid.IsPlayer() || unit.Level <= 0 {
		return
	}

	g.PlayerLevel[unit.Guid] = unit.Level
	exists, ok := g.Players[unit.Guid]
	if ok && (exists.Level == nil || *exists.Level <= 0) {
		exists.Level = &unit.Level
		g.Players[unit.Guid] = exists
	}
}

func (g *Tracker) Player(msg *messages.Combatant) {
	gid := msg.Guid
	if gid.IsZero() || !gid.IsPlayer() {
		return
	}
	c := msg.Combatant

	// If COMBATANT_TALENTS arrived before COMBATANT_INFO, merge the
	// detailed talent data (which includes tab names) into this player.
	if pending, ok := g.PendingTalents[gid]; ok {
		c.Talents = pending.talents
		delete(g.PendingTalents, gid)
	}

	previous, ok := g.Players[gid]
	if ok {
		c.MergeExisting(previous)
		gearExists := false
		for _, item := range c.GearSetups {
			if item.ItemID != 0 {
				gearExists = true
				break
			}
		}
		if !gearExists {
			c.GearSetups = previous.GearSetups
		}
	}

	if c.Level == nil || *c.Level <= 0 {
		lvl, uok := g.PlayerLevel[gid]
		if uok {
			c.Level = &lvl
		}
	}

	g.Players[gid] = c
	g.ByName[msg.Name] = gid
}

func (g *Tracker) CombatantTalents(msg *messages.CombatantTalents) {
	gid := msg.Guid
	if gid.IsZero() || !gid.IsPlayer() {
		return
	}

	// Build a Talents struct from the detailed tab info
	tls := &combatant.Talents{}
	for i, tab := range msg.Tabs {
		tls.TabNames[i] = tab.TabName
		ranks := make([]uint8, len(tab.RankDigits))
		var sum uint8
		for j, ch := range tab.RankDigits {
			v := uint8(ch - '0')
			ranks[j] = v
			sum += v
		}
		tls.Trees[i] = ranks
		tls.Summary[i] = sum
	}

	// If we already have this player, merge talents in.
	// We only update the Talents field — COMBATANT_TALENTS does not carry
	// class/race/gender/gear, so those must come from COMBATANT_INFO.
	if pl, ok := g.Players[gid]; ok {
		pl.Talents = tls
		g.Players[gid] = pl
		g.units.UpdatePlayerTalents(gid, tls)
		return
	}

	// Player not yet seen via COMBATANT_INFO — store talents keyed by name
	// so they can be merged when COMBATANT_INFO arrives. We don't create a
	// minimal Combatant here because it would lack class/race/gender and
	// could be written to the DB with empty required fields.
	g.PendingTalents[gid] = pendingTalent{
		name:    msg.PlayerName,
		talents: tls,
	}
}

func (g *Tracker) Transmog(msg *messages.Transmog) {
	gid, ok := g.ByName[msg.PlayerName]
	if !ok {
		return
	}

	pl := g.Players[gid]
	for _, item := range msg.Transmogs {
		if item.Slot < 0 || int(item.Slot) >= len(pl.GearSetups) {
			continue
		}

		pl.GearSetups[item.Slot].ItemID = int(item.ItemID)
		pl.GearSetups[item.Slot].TransmogID = ptr.Ref(int(item.TransmogID))
	}
}
