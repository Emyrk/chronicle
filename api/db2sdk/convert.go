package db2sdk

import (
	"encoding/json"
	"sort"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/maps"
	"github.com/Emyrk/chronicle/internal/slice"
	"github.com/google/uuid"
	"github.com/riverqueue/river/rivertype"
)

func nullUUIDPtr(n uuid.NullUUID) *uuid.UUID {
	if !n.Valid {
		return nil
	}
	return &n.UUID
}

func WoWServerRealm(r database.WowServerRealm) chroniclesdk.WoWServerRealm {
	var url *string
	if r.Url.Valid {
		url = &r.Url.String
	}
	return chroniclesdk.WoWServerRealm{
		ID:          r.ID,
		ServerID:    r.ServerID,
		Name:        r.Name,
		Description: r.Description,
		URL:         url,
		CreatedBy:   nullUUIDPtr(r.CreatedBy),
	}
}

func User[T database.ChronicleUser | database.ListAllUsersRow](row T, roles []string) chroniclesdk.User {
	var user database.ChronicleUser
	var discordID string
	switch row := any(row).(type) {
	case database.ChronicleUser:
		user = row
	case database.ListAllUsersRow:
		user = row.ChronicleUser
		discordID = row.DiscordID
	}

	var dataLimitUpdated time.Time
	if t, ok := user.DataLimitUpdatedAt.(time.Time); ok {
		dataLimitUpdated = t
	}
	u := chroniclesdk.User{
		ID:                     user.ID,
		Username:               user.Username,
		Email:                  user.Email,
		DiscordID:              discordID,
		Roles:                  roles,
		CreatedAt:              user.CreatedAt.Time,
		UpdatedAt:              user.UpdatedAt.Time,
		MaxStorageBytes:        user.MaxStorageBytes,
		MaxStorageBytesUpdated: dataLimitUpdated,
		ConsumedStorageBytes:   user.ConsumedStorageBytes,
	}
	if user.RawLogRetentionHours.Valid {
		v := user.RawLogRetentionHours.Int32
		u.RawLogRetentionHours = &v
	}
	return u
}

func WoWLogGroupRow[T database.GetWoWLogGroupsByOwnerRow | database.GetWoWLogGroupByIDRow](group T) chroniclesdk.WoWLogGroup {
	// Use type switch to handle both types
	switch g := any(group).(type) {
	case database.GetWoWLogGroupsByOwnerRow:
		return chroniclesdk.WoWLogGroup{
			ID:               g.WoWLogGroup.ID,
			Owner:            g.WoWLogGroup.Owner,
			CreatedAt:        g.WoWLogGroup.CreatedAt,
			UpdatedAt:        g.WoWLogGroup.UpdatedAt,
			LogType:          string(g.WoWLogGroup.LogType),
			Files:            slice.List(g.Files, WoWLogFile),
			ProcessingOutput: g.ProcessingOutput,
		}
	case database.GetWoWLogGroupByIDRow:
		out := chroniclesdk.WoWLogGroup{
			ID:        g.WoWLogGroup.ID,
			Owner:     g.WoWLogGroup.Owner,
			CreatedAt: g.WoWLogGroup.CreatedAt,
			UpdatedAt: g.WoWLogGroup.UpdatedAt,
			LogType:   string(g.WoWLogGroup.LogType),
			Flavor:    g.WoWLogGroup.Flavor,
			Files:     slice.List(g.Files, WoWLogFile),
		}
		if g.WoWLogGroup.Format.Valid {
			out.Format = string(g.WoWLogGroup.Format.LogFormat)
		}
		return out
	default:
		panic("unexpected type")
	}
}

