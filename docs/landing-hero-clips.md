# Landing hero clips

The `/start` hero opens on a short pre-rendered 3D replay clip, so the first second reads as "this is a 3D run"
before the live 3D (three.js, the run's streams, a 6–38 MB mesh) is ready. Clips are static files, one per
dungeon, in `frontend/chronicle/public/c/images/landing/clips/`, listed in `clips.json` there.

## The manifest

```jsonc
[{
  "slug": "-8uWqvAo4Qa4Oa5l",            // the run the clip was recorded from
  "instance_name": "Zul'Gurub",
  "boss": "Hakkar",
  "mp4": "zg-hakkar.e03f747a.mp4",        // 1280x720, H.264, faststart, muted
  "webm": "zg-hakkar.47be4d8e.webm",      // 1280x720, VP9, muted
  "poster": "zg-hakkar.5e485f45.webp",    // the clip's first frame
  "portrait": { "mp4": "…", "webm": "…", "poster": "…" },   // 720x960, same moment (the poster 540x720)
  "meter": {
    "total": 535403,                      // the players' damage over the whole pull
    "dps": 4153,                          // total / pull duration
    "rows": [{ "name": "Katq", "class": "WARRIOR", "dps": 637, "share": 0.153 }],   // top 5 players
    "death": { "victim": "Katq", "class": "WARRIOR", "at_ms": 4953, "ability": "Blood Siphon", "amount": 264, "source": "Katq" }
  }
}]
```

File names are relative to the manifest. `meter` holds the pull's real numbers, so the hero's meter matches
the clip. `death` is the first player death inside the clip (`at_ms` counts from the clip's first frame), or
`null` when no one dies on screen. Each clip is 8 s and loops: its last second crossfades into the frames just
before its first, so the end runs into the start.

Budgets: ≤ 1.2 MB per landscape video, ≤ 600 KB per portrait video, ≤ 100 KB per poster. The portrait poster
is the phone hero's LCP image, so the script writes it at 540x720 and WebP quality 50 (about 30 KB): heavier,
and `/start` misses its 2.5 s LCP on simulated mobile. The script prints
`OVER BUDGET` when a file exceeds its budget.

## Caching

Every video and poster name carries a hash of its content (`<name>.<sha256[:8]>.<ext>`), so a re-recorded clip
gets new names and the old files can be cached forever. The Go app serves `public/` through `http.FileServer`
over the embedded dist. `etagMiddleware` (`frontend/etag.go`) adds an ETag and Cache-Control to `.js`, `.css`
and fonts only, so `/c/images/...` (these clips included) goes out with **no Cache-Control** and no
Last-Modified. Browsers and Cloudflare fall back to their own heuristics. `clips.json` is the one unhashed
file; consumers should fetch it as usual and let it revalidate.

## Recording a clip

You need a run with `unit-position` in its `capabilities` (`/api/v1/raidlogs/instances/<slug>`), on a dungeon
whose map manifest (`<icon_base_url>/maps/manifest.json`) publishes a mesh. You also need ffmpeg (with libx264
and libvpx-vp9), `cwebp`, and Google Chrome.

1. On macOS, run Vite from a case-sensitive volume (`CooldownUsage.tsx` and `cooldownUsage.ts` collide on
   APFS), proxied to the run's community:

   ```sh
   cd <case-sensitive checkout>/frontend/chronicle && pnpm install
   HOST=https://octo.chronicleclassic.com pnpm exec vite --port 5173
   ```

2. Pick the moment. `http://localhost:5173/render/hero-clip/<slug>?encounter=<encounter id>&from=<ms into the pull>`
   plays the pull full-window from the Watch camera (the Director on the boss), showing nothing but the 3D
   canvas. `window.__heroClip.pull.deaths` lists the pull's deaths in ms from `from`. The clip starts about
   3 s after `from` (the replay settles for 2 s, then 1 s goes into the crossfade).

3. Record, encode, and add to the manifest:

   ```sh
   node scripts/record-hero-clip.mjs --name zg-hakkar --instance=-8uWqvAo4Qa4Oa5l \
     --encounter 81a00d73-167c-4b57-845f-71ab8e12b153 --from 113000 --base http://localhost:5173
   ```

   (Write `--instance=<slug>` with `=`: slugs can start with `-`.) The script opens headed Chrome, so the real
   GPU renders rather than SwiftShader; leave the window alone while it records. It records one take at
   1280x720 and one at 720x960 (the camera frames the fight for each shape), cuts both to start at the same
   replay time, loops and encodes them, then writes the files and the run's entry into `clips.json`. Running it
   again for the same run and boss replaces that clip's files and entry.

4. Copy the new files and `clips.json` back into the worktree you commit from, and review the clip (watch it
   loop) before committing.

The shipped clips:

| Clip | Run (octo) | Encounter | `--from` |
| --- | --- | --- | --- |
| `zg-hakkar` | `-8uWqvAo4Qa4Oa5l` | `81a00d73-167c-4b57-845f-71ab8e12b153` (Hakkar) | `113000` (covers Katq's death) |
| `mc-ragnaros` | `cpegIP_Qz9m6JEnZ` | `6fea9124-1f69-43b9-9c9e-87996b7b21c7` (Ragnaros) | `40000` |

Be gentle with prod: each recording loads the run twice (once per take), and octo answers bursts with 403.
