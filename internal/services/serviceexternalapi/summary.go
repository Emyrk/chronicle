package serviceexternalapi

import (
	"bufio"
	"bytes"
	"compress/gzip"
	"context"
	"encoding/binary"
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
	"github.com/Emyrk/chronicle/internal/aikey"
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
	// summaryFailureTTL briefly remembers failed computations (bad or
	// oversized streams, timeouts) so they are not retried on every request.
	summaryFailureTTL = time.Minute
	// summaryMaxConcurrent caps cache-miss computations across both
	// summaries. Further misses get 503 instead of queueing.
	summaryMaxConcurrent = 3
	// summaryComputeTimeout bounds one computation. It runs detached from the
	// request, because other requests may be waiting on the same result.
	summaryComputeTimeout = 30 * time.Second
	// summaryRequestCost charges summary routes like five standard requests.
	summaryRequestCost = 5 * externalStandardRequestCost
)

var (
	errSummaryBusy        = errors.New("summary computation busy")
	errEventStreamTooLong = errors.New("event stream exceeds the summary size limit")
)

// summaryCache memoizes one computed summary per instance and collapses
// concurrent first requests into one computation. Computations share a
// fixed number of slots with other summary caches.
type summaryCache[V any] struct {
	lru      *expirable.LRU[uuid.UUID, V]
	failures *expirable.LRU[uuid.UUID, error]
	group    singleflight.Group
	slots    chan struct{}
}

func newSummaryCache[V any](slots chan struct{}) *summaryCache[V] {
	return &summaryCache[V]{
		lru:      expirable.NewLRU[uuid.UUID, V](summaryCacheSize, nil, summaryCacheTTL),
		failures: expirable.NewLRU[uuid.UUID, error](summaryCacheSize, nil, summaryFailureTTL),
		slots:    slots,
	}
}

func (c *summaryCache[V]) cached(key uuid.UUID) (V, error, bool) {
	if value, ok := c.lru.Get(key); ok {
		return value, nil, true
	}
	if err, ok := c.failures.Get(key); ok {
		var zero V
		return zero, err, true
	}
	var zero V
	return zero, nil, false
}