func WoWLogFile(file database.LogFile) chroniclesdk.WoWLogFile {
	var compressedSize *int64
	if file.CompressedSizeBytes.Valid {
		compressedSize = &file.CompressedSizeBytes.Int64
	}
	var contentEncoding *string
	if file.ContentEncoding.Valid {
		contentEncoding = &file.ContentEncoding.String
	}

	return chroniclesdk.WoWLogFile{
		ID:                  file.ID,
		Owner:               file.Owner,
		WowLogID:            file.WowLogID,
		Hash:                file.Hash,
		SizeBytes:           file.SizeBytes,
		MimeType:            file.MimeType,
		CompressedSizeBytes: compressedSize,
		ContentEncoding:     contentEncoding,
		CreatedAt:           file.CreatedAt,
		UpdatedAt:           file.UpdatedAt,
		StorageDeletedAt:    file.StorageDeletedAt,
	}
}

func WoWInstanceWithGuild(instance database.LogInstance, dbG *database.Guild) chroniclesdk.WoWInstance {
	var g *chroniclesdk.Guild
	if dbG != nil {
		g = &chroniclesdk.Guild{
			ID:        dbG.ID,
			Name:      dbG.Name,
			CreatedAt: dbG.CreatedAt.Time,
		}
	}
	ret := chroniclesdk.WoWInstance{
		ID:                instance.ID,
		RealmID:           instance.RealmID,
		LogGroupID:        instance.LogGroupID,
		Name:              instance.Name,
		Slug:              instance.HashedSlug.String,
		Guild:             g,
		Capabilities:      instance.Capabilities,
		Versions:          map[string]string(instance.Versions),
		RecorderName:      instance.RecorderName,
		RecorderGUID:      instance.RecorderGuid,
		DifficultyName:    instance.DifficultyName,
		MaxPlayers:        int(instance.MaxPlayers),
		DynamicDifficulty: int(instance.DynamicDifficulty),
	}
	if instance.StartTime.Valid {
		ret.StartTime = &instance.StartTime.Time
	}
	if instance.EndTime.Valid {
		ret.EndTime = &instance.EndTime.Time
	}
	if instance.DuplicateGroupID.Valid {
		ret.DuplicateGroupID = &instance.DuplicateGroupID.UUID
	}
	return ret
}

func WoWInstance(instance database.LogInstancesGuild) chroniclesdk.WoWInstance {
	var g *chroniclesdk.Guild
	if instance.GuildID.Valid {
		g = &chroniclesdk.Guild{
			ID:        instance.GuildID.UUID,
			Name:      instance.GuildName.String,
			CreatedAt: instance.GuildCreatedAt.Time,
		}
	}
	ret := chroniclesdk.WoWInstance{
		ID:                instance.ID,
		RealmID:           instance.RealmID,
		LogGroupID:        instance.LogGroupID,
		Name:              instance.Name,
		Slug:              instance.HashedSlug.String,
		Guild:             g,
		Capabilities:      instance.Capabilities,
		Versions:          map[string]string(instance.Versions),
		RecorderName:      instance.RecorderName,
		RecorderGUID:      instance.RecorderGuid,
		DifficultyName:    instance.DifficultyName,
		MaxPlayers:        int(instance.MaxPlayers),
		DynamicDifficulty: int(instance.DynamicDifficulty),
	}
	if instance.DuplicateGroupID.Valid {
		ret.DuplicateGroupID = &instance.DuplicateGroupID.UUID
	}
	if instance.ServerName.Valid {
		ret.ServerName = instance.ServerName.String
	}
	if instance.TenantName.Valid {
		ret.TenantName = instance.TenantName.String
	}
	if instance.TenantSlug.Valid {
		ret.TenantSlug = instance.TenantSlug.String
	}
	ret.TenantIncludeAll = instance.TenantIncludeInAll
	if instance.Format.Valid {
		ret.Format = string(instance.Format.LogFormat)
	}
	ret.Flavor = instance.Flavor
	return ret
}

