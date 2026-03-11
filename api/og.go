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
// It attempts to parse the identifier as a UUID first, falling back to slug lookup.
func (api *API) InstanceOGResolver(instanceIDOrSlug string) *frontend.OGData {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	db := api.Opts.Zed

	inst, err := resolveInstance(ctx, db, instanceIDOrSlug)
	if err != nil {
		return nil
	}

	encounters, _ := db.EncountersByInstanceID(ctx, inst.ID)
	players, _ := db.InstancePlayersByInstanceID(ctx, inst.ID)

	bossKills := 0
	var totalDuration time.Duration
	for _, e := range encounters {
		if e.Boss && (e.KillType == database.KillTypeClean || e.KillType == database.KillTypePartial) {
			bossKills++
		}
		if e.StartTime.Valid && e.EndTime.Valid {
			totalDuration += e.EndTime.Time.Sub(e.StartTime.Time)
		}
	}

	title := fmt.Sprintf("Chronicle - %s", inst.Name)

	var parts []string
	if inst.GuildName.Valid && inst.GuildName.String != "" {
		parts = append(parts, inst.GuildName.String)
	}
	parts = append(parts,
		fmt.Sprintf("%d bosses killed", bossKills),
		fmt.Sprintf("%d players", len(players)),
		formatDuration(totalDuration),
	)
	desc := strings.Join(parts, " · ")

	return &frontend.OGData{
		Title:       title,
		Description: desc,
		URL:         fmt.Sprintf("https://chronicle.gg/instances/%s", instanceIDOrSlug),
	}
}

func resolveInstance(ctx context.Context, db *authz.Authz, idOrSlug string) (database.LogInstancesGuild, error) {
	id, err := uuid.Parse(idOrSlug)
	if err == nil {
		return db.Instance(ctx, id)
	}
	return db.InstanceBySlug(ctx, pgtype.Text{String: idOrSlug, Valid: true})
}

func formatDuration(d time.Duration) string {
	d = d.Round(time.Second)
	h := int(d.Hours())
	m := int(d.Minutes()) % 60
	s := int(d.Seconds()) % 60

	if h > 0 {
		return fmt.Sprintf("%dh %dm", h, m)
	}
	if m > 0 {
		return fmt.Sprintf("%dm %ds", m, s)
	}
	return fmt.Sprintf("%ds", s)
}
