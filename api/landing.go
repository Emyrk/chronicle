package api

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/Emyrk/chronicle/api/chronicleproto"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"google.golang.org/protobuf/encoding/protowire"
	"google.golang.org/protobuf/proto"
)

// landingFeaturedTTL bounds how often the hero's pick (the newest positional
// run) is recomputed per tenant, and how long a site-setting change takes to
// reach the landing on every replica; the local replica also drops its cache
// on update.
const landingFeaturedTTL = 3 * time.Minute

// landingPickCandidates bounds how many of the newest positional runs the
// pick looks through for one whose last boss pull has a published mesh.
const landingPickCandidates = 20

// landingFeaturedCache holds the /start hero payload per tenant. It is hit by
// every ad click, so it is computed once per TTL rather than per request.
type landingFeaturedCache struct {
	mu      sync.Mutex
	entries map[uuid.UUID]landingFeaturedEntry
}

type landingFeaturedEntry struct {
	resp    chroniclesdk.LandingFeaturedResponse
	expires time.Time
}

func (c *landingFeaturedCache) get(ctx context.Context, tenantID uuid.UUID, load func(context.Context) (*chroniclesdk.LandingFeaturedRun, error)) (chroniclesdk.LandingFeaturedResponse, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	entry := c.entries[tenantID]
	if time.Now().Before(entry.expires) {
		return entry.resp, nil
	}
	if c.entries == nil {
		c.entries = make(map[uuid.UUID]landingFeaturedEntry)
	}
	run, err := load(ctx)
	if err != nil {
		// Serve the last good payload and retry soon.
		entry.expires = time.Now().Add(5 * time.Second)
		c.entries[tenantID] = entry
		return entry.resp, err
	}
	c.entries[tenantID] = landingFeaturedEntry{
		resp:    chroniclesdk.LandingFeaturedResponse{Featured: run},
		expires: time.Now().Add(landingFeaturedTTL),
	}
	return c.entries[tenantID].resp, nil
}

func (c *landingFeaturedCache) invalidate() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.entries = nil
}

// LandingFeatured returns hero metadata for the featured run on /start.
//
//	@Summary  Featured run for the landing hero
//	@Tags     Public
//	@Success  200 {object} chroniclesdk.LandingFeaturedResponse
//	@Router   /api/v1/landing/featured [get]
func (a *API) LandingFeatured(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	// Loaded on the app context (a request's cancellation must not fail the
	// shared cache), scoped to the request's tenant.
	tenantID := servicetenant.TenantIDFromContext(ctx)
	loadCtx := a.AppContext
	if tenantID != uuid.Nil {
		loadCtx = servicetenant.WithTenantID(loadCtx, tenantID)
	}
	resp, err := a.landing.get(loadCtx, tenantID, a.loadLandingFeatured)
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
	if id := a.landingFeaturedInstanceID(config); id != uuid.Nil {
		return a.loadLandingRun(ctx, id, nil)
	}
	return a.pickLandingRun(ctx)
}

// pickLandingRun is the tenant's newest public run with unit positions whose
// last boss pull has a published dungeon mesh for its map, or nil.
func (a *API) pickLandingRun(ctx context.Context) (*chroniclesdk.LandingFeaturedRun, error) {
	db := a.Opts.Zed
	candidates, err := db.LandingPositionalInstances(ctx, landingPickCandidates)
	if err != nil {
		return nil, fmt.Errorf("list positional instances: %w", err)
	}
	meshMaps := a.landingMeshMaps
	if meshMaps == nil {
		meshMaps = a.datasetMeshMaps
	}
	// Candidates share realms, so each realm's manifest is read once.
	meshesByRealm := make(map[uuid.UUID]map[int32]bool)
	for _, candidate := range candidates {
		meshes, ok := meshesByRealm[candidate.RealmID]
		if !ok {
			meshes, err = meshMaps(ctx, candidate.RealmID)
			if err != nil {
				return nil, fmt.Errorf("published meshes for realm %s: %w", candidate.RealmID, err)
			}
			meshesByRealm[candidate.RealmID] = meshes
		}
		encounters, err := db.EncountersByInstanceID(ctx, candidate.ID)
		if err != nil {
			return nil, fmt.Errorf("get encounters: %w", err)
		}
		last, ok := lastBossEncounter(encounters)
		if !ok || !meshes[last.MapID] {
			continue
		}
		return a.loadLandingRun(ctx, candidate.ID, encounters)
	}
	return nil, nil
}

