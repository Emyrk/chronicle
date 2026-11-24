// Package battlegrounds records observed battleground zone episodes in v22 logs.
// Episodes are local observation sessions, not actual matches: zone messages
// provide map IDs, not match identity. No winner, team, or real match boundary
// can be inferred here. Inactivity, deaths, and repeated same-map observations
// do not split an episode. Without zone evidence there is no episode.
//
// Feed timestamp-reordered normalized messages, not raw modern parser output.
// Drain the reorder buffer's EOF tail before calling Finish explicitly.
// State is a single-consumer object and
// is independent of PvE encounters. A Process or Finish error invalidates the
// partial output, including anything already sent to the sink; callers must
// discard it. This package is not yet wired to uploads or persistence.
package battlegrounds
