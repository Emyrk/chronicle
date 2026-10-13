# Frontend scripts

## Replay Map fixture (`capture-kresh-fixture.mjs`)

The `Instance/Map/MapView3D/KreshReal` stories replay a real encounter from
`src/pages/Instance/EventsPanels/Map/fixtures/kreshReal.json`, so they render
with no backend. The loader (`fixtures/mapFixture.ts`) feeds the fixture's
events through the production `mapProcessor`.

To refresh the fixture, run this from `frontend/chronicle` (after `pnpm install`):

```bash
HOST=https://forever.chronicleclassic.com \
  node scripts/capture-kresh-fixture.mjs BItVqdXkz3j7UyoD 16392652-a7f8-4a69-a347-7b69d2bd557a
```

The arguments are `<instanceId> <encounterId> [outFile]`. The script fetches
the instance metadata and the Map panel's event streams (`unit_position`,
`unit_resources`, `damage`, `heal`, `spell_start`, `spell_go`, `interrupt`,
`slain`, `ressurection`). It decodes them with the app's own stream cursors and
keeps only that encounter's events and the fields the processor reads. It also
copies the map's artwork manifest entry, so the story makes no manifest request.
Some encounters, Kresh among them, come back with no hostile list. The script
then lists the hostile units it saw in the events and flags the one named after
the encounter as the boss.

**Privacy:** use public logs only. The fixture keeps the players' display names
and classes, and the names, entries and owners of the other units in the
encounter. It has no account ids, guild data or chat. The committed Kresh
fixture comes from a public log on forever.chronicleclassic.com.
