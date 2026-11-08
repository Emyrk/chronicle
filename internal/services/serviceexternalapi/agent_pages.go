package serviceexternalapi

import (
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database"
)

// Character and guild view bounds.
const (
	characterViewRuns = 15
	guildViewRuns     = 15
	viewMaxParses     = 8
)

// characterView is the agent view of /armory/{realm}/{character}: the
// character and their recent runs with boss parses.
func (s *Service) characterView(w http.ResponseWriter, r *http.Request) (int, string) {
	ctx := r.Context()
	realmParam, name := chi.URLParam(r, "realm"), chi.URLParam(r, "character")
	var realmRow database.WowServerRealm
	var err error
	if id, parseErr := uuid.Parse(realmParam); parseErr == nil {
		realmRow, err = s.db.GetWoWServerRealm(ctx, id)
	} else {
		realmRow, err = s.db.GetWoWServerRealmByName(ctx, realmParam)
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return s.notFoundView(w, r, "Character not found", "Chronicle has no realm with this name.")
	}
	if err != nil {
		return s.errorView(w, r, name, err)
	}
	realm, err := s.db.ResolveExternalAPIRealm(ctx, database.ResolveExternalAPIRealmParams{Server: realmRow.ServerID.String(), Realm: realmRow.ID.String()})
	if errors.Is(err, pgx.ErrNoRows) {
		return s.notFoundView(w, r, "Character not found", "Chronicle has no realm with this name.")
	}
	if err != nil {
		return s.errorView(w, r, name, err)
	}
	player, err := s.db.GetExternalAPICharacter(ctx, database.GetExternalAPICharacterParams{
		RealmID: realm.ID, Identifier: parseCharacterGUID(name), Name: name,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return s.notFoundView(w, r, "Character not found", "Chronicle has no character with this name on this realm.")
	}
	if err != nil {
		return s.errorView(w, r, name, err)
	}
	character := characterFromRows(realm, player)
	tenantID := uuid.Nil
	if realm.TenantID.Valid {
		tenantID = realm.TenantID.UUID
	}
	rows, err := s.db.ListExternalAPICharacterLogs(ctx, database.ListExternalAPICharacterLogsParams{
		PlayerGuid: player.ID, TenantID: tenantID, ResultLimit: characterViewRuns + 1, RealmID: realm.ID,
	})
	if err != nil {
		return s.errorView(w, r, name, err)
	}

	links := newAgentLinks(r)
	var b strings.Builder
	b.WriteString(s.agentHeader(w, r, character.Name+" ("+character.Realm.Name+")"))
	summary := fmt.Sprintf("Level %d %s %s", character.Level, character.Race, character.Class)
	if character.Spec != "" {
		summary += ", " + character.Spec
	}
	if character.Role != "" {
		summary += " (" + character.Role + ")"
	}
	_, _ = fmt.Fprintf(&b, "- %s\n", markdownCell.Replace(summary))
	if character.AverageItemLevel != nil {
		_, _ = fmt.Fprintf(&b, "- Average item level: %d\n", *character.AverageItemLevel)
	}
	if character.Guild != nil {
		_, _ = fmt.Fprintf(&b, "- Guild: %s\n", markdownLink(character.Guild.Name, links.agent("/g/"+character.Guild.ID.String())))
	}
	_, _ = fmt.Fprintf(&b, "- Realm: %s (%s)\n", markdownCell.Replace(character.Realm.Name), markdownCell.Replace(character.Server.Name))
	if !character.UpdatedAt.IsZero() {
		_, _ = fmt.Fprintf(&b, "- Last seen in a log: %s UTC\n", character.UpdatedAt.UTC().Format("2006-01-02 15:04"))
	}

	b.WriteString("\n## Recent runs\n\n")
	more := len(rows) > characterViewRuns
	rows = rows[:min(len(rows), characterViewRuns)]
	if len(rows) == 0 {
		b.WriteString("No runs in this community.\n")
	} else {
		b.WriteString("| Run | Date | Guild | Bosses killed | Parses (boss: DPS/HPS) |\n|---|---|---|---|---|\n")
		for _, row := range rows {
			log, err := characterLogFromRow(row)
			if err != nil {
				return s.errorView(w, r, name, err)
			}
			guild := "-"
			if log.Guild != nil {
				guild = log.Guild.Name
			}
			_, _ = fmt.Fprintf(&b, "| %s | %s | %s | %d | %s |\n",
				markdownLink(log.Name, links.agent(links.instancePath(log.Slug, log.ID))), log.StartedAt.UTC().Format("2006-01-02"),
				markdownCell.Replace(guild), log.BossKills, markdownCell.Replace(parsesText(log.Performance)))
		}
		if more {
			b.WriteString("\nOlder runs: use the search link below.\n")
		}
	}

	b.WriteString("\n## Next links\n\n")
	runs := &searchNode{And: []searchNode{
		pred("instance.realm", chroniclesdk.InstanceSearchOpEq, character.Realm.Name),
		{AnyPlayer: &searchNode{Field: "player.name", Op: chroniclesdk.InstanceSearchOpEq, Value: character.Name}},
	}}
	menu := [][2]string{{"Every run with this character (search)", links.search(runs)}}
	if character.Guild != nil {
		menu = append(menu, [2]string{"Guild page", links.agent("/g/" + character.Guild.ID.String())})
	}
	menu = append(menu, [2]string{"How to use Chronicle (llms.txt)", links.agent("/llms.txt")})
	linkList(&b, menu)
	b.WriteString("\nFor the user:\n")
	linkList(&b, [][2]string{{"Open this character in Chronicle", links.user(links.armoryPath(character.Realm.Name, character.Name))}})
	return http.StatusOK, b.String()
}

func parsesText(perf []CharacterEncounterPerformance) string {
	if len(perf) == 0 {
		return "-"
	}
	parts := make([]string, 0, min(len(perf), viewMaxParses))
	score := func(p *int32) string {
		if p == nil {
			return "-"
		}
		return fmt.Sprintf("%d", *p)
	}
	for _, p := range perf[:min(len(perf), viewMaxParses)] {
		parts = append(parts, fmt.Sprintf("%s: %s/%s", p.EncounterName, score(p.DPSParse), score(p.HPSParse)))
	}
	if len(perf) > viewMaxParses {
		parts = append(parts, fmt.Sprintf("+%d more", len(perf)-viewMaxParses))
	}
	return strings.Join(parts, "; ")
}

// guildView is the agent view of /g/{id}: the guild and its recent runs.
func (s *Service) guildView(w http.ResponseWriter, r *http.Request) (int, string) {
	ctx := r.Context()
	id, err := uuid.Parse(chi.URLParam(r, "guild_id"))
	if err != nil {
		return s.notFoundView(w, r, "Guild not found", "Guild links look like /g/<guild id>.")
	}
	guild, err := s.db.GetGuildByID(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return s.notFoundView(w, r, "Guild not found", "Chronicle has no guild with this ID.")
	}
	if err != nil {
		return s.errorView(w, r, "Guild", err)
	}
	rows, err := s.db.ListExternalAPIRecentInstances(ctx, database.ListExternalAPIRecentInstancesParams{
		GuildID: id, ResultLimit: guildViewRuns + 1,
	})
	if err != nil {
		return s.errorView(w, r, guild.Name, err)
	}

	links := newAgentLinks(r)
	var b strings.Builder
	b.WriteString(s.agentHeader(w, r, guild.Name+" ("+guild.RealmName+")"))
	_, _ = fmt.Fprintf(&b, "- Realm: %s\n", markdownCell.Replace(guild.RealmName))

	b.WriteString("\n## Recent runs\n\n")
	more := len(rows) > guildViewRuns
	rows = rows[:min(len(rows), guildViewRuns)]
	var zones []string
	if len(rows) == 0 {
		b.WriteString("No public runs yet.\n")
	} else {
		b.WriteString("| Run | Date | Bosses killed | Players | Logged by |\n|---|---|---|---|---|\n")
		for _, row := range rows {
			_, _ = fmt.Fprintf(&b, "| %s | %s | %d/%d | %d | %s |\n",
				markdownLink(row.Name, links.agent(links.instancePath(row.HashedSlug.String, row.ID))), row.StartedAt.Time.UTC().Format("2006-01-02"),
				row.BossKills, row.BossCount, row.PlayerCount, markdownCell.Replace(dashIfEmpty(row.RecorderName)))
			if len(zones) < 3 && !containsFold(zones, row.Name) {
				zones = append(zones, row.Name)
			}
		}
		b.WriteString("\nThe same raid uploaded by several people appears once per upload.\n")
		if more {
			b.WriteString("Older runs: use the search link below.\n")
		}
	}

	b.WriteString("\n## Next links\n\n")
	byGuild := pred("instance.guild_id", chroniclesdk.InstanceSearchOpEq, id.String())
	menu := [][2]string{{"Every run by this guild (search)", links.search(&byGuild)}}
	for _, zone := range zones {
		menu = append(menu, [2]string{"This guild's " + zone + " runs (search)", links.search(&searchNode{And: []searchNode{
			byGuild, pred("instance.name", chroniclesdk.InstanceSearchOpEq, zone),
		}})})
	}
	menu = append(menu, [2]string{"How to use Chronicle (llms.txt)", links.agent("/llms.txt")})
	linkList(&b, menu)
	b.WriteString("\nFor the user:\n")
	linkList(&b, [][2]string{{"Open this guild in Chronicle", links.user("/g/" + id.String())}})
	return http.StatusOK, b.String()
}

func containsFold(values []string, v string) bool {
	for _, x := range values {
		if strings.EqualFold(x, v) {
			return true
		}
	}
	return false
}