func WowDecoratedInstance(instance database.LogInstancesGuild,
	units []database.LogInstanceUnit,
	players []database.LogInstancePlayer,
	encounters []database.LogInstanceEncounter,
	fights []database.LogInstanceEncounterHostile,
) chroniclesdk.WoWParsedInstance {
	ret := chroniclesdk.WoWParsedInstance{
		WoWInstance: WoWInstance(instance),
		RealmName:   instance.RealmName,
		Encounters:  WoWEncountersWithHostiles(encounters, fights),
		Units: maps.MapFromSlice(units, func(u database.LogInstanceUnit) guid.GUID { return u.UnitGuid }, func(u database.LogInstanceUnit) chroniclesdk.InstanceUnit {
			return chroniclesdk.InstanceUnit{
				Name:  u.Name,
				Owner: u.OwnerGuid,
				Entry: uint32(u.Entry),
			}
		}),
		Players: maps.MapFromSlice(players, func(u database.LogInstancePlayer) guid.GUID { return u.UnitGuid }, func(u database.LogInstancePlayer) chroniclesdk.InstancePlayer {
			return chroniclesdk.InstancePlayer{
				Name:  u.Name,
				Class: HeroClass(u.Class),
				Race:  HeroRace(u.Race),
				Level: u.Level,
			}
		}),
	}
	return ret
}

// SpeedrunResult converts a database speedrun row to an SDK SpeedrunResult.
// The proof column is stored as JSONB and decoded into SDK proof types.
func SpeedrunResult(sr database.GetInstanceSpeedrunRow) *chroniclesdk.SpeedrunResult {
	result := &chroniclesdk.SpeedrunResult{
		Qualified:      sr.Qualified,
		StartTime:      sr.StartTime.Time,
		CompletionTime: sr.CompletionTime.Time,
		DurationMs:     sr.DurationMs,
	}

	// The proof JSONB column may be the new format (object with "proof" +
	// "level_range" keys) or the legacy format (bare array of proofs).
	// Try the new format first; fall back to the legacy array.
	var payload chroniclesdk.SpeedrunProofPayload
	if err := json.Unmarshal(sr.Proof, &payload); err == nil && payload.Proof != nil {
		result.Proof = payload.Proof
		result.LevelRange = payload.LevelRange
	} else {
		// Legacy: bare []SpeedrunProof array.
		var proof []chroniclesdk.SpeedrunProof
		_ = json.Unmarshal(sr.Proof, &proof)
		result.Proof = proof
	}

	return result
}

func InstanceOverviewMetrics(row database.InstanceOverviewMetric) chroniclesdk.InstanceOverviewMetrics {
	var requirementsComplete *bool
	if row.RequirementsComplete.Valid {
		requirementsComplete = &row.RequirementsComplete.Bool
	}
	abilities := make([]chroniclesdk.OverviewIncomingDamageAbility, 0, len(row.TopIncomingDamageAbilities))
	for _, ability := range row.TopIncomingDamageAbilities {
		abilities = append(abilities, chroniclesdk.OverviewIncomingDamageAbility{
			SpellID:         ability.SpellID,
			Name:            ability.Name,
			Damage:          ability.Damage,
			Hits:            ability.Hits,
			EnvironmentType: ability.EnvironmentType,
		})
	}
	return chroniclesdk.InstanceOverviewMetrics{
		RequirementsComplete:       requirementsComplete,
		PlayerDeaths:               row.PlayerDeaths,
		WipeCount:                  row.WipeCount,
		TopIncomingDamageAbilities: abilities,
		EncounterSpanDurationMs:    row.EncounterSpanDurationMs,
		TotalCombatDurationMs:      row.TotalCombatDurationMs,
		TotalBossDurationMs:        row.TotalBossDurationMs,
		MetricsVersion:             row.MetricsVersion,
	}
}

func EncounterKillTimes(rows []database.GetInstanceEncounterKillTimesRow) []chroniclesdk.EncounterKillTime {
	killTimes := make([]chroniclesdk.EncounterKillTime, 0, len(rows))
	for _, row := range rows {
		killTimes = append(killTimes, chroniclesdk.EncounterKillTime{
			EncounterName: row.EncounterName,
			DurationMs:    row.DurationMs,
		})
	}
	return killTimes
}

