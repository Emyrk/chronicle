// Package referencedata stores tenant-scoped external player and guild snapshots.
package referencedata

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

const SchemaVersion int32 = 1

var (
	ErrInvalidKind        = errors.New("invalid external reference kind")
	ErrInvalidName        = errors.New("external reference name is required")
	ErrInvalidObservation = errors.New("external reference observation time is required")
	ErrOutOfOrder         = errors.New("external reference observation is older than the latest observation for that day")
)

type Kind string

const (
	KindPlayer Kind = "player"
	KindGuild  Kind = "guild"
)

type PlayerSnapshot struct {
	Gear    any `json:"gear,omitempty"`
	Talents any `json:"talents,omitempty"`
}

type GuildMember struct {
	Name string `json:"name"`
	Rank string `json:"rank,omitempty"`
}

type GuildSnapshot struct {
	Members []GuildMember `json:"members"`
}

type observation struct {
	tenantID      uuid.UUID
	realmID       uuid.UUID
	kind          Kind
	name          string
	observedAt    time.Time
	schemaVersion int32
	payload       any
}

type Result struct {
	Entity   database.ExternalReferenceEntity
	Snapshot database.ExternalReferenceSnapshot
	Content  database.ExternalReferenceContent
}

type Store struct {
	db database.Store
}

func NewStore(db database.Store) *Store {
	return &Store{db: db}
}

func (s *Store) ObservePlayer(ctx context.Context, tenantID, realmID uuid.UUID, name string, observedAt time.Time, snapshot PlayerSnapshot) (Result, error) {
	return s.observe(ctx, observation{
		tenantID: tenantID, realmID: realmID, kind: KindPlayer, name: name,
		observedAt: observedAt, schemaVersion: SchemaVersion, payload: snapshot,
	})
}

func (s *Store) ObserveGuild(ctx context.Context, tenantID, realmID uuid.UUID, name string, observedAt time.Time, snapshot GuildSnapshot) (Result, error) {
	normalized, err := normalizeGuildSnapshot(snapshot)
	if err != nil {
		return Result{}, err
	}
	return s.observe(ctx, observation{
		tenantID: tenantID, realmID: realmID, kind: KindGuild, name: name,
		observedAt: observedAt, schemaVersion: SchemaVersion, payload: normalized,
	})
}

