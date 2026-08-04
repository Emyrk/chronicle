// Package resynccandidate provides filtering, grouping, and deduplication of
// resync candidate rows returned by the database. Version comparison uses
// internal/semverenc for full major.minor.patch semantics.
package resynccandidate

import (
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/semverenc"
	"github.com/google/uuid"
)

// Group represents a deduplicated log group with its instances.
type Group struct {
	ID            uuid.UUID
	ParserVersion string
	Instances     []string
	RealmIDs      []uuid.UUID // Distinct realm IDs across instances.
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
	for _, r := range rows {
		if semverenc.Encode(r.ParserVersion) >= targetEnc {
			continue
		}
		if _, ok := seen[r.ID]; ok {
			continue
		}
		if limit > 0 && len(ordered) >= limit {
			continue
		}
		seen[r.ID] = &Group{ID: r.ID, ParserVersion: r.ParserVersion}
		ordered = append(ordered, r.ID)
	}

	// Then collect every instance and realm represented by each selected log
	// group. Reparsing replaces the complete group, so preflight validation must
	// cover datasets used by instances that were already on the target version too.
	realmSeen := make(map[uuid.UUID]map[uuid.UUID]bool, len(seen))
	for _, r := range rows {
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
