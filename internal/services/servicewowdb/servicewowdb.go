package servicewowdb

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/url"
	"strconv"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc/dbcmem"
	"github.com/Emyrk/chronicle/database/gamedb/talents"
	"github.com/Emyrk/chronicle/internal/lrucache"
	"github.com/Emyrk/chronicle/internal/services/serviceauthz"
	"github.com/Emyrk/chronicle/internal/services/servicedataset"
	"github.com/Emyrk/chronicle/internal/services/servicedbstore"
	"github.com/Emyrk/chronicle/internal/services/servicelogger"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/Emyrk/chronicle/database/gamedb"
	"github.com/Emyrk/chronicle/internal/services"

	"github.com/coder/serpent"
	"github.com/prometheus/client_golang/prometheus"
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
	}
}

func (s *Service) Start(ctx context.Context) error {
	logger := servicelogger.Logger(s.broker)
	az := serviceauthz.Authz(s.broker)
	store := servicedbstore.DatabaseStore(s.broker)
	cacheMetrics := lrucache.NewMetrics(prometheus.DefaultRegisterer)
	talentFetcher := talents.NewFetcher(store, 16, cacheMetrics)
	db, err := gamedb.New(ctx, gamedb.Options{
		SpellsDBCPath: s.spellDBCPath,
		DB:            az,
		DatasetID:     servicedataset.DefaultDatasetID,
		Talents:       talentFetcher,
		Metrics:       cacheMetrics,
	})
	if err != nil {
		return err
	}
	s.db = db

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
	s.router.Get("/talent-trees", s.handleGetTalentTrees)
}

type SpellResponse struct {
	*chrondbc.Spell
	DamageType    chrondbc.SpellDamageType `json:"damage_type"`
	AttackOutcome chrondbc.AttackOutcome   `json:"attack_outcome"`
}

func (s *Service) handleGetSpell(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "invalid spell id", http.StatusBadRequest)
		return
	}

	spell, err := s.db.Spell(chrondbc.SpellID(id))
	if err != nil {
		http.Error(w, "spell not found", http.StatusNotFound)
		return
	}

	// Cache for 24 hours since these are static data that won't change for the most part.
	w.Header().Set("Cache-Control", "public, max-age=86400")
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(SpellResponse{
		Spell:         spell,
		DamageType:    spell.SpellDamageType(),
		AttackOutcome: spell.AttackOutcome(),
	})
}

func (s *Service) handleGetSpellByName(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	if name == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}

	// URL-decode the name (chi gives us the raw URL-encoded value)
	decodedName, err := url.PathUnescape(name)
	if err != nil {
		http.Error(w, "invalid name encoding", http.StatusBadRequest)
		return
	}

	ids, err := s.db.SpellByName(decodedName)
	if err != nil {
		http.Error(w, "spell not found", http.StatusNotFound)
		return
	}

	// Fetch all spells by ID
	spells := make([]any, 0, len(ids))
	for _, id := range ids {
		if r.Context().Err() != nil {
			http.Error(w, "cancelled", http.StatusInternalServerError)
			return
		}
		spell, err := s.db.Spell(chrondbc.SpellID(id))
		if err != nil {
			continue // Skip missing spells
		}
		spells = append(spells, spell)
	}

	// Cache for 24 hours since these are static data that won't change for the most part.
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
	spells := make([]PeriodicSpellEntry, 0, len(dbcmem.PeriodicSpells))
	for id, spell := range dbcmem.PeriodicSpells {
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

func (s *Service) handleGetTalentTrees(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// dataset_id is optional. Resolution order:
	//   1. explicit ?dataset_id= query param
	//   2. the request tenant's default dataset (from tenant context)
	//   3. the server's compiled-in default dataset
	datasetID := servicedataset.DefaultDatasetID
	if t := servicetenant.TenantFromContext(ctx); t != nil && t.DefaultDatasetID.Valid {
		datasetID = t.DefaultDatasetID.UUID
	}
	if q := r.URL.Query().Get("dataset_id"); q != "" {
		parsed, err := uuid.Parse(q)
		if err != nil {
			httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
				Message: "invalid dataset_id",
			})
			return
		}
		datasetID = parsed
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

	w.Header().Set("Cache-Control", "public, max-age=86400")
	httpapi.Write(ctx, w, http.StatusOK, data)
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
