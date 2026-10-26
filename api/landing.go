package api

import (
	"bytes"
	"compress/gzip"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"sort"
	"sync"
	"time"

	"github.com/Emyrk/chronicle/api/chronicleproto"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"google.golang.org/protobuf/encoding/protowire"
	"google.golang.org/protobuf/proto"
)

// landingFeaturedTTL bounds how long a site-setting change takes to reach the
// landing on every replica; the local replica also drops its cache on update.
const landingFeaturedTTL = 30 * time.Second

// landingFeaturedCache holds the /start hero payload. It is hit by every ad
// click, so it is computed once per TTL rather than per request.
type landingFeaturedCache struct {
	mu      sync.Mutex
	resp    chroniclesdk.LandingFeaturedResponse
	expires time.Time
}

func (c *landingFeaturedCache) get(ctx context.Context, load func(context.Context) (*chroniclesdk.LandingFeaturedRun, error)) (chroniclesdk.LandingFeaturedResponse, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if time.Now().Before(c.expires) {
		return c.resp, nil
	}
	run, err := load(ctx)
	if err != nil {
		// Serve the last good payload and retry soon.
		c.expires = time.Now().Add(5 * time.Second)
		return c.resp, err
	}
	c.resp = chroniclesdk.LandingFeaturedResponse{Featured: run}
	c.expires = time.Now().Add(landingFeaturedTTL)
	return c.resp, nil
}

func (c *landingFeaturedCache) invalidate() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.expires = time.Time{}
}

// LandingFeatured returns hero metadata for the featured run on /start.
//
//	@Summary  Featured run for the landing hero
//	@Tags     Public
//	@Success  200 {object} chroniclesdk.LandingFeaturedResponse
//	@Router   /api/v1/landing/featured [get]
func (a *API) LandingFeatured(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	resp, err := a.landing.get(a.AppContext, a.loadLandingFeatured)
	if err != nil {
		a.Opts.Logger.WarnContext(ctx, "load landing featured run", "error", err)
	}
	w.Header().Set("Cache-Control", "public, max-age=60")
	httpapi.Write(ctx, w, http.StatusOK, resp)
}

// landingFeaturedInstanceID resolves the site setting, falling back to the
// deployment default. uuid.Nil means nothing is featured.
func (a *API) landingFeaturedInstanceID(config database.SiteConfig) uuid.UUID {
	if config.LandingFeaturedInstanceID.Valid {
		return config.LandingFeaturedInstanceID.UUID
	}
	return a.Opts.LandingFeaturedID
}

func (a *API) loadLandingFeatured(ctx context.Context) (*chroniclesdk.LandingFeaturedRun, error) {
	db := a.Opts.Zed
	config, err := db.GetSiteConfig(ctx)
	if err != nil {
		return nil, fmt.Errorf("get site config: %w", err)
	}
	id := a.landingFeaturedInstanceID(config)
	if id == uuid.Nil {
		return nil, nil
	}

	row, err := db.InstanceWithUnlisted(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("featured instance %s not found", id)
	}
	if err != nil {
		return nil, fmt.Errorf("get instance: %w", err)
	}
	inst := row.LogInstancesGuild
	if row.Unlisted || inst.InvalidatedAt.Valid || !inst.StartTime.Valid || !inst.EndTime.Valid {
		return nil, fmt.Errorf("featured instance %s is unlisted, invalidated or has no time range", id)
	}
	start, end := inst.StartTime.Time, inst.EndTime.Time

	encounters, err := db.EncountersByInstanceID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("get encounters: %w", err)
	}
	players, err := db.InstancePlayersByInstanceID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("get players: %w", err)
	}
	units, err := db.InstanceUnitsByInstanceID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("get units: %w", err)
	}
	var slain []landingSlain
	evts, err := db.InstanceEvent(ctx, database.InstanceEventParams{InstanceID: id, Type: string(database.LogInstanceEventTypeSlain)})
	switch {
	case errors.Is(err, pgx.ErrNoRows):
	case err != nil:
		return nil, fmt.Errorf("get slain events: %w", err)
	default:
		slain, err = decodeLandingSlain(evts.Events)
		if err != nil {
			return nil, fmt.Errorf("decode slain events: %w", err)
		}
	}
	group, err := db.GetWoWLogGroupByID(ctx, inst.LogGroupID)
	if err != nil {
		return nil, fmt.Errorf("get log group: %w", err)
	}

	run := &chroniclesdk.LandingFeaturedRun{
		InstanceID:   id,
		InstanceName: inst.Name,
		DurationMs:   end.Sub(start).Milliseconds(),
		PlayerCount:  len(players),
		Bosses:       []chroniclesdk.LandingFeaturedBoss{},
		Deaths:       []chroniclesdk.LandingFeaturedDeath{},
		Upload:       landingUpload(group, end),
	}

	sort.Slice(encounters, func(i, j int) bool { return encounters[i].StartTime.Time.Before(encounters[j].StartTime.Time) })
	for _, enc := range encounters {
		if !enc.Boss {
			continue
		}
		run.Bosses = append(run.Bosses, chroniclesdk.LandingFeaturedBoss{
			Name:          enc.Name,
			StartOffsetMs: enc.StartTime.Time.Sub(start).Milliseconds(),
			EndOffsetMs:   enc.EndTime.Time.Sub(start).Milliseconds(),
		})
	}

	byGUID := make(map[string]database.LogInstancePlayer, len(players))
	names := make(map[string]string, len(players)+len(units))
	for _, u := range units {
		names[u.UnitGuid.String()] = u.Name
	}
	for _, p := range players {
		byGUID[p.UnitGuid.String()] = p
		names[p.UnitGuid.String()] = p.Name
	}
	for _, s := range slain {
		victim, ok := byGUID[s.target]
		if !ok {
			continue
		}
		run.Deaths = append(run.Deaths, chroniclesdk.LandingFeaturedDeath{
			OffsetMs:    s.at.Sub(start).Milliseconds(),
			VictimName:  victim.Name,
			VictimClass: string(victim.Class),
			KillerName:  names[s.killer],
		})
	}
	sort.SliceStable(run.Deaths, func(i, j int) bool { return run.Deaths[i].OffsetMs < run.Deaths[j].OffsetMs })
	return run, nil
}

