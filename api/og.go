package api

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/frontend"
)

// InstanceOGResolver returns Open Graph metadata for an instance page.
// The key is either an instance ID/slug, or "share:<code>" for shared view links.
func (api *API) InstanceOGResolver(key string) *frontend.OGData {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	db := api.Opts.Zed

	var inst database.LogInstancesGuild
	var err error
	if code, ok := strings.CutPrefix(key, "share:"); ok {
		shared, sErr := db.GetSharedViewByCode(ctx, code)
		if sErr != nil {
			return nil
		}
		inst, err = db.Instance(ctx, shared.InstanceID)
	} else {
		inst, err = resolveInstance(ctx, db, key)
	}
	if err != nil {
		return nil
	}

	encounters, _ := db.EncountersByInstanceID(ctx, inst.ID)
	players, _ := db.InstancePlayersByInstanceID(ctx, inst.ID)

	bossKills := 0
	var startDate time.Time
	var endDate time.Time
	var combatDuration time.Duration
	for _, e := range encounters {
		if e.Boss && (e.KillType == database.KillTypeClean || e.KillType == database.KillTypePartial) {
			bossKills++
		}
		if e.StartTime.Valid && e.EndTime.Valid {
			combatDuration += e.EndTime.Time.Sub(e.StartTime.Time)
		}
		if e.StartTime.Valid && (startDate.IsZero() || e.StartTime.Time.Before(startDate)) {
			startDate = e.StartTime.Time
		}
		if e.EndTime.Valid && (endDate.IsZero() || e.EndTime.Time.After(endDate)) {
			endDate = e.EndTime.Time
		}
	}

	dur := endDate.Sub(startDate)
	hours := int(dur.Hours())
	minutes := int(dur.Minutes()) % 60

	var title strings.Builder
	if inst.GuildName.String != "" {
		title.WriteString(fmt.Sprintf("%s — ", inst.GuildName.String))
	}
	title.WriteString(inst.Name)
	title.WriteString(" on [" + inst.RealmName + "]")

	var desc strings.Builder
	sep := " · "
	desc.WriteString(startDate.Format("Jan 2, 2006"))
	desc.WriteString(sep)

	desc.WriteString(fmt.Sprintf("%dh %dm", hours, minutes))
	desc.WriteString(sep)

	desc.WriteString(fmt.Sprintf("%d players", len(players)))
	desc.WriteString("\n")
	desc.WriteString("Raid performance and contribution analysis tool by Chronicle.")

	return &frontend.OGData{
		Title:       title.String(),
		Description: desc.String(),
		URL:         fmt.Sprintf("https://chronicleclassic.com/instances/%s", inst.ID.String()),
	}
}

func resolveInstance(ctx context.Context, db *authz.Authz, idOrSlug string) (database.LogInstancesGuild, error) {
	id, err := uuid.Parse(idOrSlug)
	if err == nil {
		return db.Instance(ctx, id)
	}
	return db.InstanceBySlug(ctx, pgtype.Text{String: idOrSlug, Valid: true})
}
