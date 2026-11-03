"""Track the 13 numbered player dots on Internet Historian's "Leeroy Jenkins |
Map of the Players" (2017, https://youtu.be/IAOLAw0k2DU) into per-player pixel
tracks. Fan approximation: his map is hand-animated, not telemetry.

    python3 -I scripts/leeroy/track-ih-map.py <map-of-the-players.mp4> > scripts/leeroy/ih-tracks.json

Needs ffmpeg on PATH and numpy + opencv-python-headless (any recent version).
The video is read from a local copy (never committed); only the tracks are.

Per sampled frame (FPS below):
  1. Skip frames that are not the map (the opening shows the game full screen).
  2. Find dots by colour (six classes; the floor never gets brighter than
     V 189, the dots are V 190+), split touching dots by distance-transform
     peaks.
  3. Name them: dots share colours (two yellows, two oranges, two whites, three
     reds, two pinks, two blues), so each class's members are assigned to its
     detections by distance from their last position plus a digit match
     against templates of each numbered dot cut from two frames where it
     stands alone (the reds by the holes in their digit instead).
A member with no acceptable detection (hidden under another dot, or drawn
dithered) is written as null. A dot that stays put drawn dithered is his marker
for a dead player: those names are listed per sample under "dithered".
"""
import json
import subprocess
import sys
from itertools import permutations

import cv2
import numpy as np

FPS = 5
W, H = 1920, 1080
# The map area, minus the inset of the original video in its top-left corner.
MAP = (10, 15, 1905, 990)  # down to the doorway notch below the floor
INSET = (10, 13, 302, 179)
NAMES = {1: "Abduhl", 2: "Juron", 3: "Forekin", 4: "Madtoker", 5: "Ctidalwave", 6: "Ritter", 7: "Anfrony",
         8: "Basphemy", 9: "Jamaal", 10: "Leeroy", 11: "Chrisym", 12: "Spiffy", 13: "Therien"}
# Where each numbered dot stands, alone, at two moments of the map (video
# seconds, pixel centre): the digit templates are cut from these frames.
TEMPLATES = {1: (20.0, 1449, 833), 2: (56.0, 1331, 593), 3: (56.0, 1488, 692), 4: (56.0, 1306, 545),
             5: (20.0, 1529, 929), 6: (56.0, 1508, 605), 7: (20.0, 1338, 601), 8: (20.0, 1510, 815),
             9: (20.0, 1393, 657), 10: (20.0, 1485, 582), 11: (20.0, 1501, 878), 12: (56.0, 1364, 620),
             13: (56.0, 1329, 494)}
CLASSES = {
    "yellow": ([1, 2], lambda h, s, v: (h >= 22) & (h <= 31) & (s > 200) & (v > 190)),
    "orange": ([3, 4], lambda h, s, v: (h >= 11) & (h <= 21) & (s > 190) & (v > 225)),
    "red": ([7, 8, 9], lambda h, s, v: ((h <= 6) | (h >= 172)) & (s > 200) & (v > 190)),
    "pink": ([10, 11], lambda h, s, v: (h >= 147) & (h <= 163) & (s > 115) & (v > 230)),
    "blue": ([12, 13], lambda h, s, v: (h >= 107) & (h <= 125) & (s > 140) & (v > 215)),
    "white": ([5, 6], lambda h, s, v: (s < 45) & (v > 240)),
}
R = 16  # dot radius in pixels
MAX_STEP = 60  # pixels a dot may move between samples (0.2 s)


def frames(path):
    proc = subprocess.Popen(["ffmpeg", "-v", "error", "-i", path, "-vf", f"fps={FPS}", "-f", "rawvideo", "-pix_fmt", "bgr24", "-"],
                            stdout=subprocess.PIPE)
    size = W * H * 3
    while True:
        buf = proc.stdout.read(size)
        if len(buf) < size:
            return
        yield np.frombuffer(buf, np.uint8).reshape(H, W, 3)


