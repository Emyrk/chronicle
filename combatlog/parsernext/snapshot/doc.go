// Package snapshot reserves the orchestration boundary for future snapshots.
// No snapshot/resume support is implemented yet. State schemas and codecs must
// live beside their state owners (common or an expansion), not in this package.
// Future orchestration may assemble owner-provided snapshots; it must not own
// combat state or import the legacy parser to fake resumability.
package snapshot
