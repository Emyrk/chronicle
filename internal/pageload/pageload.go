// Package pageload memoises the page lookups that several parts of one HTML
// response repeat: the indexing check, the crawlable summary (serviceseo) and
// the Open Graph metadata (serviceog) each resolve the same instance or
// character. With a cache on the request context (WithCache) each lookup runs
// once per request; without one every call queries the store.
package pageload

import (
	"context"
	"errors"
	"sync"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/Emyrk/chronicle/database"
)

// InstanceStore is the read access instance pages need.
type InstanceStore interface {
	PublicInstance(ctx context.Context, id uuid.UUID) (database.LogInstancesGuild, error)
	PublicInstanceBySlug(ctx context.Context, hashedSlug pgtype.Text) (database.LogInstancesGuild, error)
	InstanceWithUnlisted(ctx context.Context, id uuid.UUID) (database.InstanceWithUnlistedRow, error)
	InstanceBySlugWithUnlisted(ctx context.Context, hashedSlug pgtype.Text) (database.InstanceBySlugWithUnlistedRow, error)
	EncountersByInstanceID(ctx context.Context, instanceID uuid.UUID) ([]database.LogInstanceEncounter, error)
	InstancePlayersByInstanceID(ctx context.Context, instanceID uuid.UUID) ([]database.LogInstancePlayer, error)
}

// CharacterStore is the read access character pages need.
type CharacterStore interface {
	GetWoWServerRealmByName(ctx context.Context, name string) (database.WowServerRealm, error)
	GetGamePlayerByGUID(ctx context.Context, arg database.GetGamePlayerByGUIDParams) (database.GetGamePlayerByGUIDRow, error)
}

type cacheKey struct{}

type cache struct {
	mu      sync.Mutex
	entries map[any]entry
}

type entry struct {
	value any
	err   error
}

// WithCache returns ctx with an empty per-request lookup cache.
func WithCache(ctx context.Context) context.Context {
	return context.WithValue(ctx, cacheKey{}, &cache{entries: map[any]entry{}})
}

// load returns the cached result for key, or calls fetch. Successes and "not
// found" are cached; other errors (timeouts, cancellations, transient
// failures) are not, so a later caller with a longer deadline retries.
func load[T any](ctx context.Context, key any, fetch func() (T, error)) (T, error) {
	c, _ := ctx.Value(cacheKey{}).(*cache)
	if c == nil {
		return fetch()
	}
	if e, ok := c.get(key); ok {
		v, _ := e.value.(T)
		return v, e.err
	}
	v, err := fetch()
	if err == nil || errors.Is(err, pgx.ErrNoRows) {
		c.mu.Lock()
		c.entries[key] = entry{value: v, err: err}
		c.mu.Unlock()
	}
	return v, err
}

func (c *cache) get(key any) (entry, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	e, ok := c.entries[key]
	return e, ok
}

// Instance is an instance row with its log's unlisted flag.
type Instance struct {
	database.LogInstancesGuild
	Unlisted bool
}

// instanceKey is an instance page's ID or hashed slug: id is set for an ID.
type instanceKey struct {
	id   uuid.UUID
	slug string
}

func instanceKeyOf(idOrSlug string) instanceKey {
	if id, err := uuid.Parse(idOrSlug); err == nil {
		return instanceKey{id: id}
	}
	return instanceKey{slug: idOrSlug}
}

type publicInstanceKey instanceKey

// InstanceWithUnlisted resolves an instance page's ID or hashed slug,
// listed or not.
func InstanceWithUnlisted(ctx context.Context, store InstanceStore, idOrSlug string) (Instance, error) {
	key := instanceKeyOf(idOrSlug)
	return load(ctx, key, func() (Instance, error) {
		if key.id != uuid.Nil {
			row, err := store.InstanceWithUnlisted(ctx, key.id)
			return Instance{LogInstancesGuild: row.LogInstancesGuild, Unlisted: row.Unlisted}, err
		}
		row, err := store.InstanceBySlugWithUnlisted(ctx, pgtype.Text{String: key.slug, Valid: true})
		return Instance{LogInstancesGuild: row.LogInstancesGuild, Unlisted: row.Unlisted}, err
	})
}

// PublicInstance resolves a listed instance by ID or hashed slug, as
// PublicInstance and PublicInstanceBySlug do: an unlisted one is not found.
// When this request already resolved the instance with InstanceWithUnlisted,
// that result answers without another query.
func PublicInstance(ctx context.Context, store InstanceStore, idOrSlug string) (database.LogInstancesGuild, error) {
	key := instanceKeyOf(idOrSlug)
	if c, _ := ctx.Value(cacheKey{}).(*cache); c != nil {
		if e, ok := c.get(key); ok {
			inst, _ := e.value.(Instance)
			if e.err != nil {
				return database.LogInstancesGuild{}, e.err
			}
			if inst.Unlisted {
				return database.LogInstancesGuild{}, pgx.ErrNoRows
			}
			return inst.LogInstancesGuild, nil
		}
	}
	return load(ctx, publicInstanceKey(key), func() (database.LogInstancesGuild, error) {
		if key.id != uuid.Nil {
			return store.PublicInstance(ctx, key.id)
		}
		return store.PublicInstanceBySlug(ctx, pgtype.Text{String: key.slug, Valid: true})
	})
}

type encountersKey uuid.UUID

// Encounters returns every encounter of an instance, invalidated ones included.
func Encounters(ctx context.Context, store InstanceStore, instanceID uuid.UUID) ([]database.LogInstanceEncounter, error) {
	return load(ctx, encountersKey(instanceID), func() ([]database.LogInstanceEncounter, error) {
		return store.EncountersByInstanceID(ctx, instanceID)
	})
}

type playersKey uuid.UUID

// Players returns an instance's players.
func Players(ctx context.Context, store InstanceStore, instanceID uuid.UUID) ([]database.LogInstancePlayer, error) {
	return load(ctx, playersKey(instanceID), func() ([]database.LogInstancePlayer, error) {
		return store.InstancePlayersByInstanceID(ctx, instanceID)
	})
}

type realmKey string

// RealmByName returns a realm by name.
func RealmByName(ctx context.Context, store CharacterStore, name string) (database.WowServerRealm, error) {
	return load(ctx, realmKey(name), func() (database.WowServerRealm, error) {
		return store.GetWoWServerRealmByName(ctx, name)
	})
}

// Player returns a character by realm and GUID or name.
func Player(ctx context.Context, store CharacterStore, arg database.GetGamePlayerByGUIDParams) (database.GetGamePlayerByGUIDRow, error) {
	return load(ctx, arg, func() (database.GetGamePlayerByGUIDRow, error) {
		return store.GetGamePlayerByGUID(ctx, arg)
	})
}
