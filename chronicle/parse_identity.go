package chronicle

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/Emyrk/chronicle/combatlog/parsernext/snapshot"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/dbstatic"
	"github.com/Emyrk/chronicle/database/gamedb"
	"github.com/google/uuid"
)

// ParseDatasetResolver must use only the supplied store, never a pooled resolver.
// With lock=true the caller supplies a transaction; the resolver must lock every
// realm/server/tenant row contributing to resolution and the selected dataset
// FOR SHARE, retaining those locks through publication commit. Errors must not
// silently fall back to another identity. Revision must be authoritative.
type ParseDatasetResolver func(ctx context.Context, db database.Store, realmID uuid.UUID, lock bool) (ResolvedDataset, error)

var ErrParseIdentityChanged = errors.New("parse dependency identity changed; restart from first file")

type parseIdentityFence struct {
	revision            datasetRevisionFence
	identity            snapshot.Compatibility
	realmID             uuid.UUID
	unresolvedRealmName string
	originalFlavor      database.WoWFlavor
	explicitFlavor      bool
	resolve             ParseDatasetResolver
}

func newParseIdentityFence(resolved ResolvedDataset, realmID uuid.UUID, format database.LogFormat, original database.WoWFlavor, explicit bool, build string, resolve ParseDatasetResolver) (*parseIdentityFence, database.WoWFlavor, error) {
	flavor, _ := resolveLogFlavor(original, explicit, resolved)
	identity := snapshot.Compatibility{DatasetID: resolved.DatasetID.String(), DatasetRevision: resolved.Revision, BuildIdentity: build, Format: string(format), Flavor: flavor.CanonicalKey()}
	if err := identity.Validate(); err != nil {
		return nil, nil, fmt.Errorf("capture parse identity: %w", err)
	}
	if resolve == nil {
		return nil, nil, fmt.Errorf("authoritative parse resolver required")
	}
	return &parseIdentityFence{revision: datasetRevisionFence{datasetID: resolved.DatasetID, revision: resolved.Revision}, identity: identity, realmID: realmID, originalFlavor: append(database.WoWFlavor(nil), original...), explicitFlavor: explicit, resolve: resolve}, flavor, nil
}

// captureUnresolvedRealm retains the prescan's format-normalized name when
// resolution used Unknown. Distinct missing names share that ID, but must not
// share an attempt's dependency identity. Explicit upload-key realms remain
// authoritative; known realm aliases are compared by resolved ID instead.
func (f *parseIdentityFence) captureUnresolvedRealm(name string, jobRealmID uuid.UUID) {
	if jobRealmID == uuid.Nil && f.realmID == dbstatic.RealmUnknown() {
		f.unresolvedRealmName = strings.ToLower(name)
	}
}

func (f *parseIdentityFence) checkPublicationRealm(realm resolvedRealm) error {
	if realm.ID != f.realmID {
		return fmt.Errorf("%w: parsed realm %s differs from captured realm %s", ErrParseIdentityChanged, realm.ID, f.realmID)
	}
	if f.unresolvedRealmName != "" && strings.ToLower(realm.Name) != f.unresolvedRealmName {
		return fmt.Errorf("%w: parsed unresolved realm %q differs from captured realm %q", ErrParseIdentityChanged, realm.Name, f.unresolvedRealmName)
	}
	return nil
}

func isParseIdentityError(err error) bool { return errors.Is(err, ErrParseIdentityChanged) }

func (f *parseIdentityFence) check(ctx context.Context, db database.Store, lock bool) (err error) {
	defer func() {
		if err != nil {
			err = fmt.Errorf("%w: %w", ErrParseIdentityChanged, err)
		}
	}()
	if f == nil {
		return nil
	} // Explicit legacy/offline path, not production fencing.
	resolved, err := f.resolve(ctx, db, f.realmID, lock)
	if err != nil {
		return fmt.Errorf("resolve parse acceptance identity: %w", err)
	}
	flavor, _ := resolveLogFlavor(f.originalFlavor, f.explicitFlavor, resolved)
	actual := f.identity
	actual.DatasetID = resolved.DatasetID.String()
	actual.DatasetRevision = resolved.Revision
	actual.Flavor = flavor.CanonicalKey()
	if err := f.identity.Check(actual); err != nil {
		return fmt.Errorf("%w: %v", ErrParseIdentityChanged, err)
	}
	if lock {
		return f.revision.lock(ctx, db)
	}
	return f.revision.check(ctx, db)
}

// checkParseIdentity uses a short transaction at dependency/parse acceptance
// boundaries. Publication calls check on its own transaction instead.
func (c *Chronicle) checkParseIdentity(ctx context.Context, f *parseIdentityFence) error {
	if f == nil {
		return nil
	}
	return c.Zed.InTx(ctx, func(tx *authz.AuthzTX) error { return f.check(ctx, tx, true) }, nil)
}

func (c *Chronicle) acquireParseGameDB(ctx context.Context, datasetID uuid.UUID, identity *parseIdentityFence) (gamedb.GameDB, func(), error) {
	if identity == nil {
		return c.WoWDB.ForDataset(datasetID), func() {}, nil
	}
	if err := identity.revision.validate(); err != nil {
		return nil, nil, err
	}
	if datasetID != identity.revision.datasetID {
		return nil, nil, ErrParseIdentityChanged
	}
	fresh, err := c.WoWDB.FreshForDataset(ctx, datasetID)
	if err != nil {
		return nil, nil, fmt.Errorf("acquire fresh parse game data: %w", err)
	}
	return fresh, func() { _ = fresh.Close() }, nil
}

// Strict attempts must not turn inferred dataset/tenant tags into explicit input
// for the next retry. Historical nonempty flavor rows have no origin metadata;
// they retain their existing interpretation until a separate migration policy.
// Effective strict flavor remains in the parse context and report, not this input.
func (c *Chronicle) persistAttemptFlavor(ctx context.Context, logID uuid.UUID, generation int64, flavor database.WoWFlavor, identity *parseIdentityFence) error {
	if identity != nil {
		return nil
	}
	return c.Zed.InTx(ctx, func(tx *authz.AuthzTX) error {
		if err := lockExpectedParseGeneration(ctx, tx, logID, generation); err != nil {
			return err
		}
		return tx.UpdateWoWLogGroupFlavor(ctx, database.UpdateWoWLogGroupFlavorParams{ID: logID, Flavor: flavor.Strings()})
	}, nil)
}
