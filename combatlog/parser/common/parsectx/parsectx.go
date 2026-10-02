package parsectx

import (
	"context"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb/talents"
	"github.com/google/uuid"
)

type logTypeKey struct{}

// Context carries the resolved parse metadata and dataset talent data for a log group.
type Context struct {
	Type        database.LogType
	Format      database.LogFormat
	Flavor      database.WoWFlavor
	DatasetID   uuid.UUID
	TalentTrees *talents.TalentTreeData
}

// With stamps the full resolved metadata onto ctx, replacing any existing
// parse context.
func With(ctx context.Context, c Context) context.Context {
	if existing, ok := FromContext(ctx); ok {
		*existing = c
		return ctx
	}
	cp := c
	return context.WithValue(ctx, logTypeKey{}, &cp)
}

// WithType stamps metadata derived from a log type, for callers that only have
// the legacy type (e.g. tests). Format and Flavor are derived from t.
func WithType(ctx context.Context, t database.LogType) context.Context {
	return With(ctx, Context{
		Type:   t,
		Format: t.Format(),
		Flavor: t.Flavor(),
	})
}

// Type returns the legacy log type from the parse context.
func Type(ctx context.Context) (database.LogType, bool) {
	if c, ok := FromContext(ctx); ok {
		return c.Type, true
	}
	return "", false
}

// Format returns the resolved parse format from the parse context.
func Format(ctx context.Context) (database.LogFormat, bool) {
	if c, ok := FromContext(ctx); ok {
		return c.Format, true
	}
	return "", false
}

// Flavor returns the resolved server flavor from the parse context.
func Flavor(ctx context.Context) (database.WoWFlavor, bool) {
	if c, ok := FromContext(ctx); ok {
		return c.Flavor, true
	}
	return nil, false
}

// DatasetTalents returns the resolved dataset and its imported talent trees.
func DatasetTalents(ctx context.Context) (uuid.UUID, *talents.TalentTreeData) {
	if c, ok := FromContext(ctx); ok {
		return c.DatasetID, c.TalentTrees
	}
	return uuid.Nil, nil
}

func FromContext(ctx context.Context) (*Context, bool) {
	if v := ctx.Value(logTypeKey{}); v != nil {
		if c, ok := v.(*Context); ok {
			return c, ok
		}
	}
	return nil, false
}
