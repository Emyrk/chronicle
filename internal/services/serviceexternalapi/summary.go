package serviceexternalapi

import (
	"bytes"
	"compress/gzip"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/db2sdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/hashicorp/golang-lru/v2/expirable"
	"github.com/jackc/pgx/v5"
	"golang.org/x/sync/singleflight"
	"google.golang.org/protobuf/encoding/protowire"
)

// Summaries are computed from immutable event streams, so each instance is
// decoded once and kept for a while. The TTL only guards against reparses.
const (
	summaryCacheSize = 64
	summaryCacheTTL  = 30 * time.Minute
)

// summaryCache memoizes one computed summary per instance and collapses
// concurrent first requests into one computation.
type summaryCache[V any] struct {
	lru   *expirable.LRU[uuid.UUID, V]
	group singleflight.Group
}

func newSummaryCache[V any]() *summaryCache[V] {
	return &summaryCache[V]{lru: expirable.NewLRU[uuid.UUID, V](summaryCacheSize, nil, summaryCacheTTL)}
}

func (c *summaryCache[V]) get(key uuid.UUID, compute func() (V, error)) (V, error) {
	if value, ok := c.lru.Get(key); ok {
		return value, nil
	}
	value, err, _ := c.group.Do(key.String(), func() (any, error) {
		if value, ok := c.lru.Get(key); ok {
			return value, nil
		}
		value, err := compute()
		if err != nil {
			return value, err
		}
		c.lru.Add(key, value)
		return value, nil
	})
	if err != nil {
		var zero V
		return zero, err
	}
	return value.(V), nil
}

// SummaryInstance identifies the raid instance a summary was built from.
type SummaryInstance struct {
	ID        uuid.UUID `json:"id"`
	Name      string    `json:"name"`
	Slug      string    `json:"slug,omitempty"`
	RealmName string    `json:"realm_name,omitempty"`
	URL       string    `json:"url,omitempty"`
}

// SummaryPlayer identifies a player with an absolute character-page URL.
type SummaryPlayer struct {
	GUID  string `json:"guid"`
	Name  string `json:"name"`
	Class string `json:"class,omitempty"`
	Role  string `json:"role,omitempty"`
	URL   string `json:"url,omitempty"`
}

// SummaryPull is one boss pull. Attempt counts pulls of the same boss in
// time order, starting at 1.
type SummaryPull struct {
	EncounterID uuid.UUID `json:"encounter_id"`
	Encounter   string    `json:"encounter"`
	Attempt     int       `json:"attempt"`
	Outcome     string    `json:"outcome"`
	StartTime   time.Time `json:"start_time"`
	DurationMs  int64     `json:"duration_ms"`
}

// summaryContext is the instance metadata shared by both summaries.
type summaryContext struct {
	instance SummaryInstance
	pulls    []SummaryPull
	pullByID map[string]SummaryPull
	players  map[string]SummaryPlayer
	names    map[string]string
}

func (c *summaryContext) player(id string) SummaryPlayer {
	if player, ok := c.players[id]; ok {
		return player
	}
	return SummaryPlayer{GUID: id, Name: id}
}

func (c *summaryContext) unitName(id string) string {
	if id == "" {
		return "Unknown"
	}
	if name, ok := c.names[id]; ok && name != "" {
		return name
	}
	return id
}

