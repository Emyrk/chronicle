package servicewhatsnew

import (
	"context"
	"errors"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/services/servicedbstore"
	"github.com/coder/serpent"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

var _ services.Servicer = (*Service)(nil)

func WhatsNew(broker *services.Services) *Service {
	return services.MustGet[*Service](broker)
}

func OnWhatsNew() string { return (&Service{}).Name() }

// releaseIDs is append-only. The final ID is the current What's New release;
// older or unknown persisted IDs are treated as unread.
var releaseIDs = []string{
	"custom-panels",
}

func CurrentID() string {
	if len(releaseIDs) == 0 {
		return ""
	}
	return releaseIDs[len(releaseIDs)-1]
}

type Service struct {
	broker *services.Services
	DB     database.Store
}

func New(broker *services.Services) *Service {
	return &Service{broker: broker}
}

func NewWithStore(store database.Store) *Service {
	return &Service{DB: store}
}

func (s *Service) Name() string               { return services.ServiceWhatsNew }
func (s *Service) Configures() []string       { return nil }
func (s *Service) DependsOn() []string        { return []string{servicedbstore.OnDatabaseStore()} }
func (s *Service) Options() serpent.OptionSet { return serpent.OptionSet{} }

func (s *Service) Start(context.Context) error {
	s.DB = servicedbstore.DatabaseStore(s.broker)
	return nil
}

func (s *Service) Close(context.Context) error { return nil }

type Status struct {
	CurrentID string
	HasUnread bool
}

func (s *Service) Status(ctx context.Context, userID uuid.UUID) (Status, error) {
	currentID := CurrentID()
	if currentID == "" {
		return Status{}, nil
	}
	state, err := s.DB.GetUserWhatsNewState(ctx, userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return Status{CurrentID: currentID, HasUnread: true}, nil
	}
	if err != nil {
		return Status{}, err
	}
	return Status{CurrentID: currentID, HasUnread: hasUnread(currentID, state.SeenID)}, nil
}

func hasUnread(currentID, seenID string) bool {
	return currentID != "" && seenID != currentID
}

func (s *Service) MarkRead(ctx context.Context, userID uuid.UUID) (Status, error) {
	currentID := CurrentID()
	if currentID == "" {
		return Status{}, nil
	}
	_, err := s.DB.MarkWhatsNewRead(ctx, database.MarkWhatsNewReadParams{
		UserID: userID, SeenID: currentID,
	})
	if err != nil {
		return Status{}, err
	}
	return Status{CurrentID: currentID, HasUnread: false}, nil
}
