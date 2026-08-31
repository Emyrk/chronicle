package api

import (
	"net/http"
	"slices"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/api/httpmw"
	"github.com/Emyrk/chronicle/combatlog/parser/common/raidgroups"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
)

func (api *API) InstanceRaidGroup(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	inst := httpmw.Instance(ctx)
	out := chroniclesdk.InstanceRaidGroupResponse{
		Available:  slices.Contains(inst.Capabilities, "raidgroup"),
		CleanKills: []chroniclesdk.InstanceRaidGroupKill{},
	}
	if !out.Available {
		httpapi.Write(ctx, w, http.StatusOK, out)
		return
	}

	snapshots, err := api.Opts.Zed.InstanceRaidGroupSnapshots(ctx, inst.ID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	players, err := api.Opts.Zed.InstancePlayersByInstanceID(ctx, inst.ID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	playerByGUID := make(map[guid.GUID]database.LogInstancePlayer, len(players))
	for _, player := range players {
		playerByGUID[player.UnitGuid] = player
	}

	specRows, err := api.Opts.Zed.InstancePlayerSpecs(ctx, inst.ID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	specs := raidGroupPlayerSpecs(specRows)

	for _, snapshot := range snapshots {
		snapshotSpecs := specs.byEncounter[snapshot.EncounterID.UUID]
		if snapshot.SnapshotType == database.RaidGroupSnapshotTypeFinal {
			snapshotSpecs = specs.latest
		}
		composition := raidGroupComposition(snapshot.ObservedAt.Time, snapshot.Composition, playerByGUID, snapshotSpecs)
		if snapshot.SnapshotType == database.RaidGroupSnapshotTypeFinal {
			out.Final = &composition
			continue
		}
		out.CleanKills = append(out.CleanKills, chroniclesdk.InstanceRaidGroupKill{
			EncounterID: snapshot.EncounterID.UUID, EncounterName: snapshot.EncounterName.String,
			KilledAt: snapshot.KilledAt.Time, Composition: composition,
		})
	}
	httpapi.Write(ctx, w, http.StatusOK, out)
}

type instanceRaidGroupSpecs struct {
	latest      map[guid.GUID]string
	byEncounter map[uuid.UUID]map[guid.GUID]string
}

func raidGroupPlayerSpecs(rows []database.InstancePlayerSpecsRow) instanceRaidGroupSpecs {
	result := instanceRaidGroupSpecs{
		latest:      make(map[guid.GUID]string),
		byEncounter: make(map[uuid.UUID]map[guid.GUID]string),
	}
	for _, row := range rows {
		playerGUID, err := guid.FromString(row.PlayerGuid)
		if err != nil || !row.EncounterID.Valid {
			continue
		}
		encounterSpecs := result.byEncounter[row.EncounterID.UUID]
		if encounterSpecs == nil {
			encounterSpecs = make(map[guid.GUID]string)
			result.byEncounter[row.EncounterID.UUID] = encounterSpecs
		}
		encounterSpecs[playerGUID] = row.PlayerSpec
		result.latest[playerGUID] = row.PlayerSpec
	}
	return result
}

func raidGroupComposition(at time.Time, composition raidgroups.Composition, players map[guid.GUID]database.LogInstancePlayer, specs map[guid.GUID]string) chroniclesdk.InstanceRaidGroupComposition {
	groups := make([][]chroniclesdk.InstanceRaidGroupMember, len(composition))
	for groupIndex, group := range composition {
		groups[groupIndex] = make([]chroniclesdk.InstanceRaidGroupMember, 0, len(group))
		for _, memberGUID := range group {
			if memberGUID.IsZero() {
				continue
			}
			member := chroniclesdk.InstanceRaidGroupMember{GUID: memberGUID, Spec: specs[memberGUID]}
			if player, ok := players[memberGUID]; ok {
				member.Name = player.Name
				member.Class = string(player.Class)
			}
			groups[groupIndex] = append(groups[groupIndex], member)
		}
	}
	return chroniclesdk.InstanceRaidGroupComposition{ObservedAt: at, Groups: groups}
}