func SpeedrunCohortRun(row database.InstanceSpeedrunCohortRow) chroniclesdk.SpeedrunCohortRun {
	var payload chroniclesdk.SpeedrunProofPayload
	if err := json.Unmarshal(row.Proof, &payload); err != nil || payload.Proof == nil {
		_ = json.Unmarshal(row.Proof, &payload.Proof)
	}

	satisfied := 0
	for _, proof := range payload.Proof {
		if proof.Satisfied {
			satisfied++
		}
	}

	var encounterKillTimes []chroniclesdk.EncounterKillTime
	_ = json.Unmarshal([]byte(row.EncounterKillTimesJson), &encounterKillTimes)

	run := chroniclesdk.SpeedrunCohortRun{
		InstanceID:            row.InstanceID,
		Slug:                  row.HashedSlug.String,
		StartTime:             row.StartTime.Time,
		RequirementsComplete:  len(payload.Proof) > 0 && satisfied == len(payload.Proof),
		Qualified:             row.Qualified,
		RequirementsSatisfied: satisfied,
		RequirementsTotal:     len(payload.Proof),
		GuildName:             row.GuildName,
		EncounterKillTimes:    encounterKillTimes,
	}
	if row.GuildID.Valid {
		run.GuildID = &row.GuildID.UUID
	}
	if row.DurationMs > 0 {
		duration := row.DurationMs
		run.DurationMs = &duration
	}
	if !row.CompletionTime.Time.IsZero() {
		completion := row.CompletionTime.Time
		run.CompletionTime = &completion
	}
	if row.MetricsVersion.Valid {
		var requirementsComplete *bool
		if row.RequirementsComplete.Valid {
			requirementsComplete = &row.RequirementsComplete.Bool
		}
		run.Overview = &chroniclesdk.SpeedrunCohortRunOverviewMetrics{
			RequirementsComplete:    requirementsComplete,
			PlayerDeaths:            row.PlayerDeaths.Int32,
			WipeCount:               row.WipeCount.Int32,
			EncounterSpanDurationMs: row.EncounterSpanDurationMs.Int64,
			TotalCombatDurationMs:   row.TotalCombatDurationMs.Int64,
			TotalBossDurationMs:     row.TotalBossDurationMs.Int64,
			MetricsVersion:          row.MetricsVersion.Int32,
		}
	}
	return run
}

// SpeedrunCohortOverviewMetrics aggregates bounded per-run Overview data for a cohort response.
func SpeedrunCohortOverviewMetrics(rows []database.InstanceSpeedrunCohortRow, runs []chroniclesdk.SpeedrunCohortRun) chroniclesdk.SpeedrunCohortOverviewMetrics {
	type abilityKey struct {
		spellID         int32
		hasSpellID      bool
		name            string
		environmentType string
	}

	abilities := make(map[abilityKey]chroniclesdk.SpeedrunCohortIncomingDamageAbility)
	completeRuns := 0
	for i, row := range rows {
		if i >= len(runs) || !runs[i].RequirementsComplete || runs[i].Overview == nil {
			continue
		}
		completeRuns++

		var runAbilities []chroniclesdk.OverviewIncomingDamageAbility
		_ = json.Unmarshal(row.TopIncomingDamageAbilities, &runAbilities)
		for _, ability := range runAbilities {
			key := abilityKey{
				name:            ability.Name,
				environmentType: ability.EnvironmentType,
			}
			if ability.SpellID != nil {
				key.spellID = *ability.SpellID
				key.hasSpellID = true
			}

			aggregate := abilities[key]
			aggregate.SpellID = ability.SpellID
			aggregate.Name = ability.Name
			aggregate.Damage += ability.Damage
			aggregate.Hits += ability.Hits
			aggregate.Runs++
			aggregate.EnvironmentType = ability.EnvironmentType
			abilities[key] = aggregate
		}
	}

	topAbilities := make([]chroniclesdk.SpeedrunCohortIncomingDamageAbility, 0, len(abilities))
	for _, ability := range abilities {
		topAbilities = append(topAbilities, ability)
	}
	sort.Slice(topAbilities, func(i, j int) bool {
		if topAbilities[i].Damage != topAbilities[j].Damage {
			return topAbilities[i].Damage > topAbilities[j].Damage
		}
		if topAbilities[i].Hits != topAbilities[j].Hits {
			return topAbilities[i].Hits > topAbilities[j].Hits
		}
		return topAbilities[i].Name < topAbilities[j].Name
	})
	if len(topAbilities) > 10 {
		topAbilities = topAbilities[:10]
	}

	return chroniclesdk.SpeedrunCohortOverviewMetrics{
		Runs:                       completeRuns,
		TopIncomingDamageAbilities: topAbilities,
	}
}

