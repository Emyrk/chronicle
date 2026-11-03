# Leeroy Jenkins replay (issue #1543)

The `Instance/Map/MapView3D/Leeroy` story replays the Leeroy Jenkins run
into the Rookery (Upper Blackrock Spire, map 229) from a fixture. The guild's
YouTube upload of the 2005 video plays in the draggable picture-in-picture
(`YouTubeOverlay`), synced both ways: the video drives the replay clock, and
the overlay's seek bar scrubs both. `LeeroyFreeCamera` loops without the video
so you can orbit.

**Player positions and deaths are per Internet Historian's map (2017), fan
approximation.** They come from his video
["Leeroy Jenkins | Map of the Players"](https://youtu.be/IAOLAw0k2DU) (2017):
a top-down map of the Rookery with all 13 players as numbered dots and the
original footage as an inset. We track his dots frame by frame and map them
onto the real room. His map is a hand-made fan reconstruction, not telemetry.
Credit for working out where everyone went is his.

The clip runs from video 1:24 to 2:50, the span his map covers. Leeroy walks
in alone at 1:26.5, the raid pours in after him from 1:34, then the pile-in,
the wipe and the end.

## What is real and what is not

| Part | Where it comes from |
|---|---|
| Player positions (13) | Per Internet Historian's map (2017), fan approximation. Tracked by `track-ih-map.py`, mapped to world X/Y by `fit-ih-map.py`, smoothed over 0.8 s. Before his map shows a player, they wait in the Hall of Binding and walk in through the door. |
| Deaths (names and times) | Per Internet Historian's map: the dots he draws dithered from then on. Basphemy 2:10.5, Ctidalwave 2:11.7, Chrisym 2:18.3. The recorder's party frames disagree (see below). |
| Heights | His map is flat. Each position takes the walkable floor under it (`rookery-floor.json`, derived from the map 229 mesh: the floor, or the rubble slope in the west). |
| Egg positions (198) | Real: CMaNGOS classic-db `gameobject` rows for Rookery Egg (175124) on map 229 (`rookery-spawns.json`). |
| Clock | `sync-ih-inset.py`: his inset matched against the original upload, original = map + 78.5 s (slope 1.0012, worst residual 0.52 s over 72 one-second matches). |
| Names and classes | Nameplates read in the frames, cross-checked against fan sources (the old wowwiki roster, dialogue analysis) and his legend. Each class says where it comes from. |
| Timing cross-checks (fear, health, arrivals) | Observed in the frames by a vision model (`annotations.json`), now a cross-check on his map. |
| Which eggs hatch, whelp swings, health between observations | Illustrative, so the replay reads. Not seen. |

Rookery Guardians, Hatchers and Solakar are summoned by the Father Flame event,
so the spawn tables have no rows for them (and none appear in this clip).

## Fitting his map to the room

His map is drawn with north at the bottom and east on the left (a 180° turn).
Only four of the Rookery's pillars stand to full height. On the published map
229 render they are solid black squares (`render-pillars.py`):

- north row: (93.97, −322.64) and (94.20, −249.29);
- south row: (62.12, −322.56) and (62.09, −296.65).

The mesh agrees within 0.3 yd. These four are matched to his rectangles, and
an affine fit maps his pixels to world X/Y:

- Pillar residuals: **0.96 yd RMS, 1.30 yd max.** With four points for six
  parameters this is a weak check on its own, so we checked other features that
  were left out of the fit:
- His door notch maps to (111.6, −257.1), inside the real west door gap
  (x 110–112, y −262…−254).
- His map's corners map to (47.5, −341.9) and (110.0, −233.6). The Rookery is
  x 46–110, y −341…−233 on the mesh, so they are within about 1.6 yd.
- His other three pillars land on pillar remains in the mesh: a stump to z 105
  at (94.1, −299.8), a column to z 117 at (94.2, −276.6), and rubble at
  (62.1, −274.8).
- 1015 of 1020 per-second player positions sit on a walkable mesh surface.

His drawing is 15% wider than the room relative to its height (0.059 yd per
pixel across, 0.068 down). The affine fit absorbs that.

## Cross-check against the frame annotations

`annotations.json` → `crossCheck`:

- **Leeroy's entry.** His map has Leeroy walking in alone at 1:26.5. The first
  annotation pass had Leeroy leaving at 1:33. That runner's nameplate isn't
  legible, and the raid's own arrival (POV through the door at 1:34.8) matches
  his map, which has Anfrony entering at 1:34.1. His map wins.
- **Route.** His map uses the west door from the Hall of Binding at floor
  level, matching the minimap labels. The first pass had used the east stairs
  and a drop off the terrace, copied from modern Rookery pulls in Chronicle
  logs. His map wins.
- **The recorder after the pile.** His map has Anfrony heading for the rubble in
  the south-west corner, reached around 2:14. That fits the "grey stone" seen
  in the frames.
- **Deaths: unresolved.** His map marks three deaths (above) and draws everyone
  else alive until it ends at 2:49.7. The recorder's party frames show four
  party members dead at 2:12.0, 2:14.4, 2:15.0 and 2:15.4. The fixture uses his
  named deaths.

## Camera solve (not done)

Internet Historian's map replaced the planned per-frame camera solve against
the mesh. His positions are a fan approximation. Their error against the real
run is unknown; the fit only measures how well his drawing lines up with the
room.

## Rebuild

Downloads go in a gitignored work dir (default `scripts/leeroy/.work`, or set
`WORK`). Treat them as untrusted data. Only derived data is committed: tracks,
fits, heights and spawns, never his video or frames.

```bash
# from frontend/chronicle; Python 3 with numpy + opencv-python-headless, ffmpeg, Node
WORK=${WORK:-scripts/leeroy/.work}
mkdir -p "$WORK/spawn" "$WORK/media"

# 1. Spawns (CMaNGOS classic-db full dump, ~13 MB gzipped)
curl -L -o "$WORK/spawn/classicdb.sql.gz" \
  https://github.com/cmangos/classic-db/raw/master/Full_DB/ClassicDB_1_12_1_z2815.sql.gz
gunzip -k "$WORK/spawn/classicdb.sql.gz"
node scripts/leeroy/extract-spawns.mjs "$WORK/spawn/classicdb.sql" > scripts/leeroy/rookery-spawns.json

# 2. Videos (yt-dlp needs a JS runtime: --js-runtimes node)
yt-dlp --js-runtimes node -f "bv*[height<=480]+ba/b" -o "$WORK/media/%(id)s.%(ext)s" \
  https://www.youtube.com/watch?v=jbq5dsQ-l9M   # A Rough Go - Leeroy Jenkins (original)
yt-dlp --js-runtimes node -f "bv*[height<=1080]+ba/b" -o "$WORK/media/map-of-the-players.%(ext)s" \
  https://youtu.be/IAOLAw0k2DU                  # Internet Historian, Map of the Players (1920x1080)

# 3. Track his dots, sync his clock, measure the pillars on the published render, fit his map
python3 -I scripts/leeroy/track-ih-map.py "$WORK/media/map-of-the-players.mp4" > scripts/leeroy/ih-tracks.json
python3 -I scripts/leeroy/sync-ih-inset.py "$WORK/media/map-of-the-players.mp4" "$WORK/media/jbq5dsQ-l9M.mkv"
curl -o "$WORK/r229.png" https://icons.chronicleclassic.com/turtle/maps/renders/229-afeacc4376ed7847-229-blackrock-spire-floor-1-v002-shaded-water-2400.png
python3 -I scripts/leeroy/render-pillars.py "$WORK/r229.png"   # centres go in fit-ih-map.py REAL
python3 -I scripts/leeroy/fit-ih-map.py > scripts/leeroy/ih-map-fit.json

# 4. Floor heights (needs a local OBJ export of the map 229 mesh; skip to keep the committed file)
python3 -I scripts/leeroy/floor-heights.py <blackrock-spire.obj> > scripts/leeroy/rookery-floor.json

# 5. Fixture
node scripts/leeroy/build-fixture.mjs
```

`sync-ih-inset.py` prints the offset. It goes in `annotations.json` →
`ihSync.offsetSeconds`. `build-fixture.mjs` is deterministic (seeded jitter)
and writes `src/pages/Instance/EventsPanels/Map/fixtures/leeroyRookery.json`.

How the tracker names dots: the dots share colours (two yellows, two oranges,
two whites, three reds, two pinks, two blues). Each colour's members are
assigned by distance from their last position, plus a digit match against
templates cut from his own frames. The reds use the holes in their digit
instead (7 → 0, 9 → 1, 8 → 2), because Anfrony's dot rotates with his facing.

## The floor

The story fetches the live turtle manifest and replays on map 229's published
mesh (`floors[0].mesh`, published 2026-11-03). If that fetch fails, it falls
back to the fixture's placeholder `mesh` entry. The placeholder's extent (the
Rookery and the Hall of Binding behind the door) becomes a flat ground, and its
GLB is never loaded. `rookery-floor.json` was derived from the render
pipeline's local export of the same mesh (same bounds and frame). The scripted camera
(`leeroyChargeCamera` in `fixtures/leeroyRookery.ts`) is authored in world
yards and converted for whichever ground is in use.
