"""Find how Internet Historian's map timeline lines up with the original video,
by matching the inset of the footage in the map's top-left corner against the
original upload (https://www.youtube.com/watch?v=jbq5dsQ-l9M).

    python3 -I scripts/leeroy/sync-ih-inset.py <map-of-the-players.mp4> <jbq5dsQ-l9M.mkv>

Both videos are read from local copies (never committed). Prints, per map
second, the best-matching original second and its correlation, then a
least-squares fit original = a * map + b over the confident matches
(r > 0.5, outliers over 1 s dropped) and the median offset.
Needs ffmpeg and numpy.
"""
import subprocess
import sys

import numpy as np

FPS = 10
SW, SH = 64, 36
INSET = "crop=288:162:12:15"  # the inset of the footage on the 1920x1080 map


def thumbs(path, vf):
    out = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-vf", f"{vf},fps={FPS},scale={SW}:{SH},format=gray", "-f", "rawvideo", "-"],
                         stdout=subprocess.PIPE, check=True).stdout
    frames = np.frombuffer(out, np.uint8).reshape(-1, SH, SW).astype(np.float32)
    flat = frames.reshape(len(frames), -1)
    flat = flat - flat.mean(axis=1, keepdims=True)
    return flat / (np.linalg.norm(flat, axis=1, keepdims=True) + 1e-6)


def main():
    ih_path, orig_path = sys.argv[1], sys.argv[2]
    ih = thumbs(ih_path, INSET)
    orig = thumbs(orig_path, "null")
    pairs = []
    for i in range(0, len(ih), FPS):
        scores = orig @ ih[i]
        j = int(np.argmax(scores))
        pairs.append((i / FPS, j / FPS, float(scores[j])))
        print(f"map {i / FPS:6.1f}s -> original {j / FPS:7.1f}s  r={scores[j]:.3f}")
    good = np.array([(a, b) for a, b, r in pairs if r > 0.5])
    a, b = np.polyfit(good[:, 0], good[:, 1], 1)
    # Robust: refit without matches more than 1 s off the first line.
    keep = np.abs(good[:, 1] - (a * good[:, 0] + b)) < 1.0
    a, b = np.polyfit(good[keep, 0], good[keep, 1], 1)
    residual = good[keep, 1] - (a * good[keep, 0] + b)
    offset = float(np.median(good[keep, 1] - good[keep, 0]))
    print(f"fit: original = {a:.4f} * map + {b:.2f}  ({keep.sum()}/{len(good)} matches r>0.5 within 1 s, residual max {np.abs(residual).max():.2f}s)")
    print(f"median offset (slope 1): original = map + {offset:.2f}s")


if __name__ == "__main__":
    main()
