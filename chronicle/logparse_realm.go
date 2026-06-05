package chronicle

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters/instances"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/dbstatic"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
)

// resolvedRealm is the result of the three-tier realm resolution.
type resolvedRealm struct {
	ID   uuid.UUID
	Name string
}

// resolveRealm resolves the realm for a finalized instance using the three-tier
// precedence:
//  1. Realm name parsed from the combat log (REALM_INFO header)
//  2. Realm ID from job args (e.g. AzerothCore uploads where REALM_INFO is absent)
//  3. Well-known "Unknown" realm (created on demand)
func resolveRealm(
	ctx context.Context,
	db *authz.Authz,
	finalized *instances.FinalizedInstance,
	jobRealmID uuid.UUID,
) resolvedRealm {
	bypassCtx := servicetenant.AdminBypass(ctx)

	var realmID uuid.UUID
	var realmName string

	// Tier 1: realm name from the parsed log.
	if finalized.Realm != nil {
		realmName = finalized.Realm.RealmName
		realm, err := db.GetWoWServerRealmByName(bypassCtx, realmName)
		if err == nil {
			realmID = realm.ID
		}
	}

	// Tier 2: realm ID from job args.
	if realmID == uuid.Nil && jobRealmID != uuid.Nil {
		realmID = jobRealmID
		if realmName == "" {
			if r, err := db.GetWoWServerRealm(bypassCtx, realmID); err == nil {
				realmName = r.Name
			}
		}
	}

	// Tier 3: "Unknown" realm (create on demand).
	if realmID == uuid.Nil {
		realmID = dbstatic.RealmUnknown()
		_, err := db.GetWoWServerRealm(bypassCtx, realmID)
		if err != nil {
			_, _ = db.InsertWoWServer(bypassCtx, database.InsertWoWServerParams{
				ID:   dbstatic.ServerUnknown(),
				Name: "Unknown",
			})
			_, _ = db.InsertWoWServerRealm(bypassCtx, database.InsertWoWServerRealmParams{
				ID:       realmID,
				ServerID: dbstatic.ServerUnknown(),
				Name:     "Unknown",
			})
		}
	}

	return resolvedRealm{ID: realmID, Name: realmName}
}

// validateRealmTenant checks whether a realm belongs to the uploading tenant.
// Returns (keep, failureMsg) where keep=false means the instance should be
// skipped and failureMsg is the JSON-encoded rejection to surface in the UI.
func (w *WorkerLogParse) validateRealmTenant(
	ctx context.Context,
	db *authz.Authz,
	realm resolvedRealm,
	tenantID uuid.UUID,
	logType database.LogType,
	logGroupID uuid.UUID,
) (bool, string) {
	if tenantID == uuid.Nil {
		return true, ""
	}

	bypassCtx := servicetenant.AdminBypass(ctx)
	realmRow, err := db.GetWoWServerRealm(bypassCtx, realm.ID)
	if err != nil {
		return false, w.realmRejectionMessage(bypassCtx, db, realm.Name, uuid.Nil, logType, logGroupID)
	}

	server, sErr := db.GetWoWServer(bypassCtx, realmRow.ServerID)
	if sErr != nil || !server.TenantID.Valid || server.TenantID.UUID != tenantID {
		return false, w.realmRejectionMessage(bypassCtx, db, realmRow.Name, realmRow.ServerID, logType, logGroupID)
	}

	return true, ""
}

// realmRejection is JSON-encoded into InstanceFailures values so the frontend
// can render a rich error UI instead of a plain string.
type realmRejection struct {
	Type      string `json:"type"`                 // always "realm_rejection"
	Realm     string `json:"realm,omitempty"`      // detected realm name
	Message   string `json:"message"`              // headline
	UploadURL string `json:"upload_url,omitempty"` // suggested upload domain
	AddonURL  string `json:"addon_url,omitempty"`  // companion addon link
}

// realmRejectionMessage builds a JSON-encoded rejection string for InstanceFailures.
func (w *WorkerLogParse) realmRejectionMessage(ctx context.Context, db *authz.Authz, realmName string, serverID uuid.UUID, logType database.LogType, logGroupID uuid.UUID) string {
	r := realmRejection{
		Type:  "realm_rejection",
		Realm: realmName,
	}

	if realmName == "" || realmName == "Unknown" {
		r.Message = "Realm not found for this server."
	} else {
		r.Message = fmt.Sprintf("Realm %q does not belong to this server.", realmName)
	}

	primaryDomain := w.parent.primaryDomain
	logPath := "/logs/" + logGroupID.String()

	if primaryDomain != "" {
		if realmName != "" && realmName != "Unknown" && serverID != uuid.Nil {
			if server, err := db.GetWoWServer(ctx, serverID); err == nil {
				if server.TenantID.Valid {
					if tenant, tErr := db.GetTenantByID(ctx, server.TenantID.UUID); tErr == nil && tenant.Slug.Valid {
						r.UploadURL = tenant.Slug.String + "." + primaryDomain + logPath
					}
				} else {
					r.UploadURL = primaryDomain + logPath
				}
			}
		} else {
			r.UploadURL = primaryDomain + logPath
		}
	}

	if logType == database.LogTypeAzerothcoreClientside || logType == database.LogTypeAzerothcore {
		r.AddonURL = "https://github.com/Emyrk/ChronicleCompanionWoTLK"
	}

	if logType == database.LogTypeV2 {
		r.AddonURL = "https://github.com/Emyrk/ChronicleCompanion"
	}

	b, _ := json.Marshal(r)
	return string(b)
}
