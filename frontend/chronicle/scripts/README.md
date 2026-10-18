# Frontend scripts

## Replay Map fixture (`capture-kresh-fixture.mjs`)

The `Instance/Map/MapView3D/KreshReal` and `HakkarReal` stories replay real
encounters from `src/pages/Instance/EventsPanels/Map/fixtures/` (`kreshReal.json`,
`hakkarOcto.json`), so they render with no backend. The `HakkarReal*` stories
each follow one kind of unit (boss, totem, pet, add, player) on the Zul'Gurub
mesh, with the health and power columns on. The loader (`fixtures/mapFixture.ts`) feeds the fixture's
events through the production `mapProcessor`.

To refresh the fixtures, run this from `frontend/chronicle` (after `pnpm install`):

```bash
HOST=https://forever.chronicleclassic.com \
  node scripts/capture-kresh-fixture.mjs BItVqdXkz3j7UyoD 16392652-a7f8-4a69-a347-7b69d2bd557a
HOST=https://octo.chronicleclassic.com \
  node scripts/capture-kresh-fixture.mjs OJbOLvyr1pXA3AX9 45b6919d-675c-430c-9641-7c1286f94ad1 \
  src/pages/Instance/EventsPanels/Map/fixtures/hakkarOcto.json
```

The arguments are `<instanceId> <encounterId> [outFile]`. The script fetches
the instance metadata and the Map panel's event streams (`unit_position`,
`unit_resources`, `damage`, `heal`, `spell_start`, `spell_go`, `interrupt`,
`slain`, `ressurection`). It decodes them with the app's own stream cursors and
keeps only that encounter's events and the fields the processor reads. It also
copies the map's artwork manifest entry, so the story makes no manifest request.
Unit names and owners are resolved as the app does: inline, else from
`names_by_entry` and `summons_by_owner`. Resource rows carry power (current,
maximum, type) after health; the loader reads older rows without it.
Some encounters, Kresh among them, come back with no hostile list. The script
then lists the hostile units it saw in the events and flags the one named after
the encounter as the boss.

**Privacy:** use public logs only. The fixture keeps the players' display names
and classes, and the names, entries and owners of the other units in the
encounter. It has no account ids, guild data or chat. The committed Kresh
fixture comes from a public log on forever.chronicleclassic.com, the Hakkar one
from a log on octo.chronicleclassic.com.