// landingTimeRange is the instance's time range, falling back to its
// encounters' span where the instance has none (as the frontend's instance
// start falls back to the first encounter's), so offsets line up with the
// replay.
func landingTimeRange(startTime, endTime pgtype.Timestamptz, encounters []database.LogInstanceEncounter) (time.Time, time.Time, bool) {
	start, end := startTime.Time, endTime.Time
	for _, enc := range encounters {
		if !startTime.Valid && enc.StartTime.Valid && (start.IsZero() || enc.StartTime.Time.Before(start)) {
			start = enc.StartTime.Time
		}
		if !endTime.Valid && enc.EndTime.Valid && enc.EndTime.Time.After(end) {
			end = enc.EndTime.Time
		}
	}
	return start, end, !start.IsZero() && !end.IsZero()
}

// lastBossEncounter is the last boss kill, else the last boss wipe.
func lastBossEncounter(encounters []database.LogInstanceEncounter) (database.LogInstanceEncounter, bool) {
	var kill, wipe *database.LogInstanceEncounter
	for i, enc := range encounters {
		if !enc.Boss || !enc.StartTime.Valid || !enc.EndTime.Valid {
			continue
		}
		switch enc.KillType {
		case database.KillTypeClean, database.KillTypePartial:
			if kill == nil || enc.StartTime.Time.After(kill.StartTime.Time) {
				kill = &encounters[i]
			}
		case database.KillTypeWipe:
			if wipe == nil || enc.StartTime.Time.After(wipe.StartTime.Time) {
				wipe = &encounters[i]
			}
		}
	}
	if kill != nil {
		return *kill, true
	}
	if wipe != nil {
		return *wipe, true
	}
	return database.LogInstanceEncounter{}, false
}

