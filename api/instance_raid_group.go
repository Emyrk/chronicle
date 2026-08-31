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

	for _, snapshot := range snapshots {
		composition := raidGroupComposition(snapshot.ObservedAt.Time, snapshot.Composition, playerByGUID)
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

func raidGroupComposition(at time.Time, composition raidgroups.Composition, players map[guid.GUID]database.LogInstancePlayer) chroniclesdk.InstanceRaidGroupComposition {
	groups := make([][]chroniclesdk.InstanceRaidGroupMember, len(composition))
	for groupIndex, group := range composition {
		groups[groupIndex] = make([]chroniclesdk.InstanceRaidGroupMember, 0, len(group))
		for _, memberGUID := range group {
			if memberGUID.IsZero() {
				continue
			}
			member := chroniclesdk.InstanceRaidGroupMember{GUID: memberGUID}
			if player, ok := players[memberGUID]; ok {
				member.Name = player.Name
				member.Class = string(player.Class)
			}
			groups[groupIndex] = append(groups[groupIndex], member)
		}
	}
	return chroniclesdk.InstanceRaidGroupComposition{ObservedAt: at, Groups: groups}
}