def is_map(frame):
    # Pillars are flat grey on the map; the game footage is not.
    hsv = cv2.cvtColor(frame[220:240, 360:390], cv2.COLOR_BGR2HSV)
    return bool(np.median(hsv[..., 1]) < 25 and 40 < np.median(hsv[..., 2]) < 120)


def frame_at(path, t):
    out = subprocess.run(["ffmpeg", "-v", "error", "-ss", str(t), "-i", path, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "bgr24", "-"],
                         stdout=subprocess.PIPE, check=True).stdout
    return np.frombuffer(out, np.uint8).reshape(H, W, 3)


def match(gray, x, y, template):
    """Best normalised correlation of the dot at (x, y) with a template, over a +-3 px search."""
    best = -1.0
    for dy in range(-3, 4):
        for dx in range(-3, 4):
            d = disc(gray, x + dx, y + dy)
            if d is not None:
                best = max(best, float((d * template).mean()))
    return best


# The three reds (7 Anfrony, 8 Basphemy, 9 Jamaal) are told apart by the holes
# in their digit, which survive Anfrony's dot rotating with his facing.
RED_HOLES = {7: 0, 8: 2, 9: 1}


def holes(value, x, y):
    """Holes in the dark digit on a dot (V channel), or None off the frame."""
    patch = value[y - 12:y + 13, x - 12:x + 13]
    if patch.shape != (25, 25):
        return None
    yy, xx = np.mgrid[-12:13, -12:13]
    ink = ((patch < 120) & ((xx * xx + yy * yy) <= 100)).astype(np.uint8)
    big = cv2.resize(ink * 255, (100, 100), interpolation=cv2.INTER_NEAREST)
    contours, hierarchy = cv2.findContours(big, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    if hierarchy is None:
        return 0
    return sum(1 for i, c in enumerate(contours) if hierarchy[0][i][3] >= 0 and cv2.contourArea(c) > 40)


def red_score(value, x, y, member):
    """1 when most nearby centres show the member's hole count, else 0."""
    votes = [holes(value, x + dx, y + dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1)]
    votes = [v for v in votes if v is not None]
    if not votes:
        return 0.0
    mode = max(set(votes), key=votes.count)
    return 1.0 if mode == RED_HOLES[member] else 0.0


def disc(gray, x, y):
    patch = gray[y - 11:y + 12, x - 11:x + 12].astype(np.float32)
    if patch.shape != (23, 23):
        return None
    yy, xx = np.mgrid[-11:12, -11:12]
    inside = (xx * xx + yy * yy) <= 121
    values = patch[inside]
    return (values - values.mean()) / (values.std() + 1e-6)


def detections(hsv, test):
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    mask = test(h, s, v).astype(np.uint8)
    x0, y0, x1, y1 = MAP
    keep = np.zeros_like(mask)
    keep[y0:y1, x0:x1] = 1
    ix0, iy0, ix1, iy1 = INSET
    keep[iy0:iy1, ix0:ix1] = 0
    mask &= keep
    # Close the digit holes, drop specks.
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    dist = cv2.distanceTransform(mask, cv2.DIST_L2, 5)
    peaks = (dist >= 9) & (dist == cv2.dilate(dist, np.ones((17, 17), np.uint8)))
    ys, xs = np.nonzero(peaks)
    out = []
    for x, y in sorted(zip(xs.tolist(), ys.tolist()), key=lambda p: -dist[p[1], p[0]]):
        if all((x - a) ** 2 + (y - b) ** 2 > 12 ** 2 for a, b, _ in out):
            out.append((x, y, float(dist[y, x])))
    return out


def dithered_dots(hsv, test):
    """Centres of dots drawn dithered (his marker for the dead): the colour is
    speckled in tiny fragments over a dot-sized disc. Solid dots, and dots half
    hidden behind another, are large fragments and are ignored."""
    mask = test(hsv[..., 0], hsv[..., 1], hsv[..., 2]).astype(np.uint8)
    x0, y0, x1, y1 = MAP
    keep = np.zeros_like(mask)
    keep[y0:y1, x0:x1] = 1
    mask &= keep
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=4)
    small = np.isin(labels, np.nonzero(stats[:, cv2.CC_STAT_AREA] <= 6)[0]) & (labels > 0)
    speckle = small.astype(np.float32)
    density = cv2.boxFilter(speckle, -1, (27, 27), normalize=False)
    peaks = (density >= 10) & (density == cv2.dilate(density, np.ones((31, 31), np.uint8)))
    ys, xs = np.nonzero(peaks)
    out = []
    for x, y in sorted(zip(xs.tolist(), ys.tolist()), key=lambda p: -density[p[1], p[0]]):
        if all((x - a) ** 2 + (y - b) ** 2 > 20 ** 2 for a, b in out):
            out.append((x, y))
    return out