// SpeedrunLeaderboardEntry converts a database leaderboard row to an SDK entry.
func SpeedrunLeaderboardEntry(row database.SpeedrunLeaderboardRow) chroniclesdk.SpeedrunLeaderboardEntry {
	entry := chroniclesdk.SpeedrunLeaderboardEntry{
		InstanceID:     row.InstanceID,
		Slug:           row.HashedSlug.String,
		DifficultyName: row.DifficultyName,
		DurationMs:     row.DurationMs,
		GuildName:      row.GuildName,
		RealmName:      row.RealmName,
		StartTime:      row.StartTime.Time,
		CompletionTime: row.CompletionTime.Time,
		PlayerCount:    row.PlayerCount,
		GuildLogoURL:   row.GuildLogoUrl,
		ParserVersion:  row.ParserVersion,
		AddonVersion:   row.AddonVersion,
	}
	if row.DuplicateGroupID.Valid {
		entry.DuplicateGroupID = &row.DuplicateGroupID.UUID
	}
	return entry
}

// SpeedrunGuildClearsEntry converts a database guild clears row to an SDK entry.
func SpeedrunGuildClearsEntry(row database.SpeedrunGuildClearsRow) chroniclesdk.SpeedrunGuildClearsEntry {
	return chroniclesdk.SpeedrunGuildClearsEntry{
		GuildID:      row.GuildID,
		GuildName:    row.GuildName,
		GuildLogoURL: row.GuildLogoUrl,
		Clears:       row.Clears,
	}
}

// LeaderboardVersionRequirements converts a database row to SDK type.
func LeaderboardVersionRequirements(row database.LeaderboardVersionRequirement) chroniclesdk.LeaderboardVersionRequirements {
	return chroniclesdk.LeaderboardVersionRequirements{
		InstanceName:     row.InstanceName,
		MinParserVersion: row.MinParserVersion,
		MinAddonVersion:  row.MinAddonVersion,
	}
}

func init() {
	for _, class := range database.AllWowPlayableClassValues() {
		dbClassLookup[strings.ToLower(string(class))] = class
	}

	for _, race := range database.AllWowPlayableRaceValues() {
		dbRaceLookup[strings.ToLower(string(race))] = race
	}
}

var dbClassLookup = make(map[string]database.WowPlayableClass)
var dbRaceLookup = make(map[string]database.WowPlayableRace)

func HeroClass(class database.WowPlayableClass) types.HeroClasses {
	// Database uses DEATH_KNIGHT but HeroClasses enum uses DEATHKNIGHT.
	s := strings.ReplaceAll(string(class), "_", "")
	cl, err := types.ParseHeroClasses(s)
	if err != nil {
		return types.HeroClassesUNKNOWN
	}
	return cl
}

func HeroClassToDB(class types.HeroClasses) database.WowPlayableClass {
	// HeroClasses uses DEATHKNIGHT, DB uses DEATH_KNIGHT.
	if class == types.HeroClassesDEATHKNIGHT {
		return database.WowPlayableClassDEATHKNIGHT
	}
	f, ok := dbClassLookup[strings.ToLower(class.String())]
	if !ok {
		return database.WowPlayableClassUNKNOWN
	}
	return f
}

func HeroRace(race database.WowPlayableRace) types.HeroRaces {
	r, err := types.ParseHeroRaces(string(race))
	if err != nil {
		return types.HeroRacesUnknown
	}
	return r
}

