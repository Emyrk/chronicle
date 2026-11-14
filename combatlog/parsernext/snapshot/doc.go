// Package snapshot provides strict runtime compatibility identities and reserves
// the orchestration boundary for future complete-session snapshots. State codecs
// live beside their owners. Compatibility alone does not prove that a complete
// session graph can be captured or restored, and never bypasses owner guards.
package snapshot
