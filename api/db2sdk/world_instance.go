package db2sdk

import (
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database"
)

func WorldInstanceTemplate(wit database.WorldInstanceTemplate, zoneNames []database.WorldInstanceZoneName) chroniclesdk.WorldInstanceTemplate {
	t := chroniclesdk.WorldInstanceTemplate{
		ID:       wit.ID,
		WorldID:  wit.WorldID,
		Name:     wit.Name,
		Category: chroniclesdk.InstanceCategory(wit.Category),
	}
	if wit.Abbreviation.Valid {
		t.Abbreviation = wit.Abbreviation.String
	}
	if wit.BossCount.Valid {
		v := wit.BossCount.Int32
		t.BossCount = &v
	}
	if wit.Background.Valid {
		t.Background = wit.Background.String
	}
	t.ZoneNames = make([]chroniclesdk.WorldInstanceZoneName, 0, len(zoneNames))
	for _, zn := range zoneNames {
		t.ZoneNames = append(t.ZoneNames, chroniclesdk.WorldInstanceZoneName{
			ZoneName:    zn.ZoneName,
			DisplayName: zn.DisplayName,
		})
	}
	return t
}

func WorldInstanceUnit(u database.GetWorldInstanceUnitsRow) chroniclesdk.WorldInstanceUnit {
	wu := chroniclesdk.WorldInstanceUnit{
		EntryID:     u.EntryID,
		Name:        u.Name,
		Boss:        u.Boss,
		Affiliation: chroniclesdk.UnitAffiliation(u.Affiliation),
	}
	if u.OverrideName.Valid {
		wu.OverrideName = u.OverrideName.String
	}
	if u.EncounterName.Valid {
		wu.EncounterName = u.EncounterName.String
	}
	return wu
}
