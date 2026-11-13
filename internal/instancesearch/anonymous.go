package instancesearch

import (
	"errors"
	"fmt"
	"slices"
)

// ErrLoginRequired means the query uses something only logged-in users may
// use. Callers should prompt the user to log in.
var ErrLoginRequired = errors.New("log in to use advanced search")

const (
	anonymousMaxPredicates = 6
	anonymousMaxLimit      = 25
)

// AnonymousFields are the fields anonymous users may filter on. They are
// cheap columns on the instance row.
var AnonymousFields = []string{
	"instance.validity",
	"instance.name",
	"instance.realm",
	"instance.guild",
	"instance.started_at",
	"instance.difficulty",
	"instance.category",
}

// CheckAnonymous reports whether q is in the small subset of search
// available without logging in: no quantifiers, no or / not, at most a few
// instance-level predicates from AnonymousFields ANDed together. It returns
// ErrLoginRequired (wrapped) when q is outside that subset. q must still be
// compiled, which validates it fully.
func CheckAnonymous(q Query) error {
	if q.Limit > anonymousMaxLimit {
		return fmt.Errorf("%w: page size above %d", ErrLoginRequired, anonymousMaxLimit)
	}
	if q.Where == nil {
		return nil
	}
	preds := []Node{*q.Where}
	if q.Where.And != nil {
		preds = q.Where.And
	}
	if len(preds) > anonymousMaxPredicates {
		return fmt.Errorf("%w: more than %d filters", ErrLoginRequired, anonymousMaxPredicates)
	}
	for _, p := range preds {
		if p.Field == "" || p.And != nil || p.Or != nil || p.Not != nil || p.AnyPlayer != nil ||
			p.CountPlayers != nil || p.AnyEncounter != nil || p.CountEncounters != nil {
			return fmt.Errorf("%w: only simple filters are available without logging in", ErrLoginRequired)
		}
		if !slices.Contains(AnonymousFields, p.Field) {
			return fmt.Errorf("%w: %s", ErrLoginRequired, p.Field)
		}
	}
	return nil
}
