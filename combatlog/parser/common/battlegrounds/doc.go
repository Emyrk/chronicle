// Package battlegrounds records observed battleground zone episodes in v22 logs.
// Episodes are local observation sessions, not actual matches: zone messages
// provide map IDs, not match identity. No winner, team, or real match boundary
// can be inferred here. Inactivity, deaths, and repeated same-map observations
// do not split an episode. Without zone evidence there is no episode.
//
// Feed timestamp-reordered normalized messages, not raw modern parser output.
// Drain the reorder buffer's EOF tail before calling Finish explicitly.
// For mixed PvE/BG streams, Consumers must receive Recorder before encounters.State:
// fan-out shares message pointers in registration order, and PvE hooks may mutate
// activity or defer damage serialization. Recorder snapshots synchronously without
// resetting shared activity. Both consumers need all zone and metadata messages;
// do not prefilter the stream to combat events or BG-only zones. Consumers does not
// finalize either consumer: call Recorder.Finish and finalize the PvE instances
// separately after ConsumeAll has drained the reordered stream.
//
// Mixed-stream tests use injected map classifiers and instance resolvers. They do
// not establish production classification or resolve conflicting zone evidence
// (for example, a creature GUID implying a PvE map while a BG zone is selected).
// State is a single-consumer object and
// is independent of PvE encounters. A Process or Finish error invalidates the
// partial output, including anything already sent to the sink; callers must
// discard it. This package is not yet wired to uploads or persistence.
package battlegrounds
