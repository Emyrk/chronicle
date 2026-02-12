package db2sdk

import (
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/maps"
	"github.com/Emyrk/chronicle/internal/slice"
	"github.com/riverqueue/river/rivertype"
)

func WoWLogGroupRow[T database.GetWoWLogGroupsByOwnerRow | database.GetWoWLogGroupByIDRow](group T) chroniclesdk.WoWLogGroup {
	// Use type switch to handle both types
	switch g := any(group).(type) {
	case database.GetWoWLogGroupsByOwnerRow:
		return chroniclesdk.WoWLogGroup{
			ID:               g.WoWLogGroup.ID,
			Owner:            g.WoWLogGroup.Owner,
			CreatedAt:        g.WoWLogGroup.CreatedAt,
			UpdatedAt:        g.WoWLogGroup.UpdatedAt,
			Files:            slice.List(g.Files, WoWLogFile),
			ProcessingOutput: g.ProcessingOutput,
		}
	case database.GetWoWLogGroupByIDRow:
		return chroniclesdk.WoWLogGroup{
			ID:        g.WoWLogGroup.ID,
			Owner:     g.WoWLogGroup.Owner,
			CreatedAt: g.WoWLogGroup.CreatedAt,
			UpdatedAt: g.WoWLogGroup.UpdatedAt,
			Files:     slice.List(g.Files, WoWLogFile),
		}
	default:
		panic("unexpected type")
	}
}

func WoWLogFile(file database.LogFile) chroniclesdk.WoWLogFile {
	return chroniclesdk.WoWLogFile{
		ID:               file.ID,
		Owner:            file.Owner,
		WowLogID:         file.WowLogID,
		Hash:             file.Hash,
		SizeBytes:        file.SizeBytes,
		MimeType:         file.MimeType,
		CreatedAt:        file.CreatedAt,
		UpdatedAt:        file.UpdatedAt,
		StorageDeletedAt: file.StorageDeletedAt,
	}
}

func WoWInstance(instance database.LogInstance) chroniclesdk.WoWInstance {
	return chroniclesdk.WoWInstance{
		ID:         instance.ID,
		RealmID:    instance.RealmID,
		LogGroupID: instance.LogGroupID,
		Name:       instance.Name,
		Slug:       instance.HashedSlug.String,
	}
}

func WowDecoratedInstance(instance database.LogInstance,
	units []database.LogInstanceUnit,
	players []database.LogInstancePlayer,
	encounters []database.LogInstanceEncounter,
	fights []database.LogInstanceEncounterHostile,
) chroniclesdk.WoWParsedInstance {
	return chroniclesdk.WoWParsedInstance{
		WoWInstance: WoWInstance(instance),
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
				Class: types.HeroClasses(u.Class),
				Race:  types.HeroRaces(u.Race),
			}
		}),
	}
}

func PeriodMoment(moment *database.PeriodMoment) *chroniclesdk.PeriodMoment {
	if moment == nil {
		return nil
	}
	return &chroniclesdk.PeriodMoment{
		Timestamp: moment.Timestamp,
		Reason:    moment.Reason,
	}
}

func ActivityPeriod(period database.Period) chroniclesdk.ActivityPeriod {
	return chroniclesdk.ActivityPeriod{
		Start:      PeriodMoment(period.Start),
		End:        PeriodMoment(period.End),
		LastActive: PeriodMoment(period.LastActive),
		Slain:      period.Slain,
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
		Kill:       encounter.Kill,
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
