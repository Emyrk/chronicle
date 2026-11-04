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

## Public reconstruction

`/instances/leeroy` is a public, read-only Chronicle instance on every tenant.
It opens with the normal Map preset and existing YouTube overlay. The video
opens by default and drives the scripted map camera; closing it returns to a
free-camera replay. The map 229 mesh is fetched from the published Turtle icon
CDN. If that mesh is unavailable, the page shows an error rather than trying to
load the fixture's unpublished placeholder GLB.

`src/pages/Instance/Leeroy/leeroyStreams.ts` encodes the fixture's compact rows
into the normal protobuf event streams. Player damage, healing, spell casts,
resource changes and the resulting health/power snapshots are deterministic
cinematic simulation, not recovered combat-log data. Streams not authored yet
remain empty. Extend `build-fixture.mjs` and regenerate the fixture rather than
editing the packed JSON by hand. The route and panel adapter require no database
instance.

## What is real and what is not

| Part | Where it comes from |
|---|---|
| Player positions (13) | Per Internet Historian's map (2017), fan approximation. Tracked by `track-ih-map.py`, mapped to world X/Y by `fit-ih-map.py`, smoothed over 0.8 s. Before his map shows a player, they wait in the Hall of Binding and walk in through the door. |
| Deaths (names and times) | Per Internet Historian's map: the dots he draws dithered from then on. Basphemy 2:10.5, Ctidalwave 2:11.7, Chrisym 2:18.3. The recorder's party frames disagree (see below). |
| Heights | His map is flat. Everyone stays on the egg floor they entered on (see "Levels" below). |
| Egg positions (198) | Real: CMaNGOS classic-db `gameobject` rows for Rookery Egg (175124) on map 229 (`rookery-spawns.json`). |
| Clock | `sync-ih-inset.py`: his inset matched against the original upload, original = map + 78.5 s (slope 1.0012, worst residual 0.52 s over 72 one-second matches). |
| Names and classes | Nameplates read in the frames, cross-checked against fan sources (the old wowwiki roster, dialogue analysis) and his legend. Each class says where it comes from. |
| Timing cross-checks (fear, health, arrivals) | Observed in the frames by a vision model (`annotations.json`), now a cross-check on his map. |
| Which eggs hatch | An egg hatches when any living player on the egg floor comes within its trigger radius, and the whelp attacks that player. The radius is real: 1.5 yd, from the egg trap's diameter of 3 in classic-db, halved by the mangos-classic core. A tuned 1.5 yd margin is added for his map's placement error (see below). |
| Player attacks, heals, whelp swings, health and power | Deterministic cinematic simulation. Health changes follow the authored damage and healing events, and power follows resource costs and recovery. The video does not provide a full combat log. |

The simulated mage rotation adds Frost Nova and close-range Arcane Explosion
bursts against whelps during the pile-in. Leeroy casts Divine Protection at
clip offset 9 s (video 1:33); the simulation ignores incoming whelp damage for
its eight-second duration. MadToker is a druid and begins channeling Tranquility
at clip offset 18 s. The surrounding combat and effects are authored rather
than recovered from a combat log. Frost Nova does not alter the fan-tracked
movement paths.

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
- 1019 of 1020 per-second player positions sit on a walkable mesh surface.

His drawing is 15% wider than the room relative to its height (0.059 yd per
pixel across, 0.068 down). The affine fit absorbs that.

## Eggs and whelps

Rookery Egg (gameobject 175124) is a trap: `data2` (diameter) = 3, spell 16474.
The mangos-classic core triggers a trap at `radius = diameter / 2`, so the
real radius is **1.5 yd**.

His map places players to about 1 yd (worst pillar residual 1.30 yd), so with
the bare radius a tracked player who really walked over an egg misses it about
half the time. Against the footage, the bare radius gives 3 whelps by 1:39. A
1.5 yd margin (his worst residual, rounded up) gives 8 by 1:39 and 9 by 1:41,
matching the footage's roughly 8 whelps on Leeroy at 1:39 and roughly 10
nameplates at 1:40. That margin is tuned, not sourced.

With it, Leeroy hatches 7 whelps before anyone else hatches one. They hit him
from 1:32.5, alone, about 5.5 s before the first raid member is within 8 yd
of him (1:38). After his illustrative Divine Protection at 1:33, his simulated
health is about 93% by the first raid hatch; the exact health values are not
measured from the footage.

## Levels

The footage shows the fight on the checkered egg floor (1:36–2:24), and the
raid enters through the west door at floor level. The egg floor includes the
low rubble the eggs also lie on (egg spawns go up to z 97). The west ramp and
the ledges above z 97.5 are a different level.

The one climb is annotated (`annotations.json` → `levelChanges`). Anfrony runs
up the west ramp at 2:15 and fights Rage Talon Dragonspawn, which spawn on the
terrace level, at 2:18–2:21. His map has him along the west wall from 2:13 to
2:19.5, and he is back on the egg floor by 2:24.

Everywhere else:

- A tracked point that lands on the ramp, a ledge or a prop moves to the
  nearest egg-floor cell: 104 samples, mean 1.9 yd, worst 3.4 yd.
- Heights follow the egg floor under the player and change by at most
  2.5 yd/s.

Measured against the mesh with the 3D view's own rule (it stands a unit on the
highest surface up to 2.5 yd above its logged z), over 5057 player samples at
0.2 s:

- **Before** (heights from the highest walkable surface below the terrace,
  logged 1.9 yd above it): 72 samples on the upper level, and 166 jumps of
  more than 1 yd in one step.
- **After**: 2 samples on the upper level, both Anfrony climbing back down
  right after his climb. 22 jumps remain, all 1–3 yd steps onto low rubble or
  props on the egg floor, 3 of them inside Anfrony's ramp climb. Nobody changes
  level outside that climb.

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
  party members dead at 2:12.0, 2:14.4, 2:15.0 and 2:15.4. His chat log names
  them: "Ctidalwave has died" (2:12.0), Therien (2:14), Forekin (2:15) and
  Abduhl (by 2:17). A Release Spirit box shows the recorder dead by 2:36. The
  fixture still uses his named deaths, which agree with the chat on
  Ctidalwave. Switching to the chat deaths is a follow-up.

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
