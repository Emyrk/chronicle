package servicewowdb

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/database/gamedb/talents"
	"github.com/Emyrk/chronicle/internal/services/serviceauthz"
	"github.com/Emyrk/chronicle/internal/services/servicecache"
	"github.com/Emyrk/chronicle/internal/services/servicedataset"
	"github.com/Emyrk/chronicle/internal/services/servicedbstore"
	"github.com/Emyrk/chronicle/internal/services/servicelogger"
	"github.com/Emyrk/chronicle/internal/services/servicepgxpool"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/Emyrk/chronicle/database/gamedb"
	"github.com/Emyrk/chronicle/internal/services"

	"github.com/coder/serpent"
)

var _ services.Servicer = (*Service)(nil)

func OnWoWDB() string {
	return (&Service{}).Name()
}

func WoWDB(broker *services.Services) *Service {
	return services.MustGet[*Service](broker)
}

type Service struct {
	broker *services.Services

	spellDBCPath string

	db     *gamedb.WoWDB
	store  database.Store
	router chi.Router
}

func New(broker *services.Services) *Service {
	return &Service{
		broker: broker,
	}
}

func (s *Service) GameDB() *gamedb.WoWDB {
	return s.db
}

func (s *Service) Name() string {
	return services.ServiceWoWDB
}

func (s *Service) DependsOn() []string {
	return []string{
		servicelogger.OnLogger(),
		serviceauthz.OnAuthz(),
		servicedbstore.OnDatabaseStore(),
		servicepgxpool.OnPGXPool(),
		servicecache.OnCache(),
	}
}

func (s *Service) Start(ctx context.Context) error {
	logger := servicelogger.Logger(s.broker)
	az := serviceauthz.Authz(s.broker)
	store := servicedbstore.DatabaseStore(s.broker)
	pool := servicepgxpool.PGXPool(s.broker)
	cacheSvc := servicecache.CacheService(s.broker)
	talentFetcher := talents.NewFetcher(store, cacheSvc, 16)
	db, err := gamedb.New(ctx, gamedb.Options{
		SpellsDBCPath: s.spellDBCPath,
		DB:            az,
		Pool:          pool,
		DatasetID:     servicedataset.DefaultDatasetID,
		Talents:       talentFetcher,
		CacheSvc:      cacheSvc,
	})
	if err != nil {
		return err
	}
	s.db = db
	s.store = store

	s.router = chi.NewRouter()
	s.setupRoutes()
	logger.Info("WoWDB service started",
		slog.Int("spell_count", s.db.TotalSpells()),
	)

	return nil
}

func (s *Service) setupRoutes() {
	s.router.Get("/spell/{id}", s.handleGetSpell)
	s.router.Get("/spell-by-name/{name}", s.handleGetSpellByName)
	s.router.Get("/periodic-spells", s.handleGetPeriodicSpells)
	s.router.Get("/extra-attack-spells", s.handleGetExtraAttackSpells)
	s.router.Get("/vulnerability-spells", s.handleGetVulnerabilitySpells)
	s.router.Get("/cooldown-spells", s.handleGetCooldownSpells)
	s.router.Get("/aura-duration-modifiers", s.handleGetAffectedAuraDurations)
	s.router.Get("/consumables", s.handleGetConsumables)
	s.router.Get("/consumable-disambiguations", s.handleGetConsumableDisambiguations)
	s.router.Get("/talent-trees", s.handleGetTalentTrees)
}

type SpellResponse struct {
	*chrondbc.Spell
	DamageType    chrondbc.SpellDamageType `json:"damage_type"`
	AttackOutcome chrondbc.AttackOutcome   `json:"attack_outcome"`
}

// resolveDatasetID resolves the dataset for a request using the same
// precedence as the talent-trees endpoint:
//  1. Explicit ?dataset_id= query param
//  2. Tenant's default dataset (from tenant context)
//  3. Server's compiled-in default dataset
func resolveDatasetID(r *http.Request) (uuid.UUID, error) {
	if q := r.URL.Query().Get("dataset_id"); q != "" {
		return uuid.Parse(q)
	}
	if t := servicetenant.TenantFromContext(r.Context()); t != nil && t.DefaultDatasetID.Valid {
		return t.DefaultDatasetID.UUID, nil
	}
	return servicedataset.DefaultDatasetID, nil
}

