package chronicle

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/Emyrk/chronicle/combatlog/parser/common/armory"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbstatic"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type participantRealmStore interface {
	GetWoWServerRealm(context.Context, uuid.UUID) (database.WowServerRealm, error)
	GetWoWServer(context.Context, uuid.UUID) (database.WowServer, error)
	ListWoWServerRealms(context.Context, uuid.UUID) ([]database.WowServerRealm, error)
}

type participantRealmCatalog struct {
	names   map[string]uuid.NullUUID
	aliases map[string]uuid.NullUUID
}

// participantRealmCatalogs lives for one parse and one tenant only. The instance
// realm establishes server scope; its ID is never a participant fallback value.
type participantRealmScope struct{ server, tenant uuid.UUID }

type participantRealmCatalogs map[participantRealmScope]*participantRealmCatalog

func (cache participantRealmCatalogs) load(ctx context.Context, db participantRealmStore, instanceRealm, tenant uuid.UUID, format database.LogFormat) (*participantRealmCatalog, error) {
	if format != database.LogFormatV22Cleu || tenant == uuid.Nil || instanceRealm == uuid.Nil {
		return nil, nil
	}
	realm, err := db.GetWoWServerRealm(ctx, instanceRealm)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("participant realm scope: %w", err)
	}
	if realm.ServerID == dbstatic.ServerUnknown() {
		return nil, nil
	}
	if catalog, ok := cache[participantRealmScope{realm.ServerID, tenant}]; ok {
		return catalog, nil
	}
	server, err := db.GetWoWServer(ctx, realm.ServerID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("participant realm server: %w", err)
	}
	if server.ID != realm.ServerID || !server.TenantID.Valid || server.TenantID.UUID != tenant {
		return nil, nil
	}
	realms, err := db.ListWoWServerRealms(ctx, server.ID)
	if err != nil {
		return nil, fmt.Errorf("participant realm catalog: %w", err)
	}
	catalog := newParticipantRealmCatalog(server.ID, realms)
	cache[participantRealmScope{server.ID, tenant}] = catalog
	return catalog, nil
}

func newParticipantRealmCatalog(server uuid.UUID, realms []database.WowServerRealm) *participantRealmCatalog {
	c := &participantRealmCatalog{names: make(map[string]uuid.NullUUID), aliases: make(map[string]uuid.NullUUID)}
	add := func(index map[string]uuid.NullUUID, label string, id uuid.UUID) {
		if label == "" || id == uuid.Nil {
			return
		}
		if existing, ok := index[label]; ok && existing.UUID != id {
			index[label] = uuid.NullUUID{}
			return
		}
		index[label] = uuid.NullUUID{UUID: id, Valid: true}
	}
	for _, realm := range realms {
		if realm.ServerID != server {
			continue
		}
		add(c.names, realm.Name, realm.ID)
		for _, alias := range realm.Aliases {
			add(c.aliases, strings.ToLower(alias), realm.ID)
		}
	}
	return c
}

func (c *participantRealmCatalog) resolve(raw string) uuid.NullUUID {
	if c == nil || raw == "" {
		return uuid.NullUUID{}
	}
	match := func(name string) (uuid.NullUUID, bool) {
		if id, ok := c.names[name]; ok {
			return id, true
		}
		id, ok := c.aliases[strings.ToLower(name)]
		return id, ok
	}
	if id, ok := match(raw); ok {
		return id
	}
	normalized := normalizeRealmNameForFlavor(database.WoWFlavor{database.FlavorWoWForever}, raw)
	if normalized != raw {
		if id, ok := match(normalized); ok {
			return id
		}
	}
	return uuid.NullUUID{}
}

// armoryRealmResolver deliberately differs from participant persistence: unknown
// Forever identities are omitted from armory, never assigned the instance realm.
func armoryRealmResolver(format database.LogFormat, units *unitdb.Units, catalog *participantRealmCatalog) armory.PlayerRealmResolver {
	if format != database.LogFormatV22Cleu {
		return nil
	}
	return func(player combatant.Combatant) uuid.NullUUID {
		if player.Name == "" || player.Name == "Unknown" {
			return uuid.NullUUID{}
		}
		return catalog.resolve(units.PlayerRawRealm(player.Guid, player.Name, player.RawRealm))
	}
}