func (s *Service) loadSummaryContext(ctx context.Context, instance database.LogInstancesGuild) (*summaryContext, error) {
	encounters, err := s.db.EncountersByInstanceID(ctx, instance.ID)
	if err != nil {
		return nil, fmt.Errorf("get encounters: %w", err)
	}
	players, err := s.db.InstancePlayersByInstanceID(ctx, instance.ID)
	if err != nil {
		return nil, fmt.Errorf("get players: %w", err)
	}
	units, err := s.db.InstanceUnitsByInstanceID(ctx, instance.ID)
	if err != nil {
		return nil, fmt.Errorf("get units: %w", err)
	}
	rankings, err := s.db.InstanceRankingRecords(ctx, instance.ID)
	if err != nil {
		return nil, fmt.Errorf("get ranking records: %w", err)
	}

	out := &summaryContext{
		instance: SummaryInstance{ID: instance.ID, Name: instance.Name, Slug: instance.HashedSlug.String, RealmName: instance.RealmName},
		pullByID: make(map[string]SummaryPull),
		players:  make(map[string]SummaryPlayer, len(players)),
		names:    make(map[string]string, len(players)+len(units)),
	}

	// Ranking records are the only stored role data; use the last non-empty
	// role seen for each player.
	roles := make(map[string]string)
	for _, record := range rankings {
		if record.PlayerRole != "" {
			roles[record.PlayerGuid] = record.PlayerRole
		}
	}
	for _, unit := range units {
		out.names[unit.UnitGuid.String()] = unit.Name
	}
	for _, player := range players {
		id := player.UnitGuid.String()
		out.names[id] = player.Name
		out.players[id] = SummaryPlayer{
			GUID: id, Name: player.Name, Class: string(db2sdk.HeroClass(player.Class)), Role: roles[id],
		}
	}

	sort.SliceStable(encounters, func(i, j int) bool {
		return encounters[i].StartTime.Time.Before(encounters[j].StartTime.Time)
	})
	attempts := make(map[string]int)
	for _, encounter := range encounters {
		if !encounter.Boss {
			continue
		}
		attempts[encounter.Name]++
		var durationMs int64
		if encounter.StartTime.Valid && encounter.EndTime.Valid {
			durationMs = encounter.EndTime.Time.Sub(encounter.StartTime.Time).Milliseconds()
		}
		pull := SummaryPull{
			EncounterID: encounter.ID,
			Encounter:   encounter.Name,
			Attempt:     attempts[encounter.Name],
			Outcome:     pullOutcome(encounter.KillType),
			StartTime:   encounter.StartTime.Time.UTC(),
			DurationMs:  durationMs,
		}
		out.pulls = append(out.pulls, pull)
		out.pullByID[encounter.ID.String()] = pull
	}
	return out, nil
}

func pullOutcome(kind database.KillType) string {
	switch kind {
	case database.KillTypeClean, database.KillTypePartial:
		return "kill"
	case database.KillTypeWipe:
		return "wipe"
	default:
		return string(kind)
	}
}

// loadEventStream returns the stored gzip stream, or nil when the instance has
// no stream of that type.
func (s *Service) loadEventStream(ctx context.Context, instanceID uuid.UUID, kind database.LogInstanceEventType) ([]byte, error) {
	events, err := s.db.InstanceEvent(ctx, database.InstanceEventParams{InstanceID: instanceID, Type: string(kind)})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get %s events: %w", kind, err)
	}
	return events.Events, nil
}

// decodeEventSegments walks a stored event stream: gzip of concatenated
// per-encounter segments, each a header (encounter id, first-event unix
// millis, event count, body length) followed by length-delimited protobuf
// messages whose offsets are relative to the segment's first event.
func decodeEventSegments(gz []byte, fn func(encounterID string, first time.Time, message []byte) error) error {
	if len(gz) == 0 {
		return nil
	}
	reader, err := gzip.NewReader(bytes.NewReader(gz))
	if err != nil {
		return err
	}
	data, err := io.ReadAll(reader)
	if err != nil {
		return err
	}
	for len(data) > 0 {
		encounterID, n := protowire.ConsumeString(data)
		if n < 0 {
			return protowire.ParseError(n)
		}
		data = data[n:]
		firstMs, n := protowire.ConsumeVarint(data)
		if n < 0 {
			return protowire.ParseError(n)
		}
		data = data[n:]
		if _, n = protowire.ConsumeVarint(data); n < 0 { // event count
			return protowire.ParseError(n)
		}
		data = data[n:]
		bodyLen, n := protowire.ConsumeVarint(data)
		if n < 0 {
			return protowire.ParseError(n)
		}
		data = data[n:]
		if bodyLen > uint64(len(data)) {
			return io.ErrUnexpectedEOF
		}
		body := data[:bodyLen]
		data = data[bodyLen:]

		first := time.UnixMilli(int64(firstMs)).UTC()
		for len(body) > 0 {
			message, n := protowire.ConsumeBytes(body)
			if n < 0 {
				return protowire.ParseError(n)
			}
			body = body[n:]
			if err := fn(encounterID, first, message); err != nil {
				return err
			}
		}
	}
	return nil
}

func isPlayerGUID(id string) bool {
	parsed, err := guid.FromString(id)
	return err == nil && parsed.IsPlayer()
}

// summaryFilter selects pulls by encounter (name, case-insensitive, or
// encounter UUID) and attempt number.
type summaryFilter struct {
	encounter string
	attempt   int
}

