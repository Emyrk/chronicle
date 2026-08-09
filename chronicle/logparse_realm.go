package chronicle

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/Emyrk/chronicle/combatlog/parser/common/instances"
	"github.com/Emyrk/chronicle/combatlog/parser/types/realm"
	"github.com/Emyrk/chronicle/combatlog/parser/types/realmclock"
	"github.com/Emyrk/chronicle/combatlog/parser/wotlk/companion"
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
// precedence. It extracts the realm name from the finalized instance and
// delegates to resolveRealmByName.
func resolveRealm(
	ctx context.Context,
	db *authz.Authz,
	finalized *instances.FinalizedInstance,
	jobRealmID uuid.UUID,
) resolvedRealm {
	var realmName string
	if finalized.Realm != nil {
		realmName = finalized.Realm.RealmName
	}
	return resolveRealmByName(ctx, db, realmName, jobRealmID)
}

// resolveRealmByName resolves a realm using the three-tier precedence:
//  1. Realm ID from job args (e.g. the realm bound to an AzerothCore upload key)
//  2. Realm name from a client-side log
//  3. Well-known "Unknown" realm (created on demand)
func resolveRealmByName(
	ctx context.Context,
	db *authz.Authz,
	realmName string,
	jobRealmID uuid.UUID,
) resolvedRealm {
	var realmID uuid.UUID

	// Tier 1: a caller-supplied realm ID is authoritative. Server-side logs may
	// report the AzerothCore realm name in CHRONICLE_HEADER, but routing is
	// controlled by the realm-specific upload key.
	if jobRealmID != uuid.Nil {
		realmID = jobRealmID
		if r, err := db.GetWoWServerRealm(ctx, realmID); err == nil {
			realmName = r.Name
		}
	}

	// Tier 2: realm name lookup within the restored tenant context.
	if realmID == uuid.Nil && realmName != "" {
		realm, err := db.GetWoWServerRealmByName(ctx, realmName)
		if err == nil {
			realmID = realm.ID
		}
	}

	// Tier 3: "Unknown" realm creation is an administrative fallback.
	if realmID == uuid.Nil {
		bypassCtx := servicetenant.AdminBypass(ctx)
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

// scanRealmName scans a raw (decompressed) combat log and extracts the realm
// name using format-specific markers. It reuses the existing parsing functions
// from the combatlog packages where possible. Returns "" if no realm info is
// found. Scans the entire file — realm info can appear at any point depending
// on format.
func scanRealmName(logFormat database.LogFormat, data []byte) string {
	scanner := bufio.NewScanner(bytes.NewReader(data))
	for scanner.Scan() {
		line := scanner.Text()
		switch logFormat {
		case database.LogFormat112aSuperwowAddon:
			// Real v1 lines have a WoW timestamp prefix:
			//   2/11 12:30:48.404  REALM_INFO: ...
			// The existing parser strips the prefix before calling
			// realm.IsRealmInfo, so we need to find REALM_INFO: in the
			// line and pass the substring.
			if idx := strings.Index(line, realm.PrefixRealmInfo); idx >= 0 {
				content := line[idx:]
				info, err := realm.ParseRealmInfo(&realmclock.Info{}, content)
				if err == nil && info.RealmName != "" {
					return info.RealmName
				}
			}

		case database.LogFormat112aCcAddon:
			// V2 format: <unix_ms>|HEADER|<guid>|<realmName>|<zone>|...
			if strings.Contains(line, "|HEADER|") {
				parts := strings.Split(line, "|")
				// parts[0]=ts, [1]=HEADER, [2]=guid, [3]=realmName
				if len(parts) >= 4 {
					if name := strings.TrimSpace(parts[3]); name != "" {
						return name
					}
				}
			}

		case database.LogFormat335aCcAddon:
			// WoTLK companion smuggles data in SPELL_CAST_FAILED's failedType
			// as bin-packed frames: [1Z:zone...][2H:ver,realm,...][3P...][4P...]
			// The payload can span multiple lines when long, but the H: header
			// frame is always short and appears early. Look for [<digit>H:
			// directly and extract the realm from the known field layout:
			//   H:<addonVersion>,<realmName>,<locale>,<wowVersion>,<build>,<sessionId>
			if name := scanCompanionHeaderRealm(line); name != "" {
				return name
			}

		case database.LogFormatAzerothcoreMod:
			// <unix_ms>  CHRONICLE_HEADER,"<realmName>","<version>",<build>
			if strings.Contains(line, "CHRONICLE_HEADER") {
				rest := line[strings.Index(line, "CHRONICLE_HEADER")+len("CHRONICLE_HEADER"):]
				if idx := strings.Index(rest, "\""); idx >= 0 {
					rest = rest[idx+1:]
					if end := strings.Index(rest, "\""); end >= 0 {
						if name := rest[:end]; name != "" {
							return name
						}
					}
				}
			}
		}
	}
	return ""
}

// scanCompanionHeaderRealm finds the companion H: header frame in a line and
// extracts the realm name. The companion addon packs multiple frames into
// SPELL_CAST_FAILED's failedType field:
//
//	[1Z:zone,mode,...][2H:ver,realm,locale,wowVer,build,session][3P...][4P...]
//
// The H: frame is always short and appears early, before any line wrapping.
// Returns "" if no H: frame is found.
func scanCompanionHeaderRealm(line string) string {
	payload, ok := scanCompanionHeaderPayload(line)
	if !ok {
		return ""
	}
	parts := strings.SplitN(payload, ",", 3) // only need first 2 fields
	if len(parts) < 2 {
		return ""
	}
	return strings.TrimSpace(parts[1])
}

func scanCompanionHeaderPayload(line string) (string, bool) {
	// Look for [<digit>H: pattern.
	for i := 0; i < len(line)-3; i++ {
		if line[i] != '[' || line[i+1] < '0' || line[i+1] > '9' || line[i+2] != 'H' || line[i+3] != ':' {
			continue
		}
		payload := line[i+4:] // skip "[NH:"
		end := strings.Index(payload, "]")
		if end < 0 {
			return "", false
		}
		return payload[:end], true
	}
	return "", false
}

// scanCompanionHeaderClock finds the first extended eight-field companion
// header with valid epoch and UTC-offset data.
func scanCompanionHeaderClock(data []byte) *realmclock.Info {
	scanner := bufio.NewScanner(bytes.NewReader(data))
	for scanner.Scan() {
		payload, ok := scanCompanionHeaderPayload(scanner.Text())
		if !ok {
			continue
		}
		clock, err := companion.ParseHeaderClock(payload)
		if err == nil && clock != nil {
			return clock
		}
	}
	return nil
}

// validateRealmTenant checks whether a realm belongs to the uploading tenant.
// Returns (keep, failureMsg) where keep=false means the instance should be
// skipped and failureMsg is the JSON-encoded rejection to surface in the UI.
func (w *WorkerLogParse) validateRealmTenant(
	ctx context.Context,
	db *authz.Authz,
	realm resolvedRealm,
	tenantID uuid.UUID,
	format database.LogFormat,
	logGroupID uuid.UUID,
) (bool, string) {
	if tenantID == uuid.Nil {
		return true, ""
	}

	bypassCtx := servicetenant.AdminBypass(ctx)
	realmRow, err := db.GetWoWServerRealm(bypassCtx, realm.ID)
	if err != nil {
		return false, w.realmRejectionMessage(bypassCtx, db, realm.Name, uuid.Nil, format, logGroupID)
	}

	server, sErr := db.GetWoWServer(bypassCtx, realmRow.ServerID)
	if sErr != nil || !server.TenantID.Valid || server.TenantID.UUID != tenantID {
		return false, w.realmRejectionMessage(bypassCtx, db, realmRow.Name, realmRow.ServerID, format, logGroupID)
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
func (w *WorkerLogParse) realmRejectionMessage(ctx context.Context, db *authz.Authz, realmName string, serverID uuid.UUID, format database.LogFormat, logGroupID uuid.UUID) string {
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

	if format == database.LogFormat335aCcAddon || format == database.LogFormatAzerothcoreMod {
		r.AddonURL = "https://github.com/Emyrk/ChronicleCompanionWoTLK"
	}

	if format == database.LogFormat112aCcAddon {
		r.AddonURL = "https://github.com/Emyrk/ChronicleCompanion"
	}

	b, _ := json.Marshal(r)
	return string(b)
}