func HeroRaceToDB(race types.HeroRaces) database.WowPlayableRace {
	f, ok := dbRaceLookup[strings.ToLower(race.String())]
	if !ok {
		return database.WowPlayableRaceUnknown
	}
	return f
}

func HeroGender(gender database.WowPlayableGender) types.HeroGender {
	switch gender {
	case database.WowPlayableGenderMale:
		return types.HeroGenderMale
	case database.WowPlayableGenderFemale:
		return types.HeroGenderFemale
	case database.WowPlayableGenderNotSet:
		return types.HeroGenderNotSet
	default:
		return types.HeroGenderUnknown
	}
}

func HeroGenderToDB(gender types.HeroGender) database.WowPlayableGender {
	switch gender {
	case types.HeroGenderNotSet:
		return database.WowPlayableGenderNotSet
	case types.HeroGenderMale:
		return database.WowPlayableGenderMale
	case types.HeroGenderFemale:
		return database.WowPlayableGenderFemale
	default:
		return database.WowPlayableGenderUnknown

	}
}

func PeriodMoment(moment *database.PeriodMoment) *chroniclesdk.PeriodMoment {
	if moment == nil {
		return nil
	}
	return &chroniclesdk.PeriodMoment{
		Timestamp:   moment.Timestamp,
		Reason:      moment.Reason,
		MessageType: moment.MessageType,
		Message:     moment.Message,
	}
}

func ActivityPeriod(period database.Period) chroniclesdk.ActivityPeriod {
	return chroniclesdk.ActivityPeriod{
		Start:      PeriodMoment(period.Start),
		End:        PeriodMoment(period.End),
		LastActive: PeriodMoment(period.LastActive),
		EndState:   chroniclesdk.EndState(period.EndState),
	}
}

func WoWHostile(hostile database.LogInstanceEncounterHostile) chroniclesdk.WoWEncounterHostile {
	return chroniclesdk.WoWEncounterHostile{
		ID:      hostile.ID,
		Boss:    hostile.Boss,
		Periods: slice.List(hostile.Periods, ActivityPeriod),
	}
}

func WoWEncounter(encounter database.LogInstanceEncounter) chroniclesdk.WoWEncounter {
	return chroniclesdk.WoWEncounter{
		ID:         encounter.ID,
		InstanceID: encounter.InstanceID,
		Boss:       encounter.Boss,
		Name:       encounter.Name,
		KillType:   chroniclesdk.KillType(encounter.KillType),
		Remaining:  encounter.Remaining,
		StartTime:  encounter.StartTime.Time,
		EndTime:    encounter.EndTime.Time,
	}
}

func WoWEncountersWithHostiles(encounter []database.LogInstanceEncounter, hostiles []database.LogInstanceEncounterHostile) []chroniclesdk.WoWEncounterWithHostiles {
	output := make([]chroniclesdk.WoWEncounterWithHostiles, 0, len(encounter))
	for _, e := range encounter {
		output = append(output, chroniclesdk.WoWEncounterWithHostiles{
			WoWEncounter: WoWEncounter(e),
			Hostiles: slice.List(slice.Filter(hostiles, func(h database.LogInstanceEncounterHostile) bool {
				return h.EncounterID == e.ID
			}), WoWHostile),
		})
	}
	return output
}

func JobStatus(status rivertype.JobRow) chroniclesdk.JobStatus {
	return chroniclesdk.JobStatus{
		ID:          status.ID,
		Attempt:     status.Attempt,
		MaxAttempts: status.MaxAttempts,
		State:       status.State,
		ScheduledAt: status.ScheduledAt,
		AttemptedAt: status.AttemptedAt,
		CreatedAt:   status.CreatedAt,
		FinalizedAt: status.FinalizedAt,
		Errors:      status.Errors,
		Kind:        status.Kind,
		Output:      status.Output(),
	}
}