func parseSummaryFilter(r *http.Request) (summaryFilter, string) {
	query := r.URL.Query()
	filter := summaryFilter{encounter: strings.TrimSpace(query.Get("encounter"))}
	if raw := query.Get("attempt"); raw != "" {
		attempt, err := strconv.Atoi(raw)
		if err != nil || attempt < 1 {
			return filter, "attempt must be a positive integer."
		}
		filter.attempt = attempt
	}
	if format := query.Get("format"); format != "" && format != "json" && format != "md" {
		return filter, "format must be json or md."
	}
	return filter, ""
}

func (f summaryFilter) match(pull SummaryPull) bool {
	if f.encounter != "" && !strings.EqualFold(f.encounter, pull.Encounter) && f.encounter != pull.EncounterID.String() {
		return false
	}
	return f.attempt == 0 || f.attempt == pull.Attempt
}

// summaryLinks builds absolute Chronicle URLs from the request origin.
type summaryLinks struct {
	origin string
	realm  string
}

func newSummaryLinks(r *http.Request, instance SummaryInstance) summaryLinks {
	return summaryLinks{origin: requestOrigin(r), realm: instance.RealmName}
}

func (l summaryLinks) instance(instance SummaryInstance) SummaryInstance {
	ref := instance.Slug
	if ref == "" {
		ref = instance.ID.String()
	}
	instance.URL = l.origin + "/instances/" + url.PathEscape(ref)
	return instance
}

func (l summaryLinks) player(player SummaryPlayer) SummaryPlayer {
	if l.realm != "" && player.Name != "" && player.Name != player.GUID {
		player.URL = l.origin + "/armory/" + url.PathEscape(l.realm) + "/" + url.PathEscape(player.Name)
	}
	return player
}

func markdownLink(text, link string) string {
	if link == "" {
		return markdownCell.Replace(text)
	}
	return "[" + markdownCell.Replace(text) + "](" + markdownURL.Replace(link) + ")"
}

// markdownURL keeps parentheses in a path segment from closing the link.
var markdownURL = strings.NewReplacer("(", "%28", ")", "%29")

func formatPullTime(ms int64) string {
	if ms < 0 {
		ms = 0
	}
	return fmt.Sprintf("%d:%02d", ms/60000, (ms/1000)%60)
}

// serveSummary resolves the instance, validates filters, and writes either
// JSON or markdown.
func serveSummary[V any](
	s *Service, w http.ResponseWriter, r *http.Request,
	compute func(context.Context, database.LogInstancesGuild) (V, error),
	render func(V, summaryFilter, summaryLinks) any,
	markdown func(any) string,
) {
	ctx := r.Context()
	filter, message := parseSummaryFilter(r)
	if message != "" {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: message})
		return
	}
	instance, err := s.instanceByIdentifier(r)
	if errors.Is(err, pgx.ErrNoRows) {
		writeNotFound(w, r, "Instance not found")
		return
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	// The result is shared through the cache, so a client disconnecting must
	// not fail the computation for other waiters.
	summary, err := compute(context.WithoutCancel(ctx), instance)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	links := newSummaryLinks(r, SummaryInstance{RealmName: instance.RealmName})
	response := render(summary, filter, links)
	if r.URL.Query().Get("format") == "md" {
		w.Header().Set("Content-Type", "text/markdown; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		_, _ = io.WriteString(w, markdown(response))
		return
	}
	httpapi.Write(ctx, w, http.StatusOK, response)
}

func summaryParameters() []OpenAPIParameter {
	return []OpenAPIParameter{
		pathParameter("instance_id", "Instance UUID or slug", "example-instance"),
		queryParameter("encounter", "Only include pulls of this boss (case-insensitive name or encounter UUID)", false, "string", "Ragnaros"),
		queryParameter("attempt", "Only include this attempt number of each boss, starting at 1", false, "integer", 1),
		queryParameter("format", "Response format: json (default) or md", false, "string", "json"),
	}
}

func summaryOKResponse(example any, markdownExample string) map[string]OpenAPIResponse {
	responses := okResponse(example)
	responses["200"].Content["text/markdown"] = OpenAPIMediaType{Example: markdownExample}
	responses["400"] = OpenAPIResponse{Description: "Invalid attempt or format."}
	responses["404"] = OpenAPIResponse{Description: "Instance not found."}
	return responses
}