def main():
    path = sys.argv[1]
    templates = {}
    for k, (t, x, y) in TEMPLATES.items():
        templates[k] = disc(cv2.cvtColor(frame_at(path, t), cv2.COLOR_BGR2GRAY), x, y)
    last = {}
    samples = []
    for index, frame in enumerate(frames(path)):
        t = round(index / FPS, 3)
        if not is_map(frame):
            continue
        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        positions = {}
        faded = set()
        for members, test in CLASSES.values():
            found = detections(hsv, test)
            if members == [7, 8, 9]:
                scores = [{k: red_score(hsv[..., 2], x, y, k) for k in members} for x, y, _ in found]
            else:
                scores = [{k: match(gray, x, y, templates[k]) for k in members} for x, y, _ in found]
            best, best_cost = {}, float("inf")
            slots = list(range(len(found))) + [None] * len(members)
            for perm in set(permutations(slots, len(members))):
                cost, pick = 0.0, {}
                for member, j in zip(members, perm):
                    if j is None:
                        cost += 4.0
                        continue
                    x, y, _ = found[j]
                    prior = last.get(member)
                    move = 0.0 if prior is None else ((x - prior[0]) ** 2 + (y - prior[1]) ** 2) ** 0.5
                    if prior is not None and move > MAX_STEP * (1 + prior[2]):
                        cost += 1e6
                    # A stale position (the dot was hidden) says little about where it is now.
                    cost += min(move / 40, 3.0) / (1 + (prior[2] if prior else 0)) + (1 - scores[j][member]) * 6
                    pick[member] = (x, y, scores[j][member])
                if cost < best_cost:
                    best, best_cost = pick, cost
            for member in members:
                if member in best:
                    x, y, score = best[member]
                    positions[member] = [x, y, round(score, 2)]
                    last[member] = (x, y, 0)
                elif member in last:
                    lx, ly, missed = last[member]
                    last[member] = (lx, ly, missed + 1)
            # A missing member next to a dithered dot of its colour is drawn dead there.
            missing = [m for m in members if m not in best and m in last]
            for x, y in dithered_dots(hsv, test) if missing else []:
                near = min(missing, key=lambda m: (x - last[m][0]) ** 2 + (y - last[m][1]) ** 2)
                if (x - last[near][0]) ** 2 + (y - last[near][1]) ** 2 <= 140 ** 2:
                    faded.add(near)
                    positions[near] = [x, y, None]
                    last[near] = (x, y, 0)
                    missing.remove(near)
                if not missing:
                    break
        samples.append({"t": t, "dots": {NAMES[k]: positions.get(k) for k in NAMES}, "dithered": sorted(NAMES[k] for k in faded)})
    json.dump({
        "source": "Internet Historian, 'Leeroy Jenkins | Map of the Players' (2017), https://youtu.be/IAOLAw0k2DU — fan approximation",
        "fps": FPS,
        "frame": {"width": W, "height": H, "map": MAP},
        "format": "dots[name] = [x px, y px, digit match -1..1 (null when drawn dithered)] or null when not found; dithered = names drawn dithered this frame (his marker for the dead)",
        "samples": samples,
    }, sys.stdout, separators=(",", ":"))
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
