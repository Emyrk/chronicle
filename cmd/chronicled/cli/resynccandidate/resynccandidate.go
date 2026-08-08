// Package resynccandidate provides filtering, grouping, and deduplication of
// resync candidate rows returned by the database. Version comparison uses
// internal/semverenc for full major.minor.patch semantics.
package resynccandidate

import (
	"fmt"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/semverenc"
	"github.com/google/uuid"
)

// Group represents a deduplicated log group with its instances.
type Group struct {
	ID               uuid.UUID
	Owner            uuid.UUID
	LogFormat        database.LogFormat
	ParserVersion    string
	Instances        []string
	RealmIDs         []uuid.UUID // Distinct realm IDs across instances.
	TenantName       string
	TenantSlug       string
	TenantIncludeAll bool
	LogURL           string
	RawFileCount     int
	ExpectedFiles    int
	StorageValid     bool
	StorageError     string
}

// DisplayLines returns the detailed, plain-text representation shared by the
// dry-run TUI and non-interactive output.
func (g Group) DisplayLines(index int) []string {
	lines := []string{
		fmt.Sprintf("  %d. %s  parser=%s  instances=%d", index, g.ID, g.ParserVersion, len(g.Instances)),
		fmt.Sprintf("       owner:  %s", g.Owner),
	}

	tenant := g.TenantName
	if tenant == "" {
		tenant = "unknown"
	}
	if g.TenantSlug != "" {
		tenant += fmt.Sprintf(" (slug=%s, include_in_all=%t)", g.TenantSlug, g.TenantIncludeAll)
	}
	lines = append(lines, "       tenant: "+tenant)

	storageStatus := "FAILED"
	if g.StorageValid {
		storageStatus = "ok"
	}
	lines = append(lines, fmt.Sprintf(
		"       raw:    %d/%d file(s), storage preflight=%s",
		g.RawFileCount, g.ExpectedFiles, storageStatus,
	))
	if g.StorageError != "" {
		lines = append(lines, "       error:  "+g.StorageError)
	}
	if g.LogURL != "" {
		lines = append(lines, "       url:    "+g.LogURL)
	}
	for _, instance := range g.Instances {
		lines = append(lines, fmt.Sprintf("       - %s", instance))
	}
	return lines
}

func logFormat(row database.ResyncCandidateLogGroupsRow) database.LogFormat {
	if row.Format.Valid {
		return row.Format.LogFormat
	}
	return row.LogType.Format()
}

// FilterAndGroup takes raw candidate rows from the database, filters them
// by semver-encoded target version comparison, deduplicates by log group ID,
// and applies a limit on the number of distinct log groups returned.
//
// A row is a candidate if its encoded parser version is strictly less than
// the encoded target version. Groups are returned in the order their first
// row appears.
func FilterAndGroup(rows []database.ResyncCandidateLogGroupsRow, targetVersion string, limit int) []Group {
	targetEnc := semverenc.Encode(targetVersion)
	if targetEnc == 0 {
		return nil
	}

	seen := make(map[uuid.UUID]*Group)
	var ordered []uuid.UUID

	// First select distinct groups where at least one instance is outdated.
	// SuperWoW groups are intentionally excluded; the resync worker must never
	// delete or reparse their existing instances.
	for _, r := range rows {
		if logFormat(r) == database.LogFormat112aSuperwowAddon {
			continue
		}
		if semverenc.Encode(r.ParserVersion) >= targetEnc {
			continue
		}
		if _, ok := seen[r.ID]; ok {
			continue
		}
		if limit > 0 && len(ordered) >= limit {
			continue
		}
		seen[r.ID] = &Group{
			ID:            r.ID,
			Owner:         r.Owner,
			LogFormat:     logFormat(r),
			ParserVersion: r.ParserVersion,
		}
		ordered = append(ordered, r.ID)
	}

	// Then collect every instance and realm represented by each selected log
	// group. Reparsing replaces the complete group, so preflight validation must
	// cover datasets used by instances that were already on the target version too.
	realmSeen := make(map[uuid.UUID]map[uuid.UUID]bool, len(seen))
	for _, r := range rows {
		if logFormat(r) == database.LogFormat112aSuperwowAddon {
			continue
		}
		g, ok := seen[r.ID]
		if !ok {
			continue
		}
		g.Instances = append(g.Instances, r.InstanceName)
		if r.RealmID == uuid.Nil {
			continue
		}
		if realmSeen[r.ID] == nil {
			realmSeen[r.ID] = make(map[uuid.UUID]bool)
		}
		if !realmSeen[r.ID][r.RealmID] {
			realmSeen[r.ID][r.RealmID] = true
			g.RealmIDs = append(g.RealmIDs, r.RealmID)
		}
	}

	result := make([]Group, 0, len(ordered))
	for _, id := range ordered {
		result = append(result, *seen[id])
	}
	return result
}

// DefaultTargetVersion returns version.GitTag + "+" + version.GitCommit,
// or version.GitTag alone if GitCommit is empty or "unknown".
func DefaultTargetVersion(gitTag, gitCommit string) string {
	if gitCommit == "" || gitCommit == "unknown" {
		return gitTag
	}
	return gitTag + "+" + gitCommit
}
