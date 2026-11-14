package armory

import (
	"context"
	"fmt"
	"slices"
	"time"

	"github.com/Emyrk/chronicle/api/db2sdk"
	"github.com/Emyrk/chronicle/combatlog/parser/common/auras"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/instancehook"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
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

// respecAuraSpellID is the Turtle WoW goblin respec debuff.
// When this aura is applied to a player, their talent data is invalidated until
// a fresh talent update arrives.
const respecAuraSpellID = 57734

type Tracker struct {
	instancehook.BaseHook

	units       *unitdb.Units
	Guilds      map[string]map[guid.GUID]struct{}
	Participant map[guid.GUID]struct{}
	// PlayerObservations contains detached per-instance persistence history, not current metadata.
	PlayerObservations map[guid.GUID]combatant.Combatant
	ByName             map[string]guid.GUID
	PendingTalents     map[guid.GUID]pendingTalent
	// InvalidatedTalents tracks players who have respecced but haven't yet
	// received a fresh talent update. Their Talents field is set to nil so
	// downstream consumers (DPS rankings) see "Unknown" spec.
	InvalidatedTalents map[guid.GUID]struct{}
	// observedRespecAura prevents a persistent UNIT_INFO aura snapshot from
	// repeatedly invalidating talents after a fresh talent update repairs them.
	observedRespecAura map[guid.GUID]struct{}
	// invalidatedTalentBuild retains the pre-respec build so repeated stale
	// COMBATANT_INFO messages cannot repair invalidation with the same talents.
	invalidatedTalentBuild map[guid.GUID]*combatant.Talents

	PlayerLevel map[guid.GUID]int32
}

func New(units *unitdb.Units) *Tracker {
	return &Tracker{
		units:                  units,
		Guilds:                 make(map[string]map[guid.GUID]struct{}),
		Participant:            make(map[guid.GUID]struct{}),
		PlayerObservations:     make(map[guid.GUID]combatant.Combatant),
		ByName:                 make(map[string]guid.GUID),
		PendingTalents:         make(map[guid.GUID]pendingTalent),
		InvalidatedTalents:     make(map[guid.GUID]struct{}),
		observedRespecAura:     make(map[guid.GUID]struct{}),
		invalidatedTalentBuild: make(map[guid.GUID]*combatant.Talents),
		PlayerLevel:            make(map[guid.GUID]int32),
	}
}

func (g *Tracker) insertGuilds(ctx context.Context, realmID uuid.UUID, tx *authz.AuthzTX) (map[string]uuid.UUID, *database.Guild, error) {
	guildIDs := make(map[string]uuid.UUID)
	mostGuildPlayers := 0
	var guildWithMostPlayers *database.Guild

	// Acquire row locks in a stable order across parser workers and processes.
	// Random map iteration can otherwise deadlock two transactions that share
	// multiple guilds or players but upsert them in opposite orders.
	for _, name := range sortedGuildNames(g.Guilds) {
		players := g.Guilds[name]
		insertedGuild, err := tx.UpsertGuild(ctx, database.UpsertGuildParams{
			RealmID:   realmID,
			Name:      name,
			CreatedAt: database.Timestamptz(time.Now()),
		})
		if err != nil {
			return nil, nil, fmt.Errorf("upsert guild: %w", err)
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

	if mostGuildPlayers <= len(g.Participant)/2 {
		guildWithMostPlayers = nil
	}
	return guildIDs, guildWithMostPlayers, nil
}

func (g *Tracker) Insert(ctx context.Context, udb *unitdb.Units, instanceID uuid.UUID, realmID uuid.UUID, datasetID uuid.UUID, tx *authz.AuthzTX) (*database.Guild, error) {
	guildIDs, guildWithMostPlayers, err := g.insertGuilds(ctx, realmID, tx)
	if err != nil {
		return nil, err
	}
	playerGUIDs := sortedPlayerGUIDs(g.PlayerObservations)

	// Collect unique item IDs and names for batch metadata fetch.
	// Names are used as fallback for transmog IDs that don't exist in the item table.
	itemIDSet := make(map[int32]struct{})
	itemIDList := make([]int32, 0)
	itemNameList := make([]string, 0)
	for _, playerGUID := range playerGUIDs {
		player := g.PlayerObservations[playerGUID]
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

	inserts := make([]database.UpsertPlayersParams, 0, len(g.PlayerObservations))
	gearHistory := make([]database.UpsertPlayerGearHistoryParams, 0, len(g.PlayerObservations))
	for _, playerGUID := range playerGUIDs {
		player := g.PlayerObservations[playerGUID]
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

		level := persistedPlayerLevel(player, udb)

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
			Faction: db2sdk.HeroFactionToDB(player.Faction),
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

	return guildWithMostPlayers, nil
}

func persistedPlayerLevel(player combatant.Combatant, udb *unitdb.Units) int16 {
	if player.Level != nil && *player.Level > 0 {
		return int16(*player.Level)
	}
	if info, ok := udb.Get(player.Guid); ok {
		return int16(info.Level)
	}
	return 0
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

	for playerGUID, player := range g.PlayerObservations {
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
		g.PlayerObservations[playerGUID] = player
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

// ObserveAura clears respec invalidation when the parse-wide aura tracker has
// authoritative evidence that Scrambled Brain ended, including forced expiry.
func (g *Tracker) ObserveAura(notification auras.Notification) {
	if notification.SpellID != respecAuraSpellID {
		return
	}
	switch notification.Type {
	case auras.NotifyRemoved, auras.NotifyExpired, auras.NotifyRemovedOnDeath:
		g.finishRespecAura(notification.Unit)
	}
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
		if ty.Guid.IsPlayer() {
			_, observed := g.observedRespecAura[ty.Guid]
			if hasUnitAura(ty, respecAuraSpellID) {
				if !observed {
					g.observedRespecAura[ty.Guid] = struct{}{}
					g.invalidateTalents(ty.Guid)
				}
			} else if observed && len(ty.Buffs) > 0 {
				// Non-empty UNIT_INFO buff lists are authoritative snapshots. Empty
				// lists may mean the addon could not read buffs, so do not treat them
				// as proof that the respec aura expired.
				g.finishRespecAura(ty.Guid)
			}
		}
	case *messages.Combatant:
		g.Guild(ty)
		g.Player(ty)
		if player, ok := g.units.GetPlayer(ty.Guid); ok && player.Talents != nil {
			talents := player.Talents
			if invalidated, ok := g.invalidatedTalentBuild[ty.Guid]; ok && talentsEqual(talents, invalidated) {
				// UNIT_INFO emits COMBATANT_INFO even when its cached talent data is
				// unchanged. Keep the old build invalidated until a different build or
				// a direct COMBATANT_TALENTS update arrives.
				g.invalidateTalents(ty.Guid)
			} else {
				g.repairTalents(ty.Guid)
			}
		}
	case *messages.CombatantTalents:
		g.CombatantTalents(ty)
		// Direct talent data is authoritative, even if the player selected the
		// same build again.
		g.repairTalents(ty.Guid)
	case *messages.Aura:
		// The goblin respec is only logged as a debuff application. Invalidate
		// the affected player's talents until the next talent update.
		if ty.SpellData != nil && int(ty.SpellData.ID) == respecAuraSpellID && ty.Target.IsPlayer() {
			switch ty.State {
			case types.AuraStateAdded:
				g.observedRespecAura[ty.Target] = struct{}{}
				g.invalidateTalents(ty.Target)
			case types.AuraStateRemoved:
				g.finishRespecAura(ty.Target)
			}
		}
	case *messages.Transmog:
		g.Transmog(ty)
	}

	return nil
}

func hasUnitAura(unit *messages.Unit, spellID int) bool {
	for _, aura := range unit.Buffs {
		if aura.ID == spellID {
			return true
		}
	}
	return false
}

func (g *Tracker) invalidateTalents(player guid.GUID) {
	if _, invalidated := g.InvalidatedTalents[player]; !invalidated {
		p, _ := g.units.GetPlayer(player)
		g.invalidatedTalentBuild[player] = combatant.CloneTalents(p.Talents)
	}
	g.InvalidatedTalents[player] = struct{}{}
	g.units.InvalidatePlayerTalents(player)
	g.observePlayer(player)
}

// finishRespecAura allows the next COMBATANT_INFO snapshot to repair an
// invalidated build, even when the player selected the same talent layout.
// Keep the talents nil until that snapshot arrives so stale data is not ranked.
func (g *Tracker) finishRespecAura(player guid.GUID) {
	delete(g.observedRespecAura, player)
	delete(g.invalidatedTalentBuild, player)
}

func (g *Tracker) repairTalents(player guid.GUID) {
	delete(g.InvalidatedTalents, player)
	delete(g.invalidatedTalentBuild, player)
}

func talentsEqual(a, b *combatant.Talents) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	if a.Summary != b.Summary {
		return false
	}
	for i := range a.Trees {
		if !slices.Equal(a.Trees[i], b.Trees[i]) {
			return false
		}
	}
	return true
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
	g.units.FillPlayerLevel(unit.Guid, unit.Level)
	g.observePlayer(unit.Guid)
}

func (g *Tracker) Player(msg *messages.Combatant) {
	gid := msg.Guid
	if gid.IsZero() || !gid.IsPlayer() {
		return
	}
	c := msg.Combatant
	if pending, ok := g.PendingTalents[gid]; ok {
		c.Talents = pending.talents
		delete(g.PendingTalents, gid)
	}
	g.units.UpdatePlayer(c)
	g.units.FillPlayerLevel(gid, g.PlayerLevel[gid])
	player, _ := g.units.GetPlayer(gid)
	g.PlayerObservations[gid] = player.Clone()
	g.ByName[msg.Name] = gid
}

// CurrentPlayer resolves live metadata only for players observed in this instance.
func (g *Tracker) CurrentPlayer(gid guid.GUID) (combatant.Combatant, bool) {
	if _, observed := g.PlayerObservations[gid]; !observed {
		return combatant.Combatant{}, false
	}
	return g.units.GetPlayer(gid)
}

// observePlayer advances this instance's persistence history at an explicit
// metadata observation. Other instances' observations remain detached.
func (g *Tracker) observePlayer(gid guid.GUID) {
	if p, ok := g.CurrentPlayer(gid); ok {
		g.PlayerObservations[gid] = p.Clone()
	}
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
	if _, ok := g.PlayerObservations[gid]; ok {
		g.units.UpdatePlayerTalents(gid, tls)
		g.observePlayer(gid)
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

	g.units.UpdatePlayerTransmogs(gid, msg.Transmogs)
	g.observePlayer(gid)
}
