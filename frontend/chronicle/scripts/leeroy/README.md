# Leeroy Jenkins replay (issue #1543)

The `Instance/Map/MapView3D/Leeroy` story replays Leeroy's charge into the
Rookery (Upper Blackrock Spire, map 229) from a fixture, with the guild's
YouTube upload of the 2005 video in the draggable picture-in-picture
(`YouTubeOverlay`), synced both ways: the video drives the replay clock, and
the overlay's seek bar scrubs both. `LeeroyFreeCamera` loops without the video
so you can orbit.

The clip runs from video 1:28 to 2:20: the planning stack, the charge at 1:33,
the pile-in, and the recorder's party dying at 2:12–2:15.

## What is real and what is not

| Part | Where it comes from |
|---|---|
| Egg positions (198) | Real: CMaNGOS classic-db `gameobject` rows for Rookery Egg (175124) on map 229 (`rookery-spawns.json`). |
| Room, terrace, stairs | Real: the map 229 mesh (rendered and calibrated by the map pipeline) and positions from real Rookery pulls in Chronicle logs. |
| Timing (charge, arrivals, fear, HP, deaths) | Observed in the frames by a vision model; each line in `annotations.json` says so. |
| Player positions | **Hand keyframes**, placed on the real geometry from the observations. Not a camera solve (see below). |
| Names and classes | Nameplates read from the frames, cross-checked against fan sources (the old wowwiki roster, dialogue analysis). Each class says where it comes from. |
| Who died | Death *times* are observed on the party frames. The *names* are not legible at 480p. Three follow the fan transcript's order (Jamaal, Forekin, Basphemy) and the fourth is a placeholder. |
| Which eggs hatch, whelp swings, health between observations | Illustrative, so the replay reads. Not seen. |

Rookery Guardians, Hatchers and Solakar are summoned by the Father Flame event,
so the spawn tables have no rows for them (and none appear in this clip).

## Camera solve (not done)

The ticket's step 3 projects screen-space feet onto the floor through a per-frame
camera pose. The pose would be solved against the map 229 mesh. That was not
possible for this spike:

- The mesh was not published when the spike was built; only a local render
  existed. The fixture's positions are hand keyframes checked against that
  mesh (274 sampled positions; all but 8 sit on a real surface, and the 8 are
  mid-fall off the terrace, on the stairs, or a whelp on a brazier step).
- At 640×480 the POV camera is close and moves constantly, the floor is a
  repeating checker, and whelps and spell effects cover most of the frame. The
  eggs are the only dense known landmarks. Matching individual eggs between the
  frame and the spawn table needs a manual landmark pick per shot, at least.

## Rebuild

Downloads go in a gitignored work dir (default `scripts/leeroy/.work`, or set
`WORK`). Treat them as untrusted data. Only derived data is committed.

```bash
# from frontend/chronicle
WORK=${WORK:-scripts/leeroy/.work}
mkdir -p "$WORK/spawn" "$WORK/media" "$WORK/frames"

# 1. Spawns (CMaNGOS classic-db full dump, ~13 MB gzipped)
curl -L -o "$WORK/spawn/classicdb.sql.gz" \
  https://github.com/cmangos/classic-db/raw/master/Full_DB/ClassicDB_1_12_1_z2815.sql.gz
gunzip -k "$WORK/spawn/classicdb.sql.gz"
node scripts/leeroy/extract-spawns.mjs "$WORK/spawn/classicdb.sql" > scripts/leeroy/rookery-spawns.json

# 2. Frames, for annotating (yt-dlp needs a JS runtime: --js-runtimes node)
yt-dlp --js-runtimes node -f "bv*[height<=480]+ba/b" -o "$WORK/media/%(id)s.%(ext)s" \
  https://www.youtube.com/watch?v=jbq5dsQ-l9M   # A Rough Go - Leeroy Jenkins (original)
yt-dlp --js-runtimes node -f "bv*[height<=480]+ba/b" -o "$WORK/media/%(id)s.%(ext)s" \
  https://www.youtube.com/watch?v=8hmgrHohDGM   # First Take/Dry Run (2017)
ffmpeg -ss 86 -t 30 -i "$WORK/media/jbq5dsQ-l9M.mkv" -vf fps=5 -start_number 0 "$WORK/frames/f_%04d.png"

# 3. Annotations: edit scripts/leeroy/annotations.json (times are video seconds)

# 4. Fixture
node scripts/leeroy/build-fixture.mjs
```

`build-fixture.mjs` is deterministic (seeded jitter). Its arguments are
`[annotations.json] [rookery-spawns.json] [outFile]`, and it writes
`src/pages/Instance/EventsPanels/Map/fixtures/leeroyRookery.json`.

## The floor

Until map 229's mesh is in the turtle manifest, the fixture carries a
placeholder `mesh` entry. Its extent (the Rookery and the stairs above it) is
the flat ground, and its GLB is never loaded. The story fetches the live
manifest first. Once map 229 has a mesh there, the story uses it and turns the
3D mesh on, with no code change. The scripted camera (`leeroyChargeCamera` in
`fixtures/leeroyRookery.ts`) is authored in world yards and converted for
whichever ground is in use.

## Extending to the full video

- Annotate the rest at 2–5 fps. The planning talk (0:00–1:28) is static. The
  wipe after 2:20 is mostly the recorder running and dying, with few nameplates.
- The first take (2017 upload) has a different camera path through the same
  room, so it can serve as a second view to cross-check positions.
- A real camera solve needs the published mesh, plus 4+ hand-picked landmarks
  per shot (pillars, braziers, the terrace edge, eggs) and a PnP fit. Feet are
  then cast onto the mesh. Expect it to work on the wide shots (planning, 1:36,
  1:40) and fail inside the whelp pile.