func (c *summaryCache[V]) get(ctx context.Context, key uuid.UUID, compute func(context.Context) (V, error)) (V, error) {
	if value, err, ok := c.cached(key); ok {
		return value, err
	}
	value, err, _ := c.group.Do(key.String(), func() (any, error) {
		if value, err, ok := c.cached(key); ok {
			return value, err
		}
		select {
		case c.slots <- struct{}{}:
			defer func() { <-c.slots }()
		default:
			return nil, errSummaryBusy
		}
		// Detached so a disconnecting client does not fail other waiters,
		// but bounded so abandoned work cannot run forever.
		computeCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), summaryComputeTimeout)
		defer cancel()
		value, err := compute(computeCtx)
		if err != nil {
			c.failures.Add(key, err)
			return nil, err
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

// streamLimits caps how much one stored stream may expand to while decoding.
type streamLimits struct {
	totalBytes   int64  // decompressed bytes per stream
	messageBytes uint64 // one encoded event, or one encounter ID
}

// defaultStreamLimits are far above real raid nights; they only stop
// pathological streams from consuming the summary budget.
var defaultStreamLimits = streamLimits{totalBytes: 512 << 20, messageBytes: 1 << 20}

// cappedReader fails once more than remaining bytes are read.
type cappedReader struct {
	r         io.Reader
	remaining int64
}

func (c *cappedReader) Read(p []byte) (int, error) {
	if c.remaining <= 0 {
		var probe [1]byte
		n, err := c.r.Read(probe[:])
		if n > 0 {
			return 0, errEventStreamTooLong
		}
		return 0, err
	}
	if int64(len(p)) > c.remaining {
		p = p[:c.remaining]
	}
	n, err := c.r.Read(p)
	c.remaining -= int64(n)
	return n, err
}

// decodeEventSegments streams a stored event stream: gzip of concatenated
// per-encounter segments, each a header (encounter id, first-event unix
// millis, event count, body length) followed by length-delimited protobuf
// messages whose offsets are relative to the segment's first event. It never
// holds more than one message, and fails with errEventStreamTooLong when the
// stream or a message exceeds limits. The message slice is reused.
func decodeEventSegments(ctx context.Context, gz []byte, limits streamLimits, fn func(encounterID string, first time.Time, message []byte) error) error {
	if len(gz) == 0 {
		return nil
	}
	zr, err := gzip.NewReader(bytes.NewReader(gz))
	if err != nil {
		return err
	}
	reader := bufio.NewReader(&cappedReader{r: zr, remaining: limits.totalBytes})
	// Only the start of a segment may end the stream; EOF anywhere else means
	// the stream was cut short.
	midSegment := func(err error) error {
		if errors.Is(err, io.EOF) {
			return io.ErrUnexpectedEOF
		}
		return err
	}
	readVarint := func() (uint64, error) {
		value, err := binary.ReadUvarint(reader)
		return value, midSegment(err)
	}
	readLength := func() (uint64, error) {
		length, err := readVarint()
		if err == nil && length > limits.messageBytes {
			return 0, fmt.Errorf("%w: %d-byte entry", errEventStreamTooLong, length)
		}
		return length, err
	}
	var message []byte
	for {
		idLength, err := binary.ReadUvarint(reader)
		if errors.Is(err, io.EOF) {
			return nil // clean end between segments
		}
		if err != nil {
			return midSegment(err)
		}
		if idLength > limits.messageBytes {
			return fmt.Errorf("%w: %d-byte encounter id", errEventStreamTooLong, idLength)
		}
		id := make([]byte, idLength)
		if _, err := io.ReadFull(reader, id); err != nil {
			return midSegment(err)
		}
		firstMs, err := readVarint()
		if err != nil {
			return err
		}
		if _, err := readVarint(); err != nil { // event count
			return err
		}
		bodyLength, err := readVarint()
		if err != nil {
			return err
		}
		encounterID := string(id)
		first := time.UnixMilli(int64(firstMs)).UTC()
		for remaining := bodyLength; remaining > 0; {
			if err := ctx.Err(); err != nil {
				return err
			}
			length, err := readLength()
			if err != nil {
				return err
			}
			size := uint64(protowire.SizeVarint(length)) + length
			if size > remaining {
				return io.ErrUnexpectedEOF
			}
			remaining -= size
			if uint64(cap(message)) < length {
				message = make([]byte, length)
			}
			message = message[:length]
			if _, err := io.ReadFull(reader, message); err != nil {
				return midSegment(err)
			}
			if err := fn(encounterID, first, message); err != nil {
				return err
			}
		}
	}
}

func isPlayerGUID(id string) bool {
	parsed, err := guid.FromString(id)
	return err == nil && parsed.IsPlayer()
}

// summaryFilter selects pulls by encounter (name, case-insensitive, or
// encounter UUID) and attempt number.
type summaryFilter struct {
	encounter   string
	encounterID uuid.UUID
	attempt     int
}

func parseSummaryFilter(r *http.Request) (summaryFilter, string) {
	query := r.URL.Query()
	filter := summaryFilter{encounter: strings.TrimSpace(query.Get("encounter"))}
	if id, err := uuid.Parse(filter.encounter); err == nil {
		filter.encounterID = id
	}
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
	switch {
	case f.encounterID != uuid.Nil:
		if pull.EncounterID != f.encounterID {
			return false
		}
	case f.encounter != "" && !strings.EqualFold(f.encounter, pull.Encounter):
		return false
	}
	return f.attempt == 0 || f.attempt == pull.Attempt
}

// summaryLinks builds absolute Chronicle URLs from the request origin. On a
// keyed request they carry the AI key, so an agent following them keeps access.
type summaryLinks struct {
	ctx    context.Context
	origin string
	realm  string
}

func newSummaryLinks(r *http.Request, instance SummaryInstance) summaryLinks {
	return summaryLinks{ctx: r.Context(), origin: requestOrigin(r), realm: instance.RealmName}
}

func (l summaryLinks) link(u string) string {
	if l.ctx == nil {
		return u
	}
	return aikey.Link(l.ctx, u)
}

func (l summaryLinks) instance(instance SummaryInstance) SummaryInstance {
	ref := instance.Slug
	if ref == "" {
		ref = instance.ID.String()
	}
	instance.URL = l.link(l.origin + "/instances/" + url.PathEscape(ref))
	return instance
}

func (l summaryLinks) player(player SummaryPlayer) SummaryPlayer {
	if l.realm != "" && player.Name != "" && player.Name != player.GUID {
		player.URL = l.link(l.origin + "/armory/" + url.PathEscape(l.realm) + "/" + url.PathEscape(player.Name))
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
	summary, err := compute(ctx, instance)
	switch {
	case errors.Is(err, errSummaryBusy):
		w.Header().Set("Retry-After", "1")
		httpapi.Write(ctx, w, http.StatusServiceUnavailable, chroniclesdk.Response{Message: "Summaries are busy. Try again in a moment."})
		return
	case errors.Is(err, errEventStreamTooLong):
		httpapi.Write(ctx, w, http.StatusUnprocessableEntity, chroniclesdk.Response{Message: "This instance's event streams are too large to summarize."})
		return
	case errors.Is(err, context.DeadlineExceeded):
		httpapi.Write(ctx, w, http.StatusServiceUnavailable, chroniclesdk.Response{Message: "Summarizing this instance took too long."})
		return
	case err != nil:
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
	responses["422"] = OpenAPIResponse{Description: "The instance's event streams are too large to summarize."}
	responses["503"] = OpenAPIResponse{Description: "Summaries are busy (see Retry-After) or took too long."}
	return responses
}