// loadLandingRun builds the hero payload for one instance. encounters may be
// nil, and are then loaded.
func (a *API) loadLandingRun(ctx context.Context, id uuid.UUID, encounters []database.LogInstanceEncounter) (*chroniclesdk.LandingFeaturedRun, error) {
	db := a.Opts.Zed
	row, err := db.InstanceWithUnlisted(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("featured instance %s not found", id)
	}
	if err != nil {
		return nil, fmt.Errorf("get instance: %w", err)
	}
	inst := row.LogInstancesGuild
	if row.Unlisted || inst.InvalidatedAt.Valid {
		return nil, fmt.Errorf("featured instance %s is unlisted or invalidated", id)
	}

	if encounters == nil {
		encounters, err = db.EncountersByInstanceID(ctx, id)
		if err != nil {
			return nil, fmt.Errorf("get encounters: %w", err)
		}
	}
	start, end, ok := landingTimeRange(inst.StartTime, inst.EndTime, encounters)
	if !ok {
		return nil, fmt.Errorf("featured instance %s has no time range", id)
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

	if last, ok := lastBossEncounter(encounters); ok {
		run.Encounter = &chroniclesdk.LandingFeaturedEncounter{
			ID:            last.ID,
			Name:          last.Name,
			Kill:          last.KillType != database.KillTypeWipe,
			StartOffsetMs: last.StartTime.Time.Sub(start).Milliseconds(),
			EndOffsetMs:   last.EndTime.Time.Sub(start).Milliseconds(),
		}
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

// landingMeshFrame is the one glTF axis convention the 3D map places
// (DUNGEON_MESH_FRAME in the frontend's dungeonMeshes.ts).
const landingMeshFrame = "wow-yup-mirrored-x"

// landingMapManifest is the part of the maps manifest (frontend
// mapGallery.ts, WowMapManifest) that says which maps have a dungeon mesh.
type landingMapManifest struct {
	Instances []struct {
		MapID  int32           `json:"mapID"`
		Mesh   *landingMapMesh `json:"mesh"`
		Floors []struct {
			Mesh *landingMapMesh `json:"mesh"`
		} `json:"floors"`
	} `json:"instances"`
}

type landingMapMesh struct {
	Path   string `json:"path"`
	Frame  string `json:"frame"`
	Bounds struct {
		MinX float64 `json:"minX"`
		MaxX float64 `json:"maxX"`
		MinY float64 `json:"minY"`
		MaxY float64 `json:"maxY"`
	} `json:"bounds"`
}

// placeable mirrors the frontend's placeableDungeonMesh.
func (m *landingMapMesh) placeable() bool {
	return m != nil && m.Path != "" && m.Frame == landingMeshFrame &&
		m.Bounds.MaxX > m.Bounds.MinX && m.Bounds.MaxY > m.Bounds.MinY
}

// datasetMeshMaps returns the map IDs with a published dungeon mesh in the
// maps manifest of the realm's dataset, the one the run page's 3D map reads.
func (a *API) datasetMeshMaps(ctx context.Context, realmID uuid.UUID) (map[int32]bool, error) {
	datasetID, ok := a.Opts.Dataset.LookupDatasetForRealm(ctx, realmID)
	if !ok {
		return nil, nil
	}
	ds, err := a.Opts.Dataset.GetDataset(ctx, datasetID)
	if err != nil {
		return nil, fmt.Errorf("get dataset: %w", err)
	}
	if ds.IconBaseUrl == "" {
		return nil, nil
	}
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimRight(ds.IconBaseUrl, "/")+"/maps/manifest.json", nil)
	if err != nil {
		return nil, err
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetch maps manifest: %w", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("fetch maps manifest: status %d", res.StatusCode)
	}
	var manifest landingMapManifest
	if err := json.NewDecoder(res.Body).Decode(&manifest); err != nil {
		return nil, fmt.Errorf("decode maps manifest: %w", err)
	}
	meshes := make(map[int32]bool)
	for _, inst := range manifest.Instances {
		placeable := inst.Mesh.placeable()
		for _, floor := range inst.Floors {
			placeable = placeable || floor.Mesh.placeable()
		}
		if placeable {
			meshes[inst.MapID] = true
		}
	}
	return meshes, nil
}

// landingUpload derives upload provenance. Groups uploaded before the source
// was recorded report unknown. The upload completed when its newest file was
// stored.
func landingUpload(group database.GetWoWLogGroupByIDRow, lastEvent time.Time) chroniclesdk.LandingFeaturedUpload {
	out := chroniclesdk.LandingFeaturedUpload{Source: chroniclesdk.LandingUploadSourceUnknown}
	if src := group.WoWLogGroup.UploadSource; src.Valid {
		switch src.UploadSource {
		case database.UploadSourceSidekick:
			out.Source = chroniclesdk.LandingUploadSourceSidekick
		case database.UploadSourceWeb:
			out.Source = chroniclesdk.LandingUploadSourceManual
		case database.UploadSourceApi:
			out.Source = chroniclesdk.LandingUploadSourceAPI
		}
	}
	completed := group.WoWLogGroup.CreatedAt.Time
	for _, f := range group.Files {
		if f.CreatedAt.Valid && f.CreatedAt.Time.After(completed) {
			completed = f.CreatedAt.Time
		}
	}
	// A log appended to after the run, or a missing timestamp, gives no usable delay.
	if delay := completed.Sub(lastEvent); !completed.IsZero() && !lastEvent.IsZero() && delay >= 0 {
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