// landingUpload derives upload provenance. The upload path (Sidekick or the
// web form) is not recorded per log group, so the source is always unknown.
// The upload completed when its newest file was stored.
func landingUpload(group database.GetWoWLogGroupByIDRow, lastEvent time.Time) chroniclesdk.LandingFeaturedUpload {
	out := chroniclesdk.LandingFeaturedUpload{Source: chroniclesdk.LandingUploadSourceUnknown}
	completed := group.WoWLogGroup.CreatedAt.Time
	for _, f := range group.Files {
		if f.CreatedAt.Valid && f.CreatedAt.Time.After(completed) {
			completed = f.CreatedAt.Time
		}
	}
	// A log appended to after the run, or a missing timestamp, gives no usable delay.
	if delay := completed.Sub(lastEvent); !completed.IsZero() && delay >= 0 {
		ms := delay.Milliseconds()
		out.DelayMs = &ms
	}
	return out
}

type landingSlain struct {
	at     time.Time
	target string
	killer string
}

// decodeLandingSlain reads a gzipped slain stream: concatenated per-encounter
// segments, each a header (encounter id, first-event unix millis, event count,
// body length) followed by length-delimited chronicleproto.Slain messages
// whose offsets are relative to that segment's first event.
func decodeLandingSlain(gz []byte) ([]landingSlain, error) {
	zr, err := gzip.NewReader(bytes.NewReader(gz))
	if err != nil {
		return nil, err
	}
	data, err := io.ReadAll(zr)
	if err != nil {
		return nil, err
	}

	var out []landingSlain
	for len(data) > 0 {
		_, n := protowire.ConsumeString(data)
		if n < 0 {
			return nil, protowire.ParseError(n)
		}
		data = data[n:]
		firstMs, n := protowire.ConsumeVarint(data)
		if n < 0 {
			return nil, protowire.ParseError(n)
		}
		data = data[n:]
		_, n = protowire.ConsumeVarint(data) // count
		if n < 0 {
			return nil, protowire.ParseError(n)
		}
		data = data[n:]
		bodyLen, n := protowire.ConsumeVarint(data)
		if n < 0 {
			return nil, protowire.ParseError(n)
		}
		data = data[n:]
		if bodyLen > uint64(len(data)) {
			return nil, io.ErrUnexpectedEOF
		}
		body := data[:bodyLen]
		data = data[bodyLen:]

		first := time.UnixMilli(int64(firstMs))
		for len(body) > 0 {
			msg, n := protowire.ConsumeBytes(body)
			if n < 0 {
				return nil, protowire.ParseError(n)
			}
			body = body[n:]
			var s chronicleproto.Slain
			if err := proto.Unmarshal(msg, &s); err != nil {
				return nil, err
			}
			out = append(out, landingSlain{
				at:     first.Add(time.Duration(s.GetMeta().GetOffsetMilli()) * time.Millisecond),
				target: s.GetTarget(),
				killer: s.GetCaster(),
			})
		}
	}
	return out, nil
}