func (s *Service) handleGetSpell(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	idStr := chi.URLParam(r, "id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "invalid spell id", http.StatusBadRequest)
		return
	}

	datasetID, err := resolveDatasetID(r)
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "invalid dataset_id"})
		return
	}

	gameDB := s.db.ForDataset(datasetID)
	spell, err := gameDB.Spell(ctx, chrondbc.SpellID(id))
	if err != nil {
		http.Error(w, "spell not found", http.StatusNotFound)
		return
	}

	w.Header().Set(httpapi.DatasetHeader, datasetID.String())
	w.Header().Set("Cache-Control", "public, max-age=86400")
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(SpellResponse{
		Spell:         spell,
		DamageType:    spell.SpellDamageType(),
		AttackOutcome: spell.AttackOutcome(),
	})
}

func (s *Service) handleGetSpellByName(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	name := chi.URLParam(r, "name")
	if name == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}

	decodedName, err := url.PathUnescape(name)
	if err != nil {
		http.Error(w, "invalid name encoding", http.StatusBadRequest)
		return
	}

	datasetID, err := resolveDatasetID(r)
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "invalid dataset_id"})
		return
	}

	gameDB := s.db.ForDataset(datasetID)
	spells, err := gameDB.SpellsByName(ctx, decodedName)
	if err != nil || len(spells) == 0 {
		http.Error(w, "spell not found", http.StatusNotFound)
		return
	}

	w.Header().Set(httpapi.DatasetHeader, datasetID.String())
	w.Header().Set("Cache-Control", "public, max-age=86400")
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(spells)
}

// PeriodicSpellEntry is a minimal spell entry for listing periodic spells.
type PeriodicSpellEntry struct {
	ID        int32  `json:"id"`
	Name      string `json:"name"`
	HasDirect bool   `json:"has_direct"` // true if spell also has direct damage/healing
}

func (s *Service) handleGetPeriodicSpells(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	datasetID, err := resolveDatasetID(r)
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "invalid dataset_id"})
		return
	}

	scopedDB := s.db.ForDataset(datasetID)
	periodicMap, _ := scopedDB.PeriodicSpells(ctx)
	spells := make([]PeriodicSpellEntry, 0, len(periodicMap))
	for id, spell := range periodicMap {
		spells = append(spells, PeriodicSpellEntry{
			ID:        id,
			Name:      spell.Name,
			HasDirect: spell.HasDirect,
		})
	}

	// Cache for 24 hours since this is static data
	w.Header().Set("Cache-Control", "public, max-age=86400")
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(spells)
}

// ExtraAttackSpellEntry is a minimal spell entry for listing extra-attack spells.
type ExtraAttackSpellEntry struct {
	ID              int32  `json:"id"`
	Name            string `json:"name"`
	NumExtraAttacks int32  `json:"numExtraAttacks"`
}

func (s *Service) handleGetExtraAttackSpells(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	datasetID, err := resolveDatasetID(r)
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "invalid dataset_id"})
		return
	}

	m := s.db.ExtraAttackSpells(ctx, datasetID)
	spells := make([]ExtraAttackSpellEntry, 0, len(m))
	for id, spell := range m {
		spells = append(spells, ExtraAttackSpellEntry{
			ID:              id,
			Name:            spell.Name,
			NumExtraAttacks: spell.NumExtraAttacks,
		})
	}

	w.Header().Set("Cache-Control", "public, max-age=86400")
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(spells)
}

type VulnerabilitySpellEntry struct {
	ID            int32  `json:"id"`
	Name          string `json:"name"`
	SchoolBitmask int32  `json:"schoolBitmask"`
	PercentAffect *int32 `json:"percentAffect"`
	FlatAffect    *int32 `json:"flatAffect"`
}

func parseVulnerabilitySpellIDs(raw string) ([]int32, error) {
	if raw == "" {
		return []int32{}, nil
	}

	parts := strings.Split(raw, ",")
	spellIDs := make([]int32, 0, len(parts))
	seen := make(map[int32]struct{}, len(parts))
	for _, part := range parts {
		value := strings.TrimSpace(part)
		parsed, err := strconv.ParseInt(value, 10, 32)
		if err != nil || parsed <= 0 {
			return nil, fmt.Errorf("invalid spell ID %q", value)
		}
		spellID := int32(parsed)
		if _, ok := seen[spellID]; ok {
			continue
		}
		seen[spellID] = struct{}{}
		spellIDs = append(spellIDs, spellID)
	}
	return spellIDs, nil
}