func InstanceLoot(loot []database.GetInstanceLootRow) []chroniclesdk.InstanceLoot {
	result := make([]chroniclesdk.InstanceLoot, 0, len(loot))
	for _, l := range loot {
		result = append(result, chroniclesdk.InstanceLoot{
			SourceGuid:   guid.GUID(l.SourceGuid),
			SourceTS:     l.SourceTs.Time,
			ReceivedGuid: guid.GUID(l.ReceivedGuid),
			ReceivedTS:   l.ReceivedTs.Time,
			ItemID:       l.ItemID,
			ItemName:     l.ItemName,
			LootSuffix:   l.LootSuffix,
			Quantity:     l.Quantity,
			Quality:      l.Quality,
			Icon:         l.Icon,
		})
	}
	return result
}

func Video(video database.LogInstanceYoutubeTimestamped) chroniclesdk.Video {
	return chroniclesdk.Video{
		URL:        video.VideoUrl,
		ExportedAt: video.ExportedAt.Time,
		Results:    slice.List(video.Payload, VideoTimestamp),
	}
}

func VideoToDB(video chroniclesdk.Video) database.Video {
	return database.Video{
		URL:        video.URL,
		ExportedAt: video.ExportedAt,
		Results:    slice.List(video.Results, VideoTimestampToDB),
	}
}

func VideoTimestampToDB(timestamp chroniclesdk.VideoTimestamp) database.VideoTimestamp {
	return database.VideoTimestamp{
		VideoTimeSeconds: timestamp.VideoTimeSeconds,
		RawOCR:           timestamp.RawOCR,
		ServerTime:       timestamp.ServerTime,
		UTCTime:          timestamp.UTCTime,
		Confidence:       timestamp.Confidence,
	}
}

func VideoTimestamp(timestamp database.VideoTimestamp) chroniclesdk.VideoTimestamp {
	return chroniclesdk.VideoTimestamp{
		VideoTimeSeconds: timestamp.VideoTimeSeconds,
		RawOCR:           timestamp.RawOCR,
		ServerTime:       timestamp.ServerTime,
		Confidence:       timestamp.Confidence,
		UTCTime:          timestamp.UTCTime,
	}
}

func DataGrant(g database.DataGrant) chroniclesdk.DataGrant {
	var expiresAt *time.Time
	if g.ExpiresAt.Valid {
		expiresAt = &g.ExpiresAt.Time
	}
	return chroniclesdk.DataGrant{
		ID:           g.ID.String(),
		Source:       g.Source,
		StorageBytes: g.StorageBytes,
		Description:  g.Description.String,
		CreatedAt:    g.CreatedAt.Time,
		ExpiresAt:    expiresAt,
	}
}

func DataGrants(gs []database.DataGrant) []chroniclesdk.DataGrant {
	return slice.List(gs, DataGrant)
}
func ArmoryPlayer(row database.GetGamePlayerByGUIDRow) chroniclesdk.ArmoryPlayer {
	var guildID, instanceID *uuid.UUID
	if row.GuildID.Valid {
		guildID = &row.GuildID.UUID
	}
	if row.UpdatedFromInstance.Valid {
		instanceID = &row.UpdatedFromInstance.UUID
	}

	var gear chroniclesdk.PlayerOutfit
	if row.Gear != nil {
		for i, g := range row.Gear {
			gear[i] = chroniclesdk.PlayerGear{
				ItemID:      g.ItemID,
				EnchantID:   g.EnchantID,
				ItemName:    g.ItemName,
				ItemQuality: g.ItemQuality,
				ItemIcon:    g.ItemIcon,
				TransmogID:  g.TransmogID,
				ItemLevel:   g.ItemLevel,
			}
		}
	}

	var talents *chroniclesdk.PlayerTalents
	if row.Talents != nil {
		talents = &chroniclesdk.PlayerTalents{}
		for i, t := range row.Talents.Trees {
			talents.Trees[i] = chroniclesdk.PlayerTalentTab{
				TabName:     t.TabName,
				PointsSpent: t.PointsSpent,
				Ranks:       t.Ranks,
			}
		}
	}

	return chroniclesdk.ArmoryPlayer{
		ID:                  row.ID,
		RealmID:             row.RealmID,
		RealmName:           row.RealmName,
		Name:                row.Name,
		Class:               HeroClass(row.Class).String(),
		Race:                HeroRace(row.Race).String(),
		Gender:              HeroGender(row.Gender).String(),
		Level:               int32(row.Level),
		GuildID:             guildID,
		GuildName:           row.GuildName.String,
		Gear:                gear,
		Talents:             talents,
		UpdatedAt:           row.UpdatedAt.Time,
		UpdatedFromInstance: instanceID,
	}
}

