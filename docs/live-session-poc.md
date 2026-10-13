# Live session proof of concept

Chronicle instance pages can start an ephemeral collaborative session from the **Live session** button.

## Included

- An authenticated user can start a public or password-protected room.
- Anonymous visitors with the instance invite URL can join.
- WebSocket signaling establishes a leader-to-participant WebRTC DataChannel.
- The current panel layout, panel types and options, filters, encounter selection, entity selection, time range, replay transport, and shared pointers are synchronized.
- Death Log and Status breakout open/closed state is carried through panel options. Breakout contents are derived from each browser's local event streams.
- Any participant can edit. The leader orders participant updates and rebroadcasts them.
- If the leader leaves, the session ends, replay pauses, and each participant keeps a functional local page with the last synchronized state.

## Deliberate limitations

- Rooms, passwords, participant tokens, and annotations are process-local memory only. A server restart removes them.
- The signaling hub assumes one API process. Multi-replica deployments need sticky routing or an ephemeral shared signaling service.
- The proof of concept uses Google's public STUN endpoint and does not configure TURN. Peers behind restrictive NATs may fail to connect.
- There is no WebSocket fallback after WebRTC negotiation failure.
- Breakout drag position, size, stacking order, and collapsed state are not synchronized yet. Remote Death Log and Status breakouts open at a deterministic local cascade position.
- Consumable, comparison, and custom-plugin breakouts are not registered in the shared breakout model yet.
- There is no annotation UI yet. Session-scoped annotations can be added as another DataChannel document message without database persistence.
- Full view snapshots are sent after edits rather than an operation log or CRDT. This is intentionally small for the proof of concept.
- Password entry uses a browser prompt and needs a designed dialog before production use.

## Production follow-ups

1. Add TURN credentials and a WebSocket data fallback.
2. Replace panel-local breakout handling with a controlled page-level breakout registry.
3. Add operation revisions and short gesture leases for concurrent drag and replay interactions.
4. Add rate limits, idle room expiry, moderation controls, and signaling metrics.
5. Add session-scoped 2D/3D annotation messages and export support.