func (s *Service) handleGetVulnerabilitySpells(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	datasetID, err := resolveDatasetID(r)
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "invalid dataset_id"})
		return
	}

	spellIDs, err := parseVulnerabilitySpellIDs(r.URL.Query().Get("spell_ids"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "invalid spell_ids", Detail: err.Error()})
		return
	}

	rows, err := s.store.ListVulnerabilitySpellsByDataset(ctx, database.ListVulnerabilitySpellsByDatasetParams{
		DatasetID: datasetID,
		SpellIds:  spellIDs,
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	spells := make([]VulnerabilitySpellEntry, 0, len(rows))
	for _, row := range rows {
		var percentAffect *int32
		if row.PercentAffect.Valid {
			value := row.PercentAffect.Int32
			percentAffect = &value
		}
		var flatAffect *int32
		if row.FlatAffect.Valid {
			value := row.FlatAffect.Int32
			flatAffect = &value
		}
		spells = append(spells, VulnerabilitySpellEntry{
			ID:            row.SpellID,
			Name:          row.Name,
			SchoolBitmask: row.SchoolBitmask,
			PercentAffect: percentAffect,
			FlatAffect:    flatAffect,
		})
	}

	w.Header().Set(httpapi.DatasetHeader, datasetID.String())
	w.Header().Set("Cache-Control", "public, max-age=86400")
	httpapi.Write(ctx, w, http.StatusOK, spells)
}

func (s *Service) handleGetTalentTrees(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	datasetID, err := resolveDatasetID(r)
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "invalid dataset_id"})
		return
	}

	// Surface the resolved dataset for debugging. Set before any Write so it
	// is present on the 404 path too (helps diagnose "wrong dataset" issues).
	w.Header().Set(httpapi.DatasetHeader, datasetID.String())

	data, err := s.db.TalentTrees(ctx, datasetID)
	if err != nil {
		// No talent data imported for this dataset yet → 404 so the UI can
		// degrade gracefully (e.g. show an "import talents" hint) instead of
		// surfacing a server error.
		if errors.Is(err, talents.ErrNoTalentData) {
			httpapi.Write(ctx, w, http.StatusNotFound, chroniclesdk.Response{
				Message: "no talent data for this dataset",
			})
			return
		}
		httpapi.InternalServerError(w, err)
		return
	}

	// Include the dataset's icon CDN base so the frontend loads icons from
	// the resolved dataset instead of the compiled-in server default.
	iconBaseURL := ""
	if ds, dsErr := s.store.GetDataset(ctx, datasetID); dsErr == nil {
		iconBaseURL = ds.IconBaseUrl
	}

	w.Header().Set("Cache-Control", "public, max-age=86400")
	httpapi.Write(ctx, w, http.StatusOK, talentTreesResponse{
		TalentTreeData: data,
		DatasetID:      datasetID,
		IconBaseURL:    iconBaseURL,
	})
}

// talentTreesResponse decorates the raw talent tree data with the resolved
// dataset identity. Additive: existing consumers only read "classes".
type talentTreesResponse struct {
	*talents.TalentTreeData
	DatasetID   uuid.UUID `json:"dataset_id"`
	IconBaseURL string    `json:"icon_base_url,omitempty"`
}

func (s *Service) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.router.ServeHTTP(w, r)
}

func (s *Service) Close(_ context.Context) error {
	if s.db != nil {
		return s.db.Close()
	}
	return nil
}

func (s *Service) Options() serpent.OptionSet {
	return serpent.OptionSet{
		{
			Name:        "spell-dbc-path",
			Description: "Path to Spell.dbc file.",
			Default:     "./assets/" + services.ServerName + "/Spell.dbc",
			Env:         "CHRONICLE_SPELL_DBC_PATH",
			Value:       serpent.StringOf(&s.spellDBCPath),
		},
	}
}

func (s *Service) Configures() []string {
	return []string{}
}