func ArmoryGearSnapshot(row database.GetPlayerGearHistoryRow) chroniclesdk.ArmoryGearSnapshot {
	var gear chroniclesdk.PlayerOutfit
	for i, g := range row.Gear {
		gear[i] = chroniclesdk.PlayerGear{
			ItemID:      g.ItemID,
			EnchantID:   g.EnchantID,
			ItemName:    g.ItemName,
			ItemQuality: g.ItemQuality,
			ItemIcon:    g.ItemIcon,
			TransmogID:  g.TransmogID,
			ItemLevel:   g.ItemLevel,
		}
	}

	var avgIlvl *float64
	if row.AvgIlvl.Valid {
		v := float64(row.AvgIlvl.Float32)
		avgIlvl = &v
	}

	return chroniclesdk.ArmoryGearSnapshot{
		InstanceID:   row.InstanceID,
		InstanceName: row.InstanceName,
		InstanceSlug: row.InstanceSlug.String,
		EquippedAt:   row.EquippedAt.Time,
		AvgIlvl:      avgIlvl,
		Gear:         gear,
	}
}

func ArmorySearchResult(row database.SearchGamePlayersRow) chroniclesdk.ArmorySearchResult {
	var guildID *uuid.UUID
	if row.GuildID.Valid {
		guildID = &row.GuildID.UUID
	}

	return chroniclesdk.ArmorySearchResult{
		ID:        row.ID,
		RealmName: row.RealmName,
		RealmID:   row.RealmID,
		Name:      row.Name,
		Class:     HeroClass(row.Class).String(),
		Race:      HeroRace(row.Race).String(),
		Gender:    HeroGender(row.Gender).String(),
		Level:     int32(row.Level),
		GuildID:   guildID,
		GuildName: row.GuildName,
		UpdatedAt: row.UpdatedAt.Time,
	}
}

func LinkedCharacter(row database.GetUserCharacterLinksRow) chroniclesdk.LinkedCharacter {
	return chroniclesdk.LinkedCharacter{
		LinkID:        row.LinkID,
		UserID:        row.UserID,
		CharacterGUID: row.CharacterGuid,
		RealmID:       row.RealmID,
		RealmName:     row.RealmName,
		Name:          row.Name,
		Class:         HeroClass(row.Class).String(),
		Race:          HeroRace(row.Race).String(),
		Gender:        HeroGender(row.Gender).String(),
		Level:         int32(row.Level),
		GuildName:     row.GuildName.String,
		IsPrimary:     row.IsPrimary,
		LinkSource:    row.LinkSource,
		LinkedAt:      row.LinkedAt.Time,
	}
}

func LinkedCharacters(rows []database.GetUserCharacterLinksRow) []chroniclesdk.LinkedCharacter {
	out := make([]chroniclesdk.LinkedCharacter, 0, len(rows))
	for _, row := range rows {
		out = append(out, LinkedCharacter(row))
	}
	return out
}

func UserTalentBuild(row database.UserTalentBuild) chroniclesdk.UserTalentBuild {
	return chroniclesdk.UserTalentBuild{
		ID:        row.ID,
		Name:      row.Name,
		ClassID:   row.ClassID,
		Build:     row.Build,
		Locked:    row.Locked,
		CreatedAt: row.CreatedAt.Time,
		UpdatedAt: row.UpdatedAt.Time,
	}
}

func UserTalentBuilds(rows []database.UserTalentBuild) []chroniclesdk.UserTalentBuild {
	out := make([]chroniclesdk.UserTalentBuild, 0, len(rows))
	for _, row := range rows {
		out = append(out, UserTalentBuild(row))
	}
	return out
}