func (s *Store) observe(ctx context.Context, observation observation) (Result, error) {
	if observation.kind != KindPlayer && observation.kind != KindGuild {
		return Result{}, ErrInvalidKind
	}
	observation.name = strings.TrimSpace(observation.name)
	if observation.name == "" {
		return Result{}, ErrInvalidName
	}
	if observation.observedAt.IsZero() {
		return Result{}, ErrInvalidObservation
	}
	if observation.schemaVersion <= 0 {
		return Result{}, fmt.Errorf("schema version must be positive")
	}

	payload, err := json.Marshal(observation.payload)
	if err != nil {
		return Result{}, fmt.Errorf("marshal external reference payload: %w", err)
	}
	contentHash := sha256.Sum256(payload)
	observedAt := observation.observedAt.UTC()
	observedOn := time.Date(observedAt.Year(), observedAt.Month(), observedAt.Day(), 0, 0, 0, 0, time.UTC)

	var result Result
	err = s.db.InTx(ctx, func(tx database.Store) error {
		entity, err := tx.UpsertExternalReferenceEntity(ctx, database.UpsertExternalReferenceEntityParams{
			TenantID:   observation.tenantID,
			RealmID:    observation.realmID,
			Kind:       string(observation.kind),
			Name:       observation.name,
			ObservedAt: database.Timestamptz(observedAt),
		})
		if err != nil {
			return fmt.Errorf("upsert external reference entity: %w", err)
		}

		contentParams := database.InsertExternalReferenceContentParams{
			TenantID:      observation.tenantID,
			Kind:          string(observation.kind),
			SchemaVersion: observation.schemaVersion,
			ContentHash:   contentHash[:],
			Payload:       payload,
		}
		if err := tx.InsertExternalReferenceContent(ctx, contentParams); err != nil {
			return fmt.Errorf("insert external reference content: %w", err)
		}
		content, err := tx.GetExternalReferenceContent(ctx, database.GetExternalReferenceContentParams(contentParams))
		if err != nil {
			return fmt.Errorf("get external reference content: %w", err)
		}

		if _, err := tx.LockExternalReferenceEntity(ctx, entity.ID); err != nil {
			return fmt.Errorf("lock external reference entity: %w", err)
		}
		observedOnDate := pgtype.Date{Time: observedOn, Valid: true}
		latest, err := tx.GetLatestExternalReferenceSnapshotForDay(ctx, database.GetLatestExternalReferenceSnapshotForDayParams{
			EntityID:   entity.ID,
			ObservedOn: observedOnDate,
		})

		if err == nil && observedAt.Before(latest.ObservedAt.Time) {
			return ErrOutOfOrder
		}

		var snapshot database.ExternalReferenceSnapshot
		switch {
		case err == nil && latest.ContentID == content.ID && !observedAt.Before(latest.ObservedAt.Time):
			snapshot, err = tx.UpdateExternalReferenceSnapshotObservation(ctx, database.UpdateExternalReferenceSnapshotObservationParams{
				ObservationTime: database.Timestamptz(observedAt),
				SnapshotID:      latest.ID,
			})
		case err == nil:
			snapshot, err = tx.InsertExternalReferenceSnapshot(ctx, database.InsertExternalReferenceSnapshotParams{
				TenantID:        observation.tenantID,
				Kind:            string(observation.kind),
				EntityID:        entity.ID,
				ContentID:       content.ID,
				ObservedOn:      observedOnDate,
				Sequence:        latest.Sequence + 1,
				ObservationTime: database.Timestamptz(observedAt),
			})
		case errors.Is(err, pgx.ErrNoRows):
			snapshot, err = tx.InsertExternalReferenceSnapshot(ctx, database.InsertExternalReferenceSnapshotParams{
				TenantID:        observation.tenantID,
				Kind:            string(observation.kind),
				EntityID:        entity.ID,
				ContentID:       content.ID,
				ObservedOn:      observedOnDate,
				Sequence:        1,
				ObservationTime: database.Timestamptz(observedAt),
			})
		default:
			return fmt.Errorf("get latest external reference snapshot: %w", err)
		}
		if err != nil {
			return fmt.Errorf("record external reference snapshot: %w", err)
		}

		if err := tx.SetExternalReferenceCurrentSnapshot(ctx, database.SetExternalReferenceCurrentSnapshotParams{
			SnapshotID: uuid.NullUUID{UUID: snapshot.ID, Valid: true},
			EntityID:   entity.ID,
		}); err != nil {
			return fmt.Errorf("set current external reference snapshot: %w", err)
		}

		entity, err = tx.GetExternalReferenceEntityByName(ctx, database.GetExternalReferenceEntityByNameParams{
			TenantID: observation.tenantID,
			RealmID:  observation.realmID,
			Kind:     string(observation.kind),
			Name:     observation.name,
		})
		if err != nil {
			return fmt.Errorf("reload external reference entity: %w", err)
		}
		result = Result{Entity: entity, Snapshot: snapshot, Content: content}
		return nil
	}, nil)
	if err != nil {
		return Result{}, err
	}
	return result, nil
}

func (s *Store) Current(ctx context.Context, entityID uuid.UUID) (database.GetExternalReferenceCurrentSnapshotRow, error) {
	return s.db.GetExternalReferenceCurrentSnapshot(ctx, entityID)
}

func (s *Store) At(ctx context.Context, tenantID, realmID uuid.UUID, kind Kind, name string, at time.Time) (database.GetExternalReferenceSnapshotAtRow, error) {
	return s.db.GetExternalReferenceSnapshotAt(ctx, database.GetExternalReferenceSnapshotAtParams{
		TenantID:   tenantID,
		RealmID:    realmID,
		Kind:       string(kind),
		Name:       name,
		ObservedAt: database.Timestamptz(at.UTC()),
	})
}

func (s *Store) History(ctx context.Context, entityID uuid.UUID) ([]database.ListExternalReferenceSnapshotHistoryRow, error) {
	return s.db.ListExternalReferenceSnapshotHistory(ctx, entityID)
}

func normalizeGuildSnapshot(snapshot GuildSnapshot) (GuildSnapshot, error) {
	members := append([]GuildMember{}, snapshot.Members...)
	seen := make(map[string]struct{}, len(members))
	for i := range members {
		members[i].Name = strings.TrimSpace(members[i].Name)
		members[i].Rank = strings.TrimSpace(members[i].Rank)
		if members[i].Name == "" {
			return GuildSnapshot{}, fmt.Errorf("guild member name is required")
		}
		normalizedName := strings.ToLower(members[i].Name)
		if _, ok := seen[normalizedName]; ok {
			return GuildSnapshot{}, fmt.Errorf("duplicate guild member %q", members[i].Name)
		}
		seen[normalizedName] = struct{}{}
	}
	slices.SortFunc(members, func(a, b GuildMember) int {
		if cmp := strings.Compare(strings.ToLower(a.Name), strings.ToLower(b.Name)); cmp != 0 {
			return cmp
		}
		return strings.Compare(a.Rank, b.Rank)
	})
	return GuildSnapshot{Members: members}, nil
}
