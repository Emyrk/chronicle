import { describe, expect, it } from "vitest";
import { directorFrame, type DirectorUnit } from "./cameraDirector";
import {
  buildFollowTrack,
  createShotHold,
  FOLLOW_JUMP_MS,
  followKeyAt,
  GLIDE_MAX_MS,
  GLIDE_MIN_MS,
  GLIDE_PULL_OUT,
  GLIDE_SPEED_YARDS_PER_S,
  glideDurationMs,
  glidePoseAt,
  holdShot,
  isReplayJump,
  SHOT_RELEASE_MS,
  type FollowKey,
  type GlidePose,
} from "./followCamera";

const FRAME_MS = 1000 / 60;

function unit(guid: string, x: number, z: number, extra: Partial<DirectorUnit> = {}): DirectorUnit {
  return { guid, x, z, player: true, boss: false, dead: false, ...extra };
}

/**
 * Five players walk +x at 6 yd/s; at 10 s one breaks off and runs +z at
 * 14 yd/s (a straggler leaving the frame); a boss stands at x = 150, which
 * the group comes within engage range of around 18 s, then they stop on it.
 */
function walkingGroup(ms: number): DirectorUnit[] {
  const t = ms / 1000;
  const walked = Math.min(t, 22) * 6;
  const offsets = [[0, 0], [3, 2], [-3, 2], [2, -3], [-2, -3]];
  const units = offsets.map(([dx, dz], i) => {
    const straggle = i === 4 && t > 10 ? (t - 10) * 14 : 0;
    return unit(`p${i}`, walked + dx!, dz! + straggle);
  });
  units.push(unit("boss", 150, 0, { player: false, boss: true }));
  return units;
}

// The worst rate of change of the centre (yd/s) and of that rate (yd/s²),
// and of the radius (yd/s), sampling `at` at 60 fps over `durationMs`.
function motion(durationMs: number, at: (ms: number) => FollowKey) {
  let previous: FollowKey | null = null;
  let previousVelocity: [number, number] | null = null;
  let speed = 0;
  let acceleration = 0;
  let radiusRate = 0;
  for (let ms = 0; ms <= durationMs; ms += FRAME_MS) {
    const key = { ...at(ms) };
    if (previous) {
      const velocity: [number, number] = [(key.x - previous.x) / (FRAME_MS / 1000), (key.z - previous.z) / (FRAME_MS / 1000)];
      speed = Math.max(speed, Math.hypot(...velocity));
      radiusRate = Math.max(radiusRate, Math.abs(key.radius - previous.radius) / (FRAME_MS / 1000));
      if (previousVelocity) {
        acceleration = Math.max(acceleration, Math.hypot(velocity[0] - previousVelocity[0], velocity[1] - previousVelocity[1]) / (FRAME_MS / 1000));
      }
      previousVelocity = velocity;
    }
    previous = key;
  }
  return { speed, acceleration, radiusRate };
}

describe("buildFollowTrack", () => {
  const durationMs = 30_000;

  it("the fixture's raw framing jumps (the snaps the track has to remove)", () => {
    let inFrame = new Set<string>();
    const raw = motion(durationMs, (ms) => {
      const frame = directorFrame(walkingGroup(ms), inFrame)!;
      inFrame = new Set(frame.guids);
      return { x: frame.x, z: frame.z, radius: frame.radius };
    });
    // The straggler dropping out and the boss engaging move the circle in one frame.
    expect(raw.speed).toBeGreaterThan(300);
    expect(raw.radiusRate).toBeGreaterThan(300);
  });

  it("is continuous through walking, a straggler leaving and a boss engaging", () => {
    const track = buildFollowTrack({ startMs: 0, endMs: durationMs, unitsAt: walkingGroup, scale: 1 })!;
    expect(track).not.toBeNull();
    const out: FollowKey = { x: 0, z: 0, radius: 0 };
    const smooth = motion(durationMs, (ms) => followKeyAt(track, ms, out));
    // Bounded velocity (the group walks at 6 yd/s) and acceleration, and the
    // frame size eases instead of jumping.
    expect(smooth.speed).toBeLessThan(15);
    expect(smooth.acceleration).toBeLessThan(40);
    expect(smooth.radiusRate).toBeLessThan(25);
  });

  it("looks ahead: the centre starts moving before the group does", () => {
    const standThenWalk = (ms: number) => [0, 1, 2].map((i) => unit(`p${i}`, (ms < 10_000 ? 0 : (ms - 10_000) / 1000 * 6) + i, 0));
    const track = buildFollowTrack({ startMs: 0, endMs: 20_000, unitsAt: standThenWalk, scale: 1 })!;
    const out: FollowKey = { x: 0, z: 0, radius: 0 };
    const before = followKeyAt(track, 8_000, out).x;
    const stillBefore = followKeyAt(track, 6_000, out).x;
    expect(before).toBeGreaterThan(stillBefore);
  });

  it("covers everyone framed, whatever the smoothing", () => {
    const track = buildFollowTrack({ startMs: 0, endMs: durationMs, unitsAt: walkingGroup, scale: 1 })!;
    const out: FollowKey = { x: 0, z: 0, radius: 0 };
    let inFrame = new Set<string>();
    for (let ms = 0; ms <= durationMs; ms += 250) {
      const units = walkingGroup(ms);
      const frame = directorFrame(units, inFrame)!;
      inFrame = new Set(frame.guids);
      const key = followKeyAt(track, ms, out);
      for (const framed of units.filter((candidate) => inFrame.has(candidate.guid))) {
        expect(Math.hypot(framed.x - key.x, framed.z - key.z)).toBeLessThanOrEqual(key.radius + 0.5);
      }
    }
  });

  it("glides across a gap with nobody to frame instead of teleporting", () => {
    // The group fights at x = 0, drops out of the log for 20 s, and turns up 300 yd away.
    const away = (ms: number) => ms < 10_000
      ? [unit("a", 0, 0), unit("b", 4, 0)]
      : ms < 30_000 ? [] : [unit("a", 300, 0), unit("b", 304, 0)];
    const track = buildFollowTrack({ startMs: 0, endMs: 40_000, unitsAt: away, scale: 1 })!;
    const out: FollowKey = { x: 0, z: 0, radius: 0 };
    const glide = motion(40_000, (ms) => followKeyAt(track, ms, out));
    // 300 yd over the 6 s triangular centre window peaks near 100 yd/s,
    // eased in and out; a one-frame jump would be 18,000 yd/s.
    expect(glide.speed).toBeLessThan(110);
    expect(glide.acceleration).toBeLessThan(80);
    expect(followKeyAt(track, 40_000, out).x).toBeCloseTo(302, 0);
  });

  it("stretches its windows with the playback speed, keeping the same calm in real time", () => {
    const fast = buildFollowTrack({ startMs: 0, endMs: durationMs * 4, unitsAt: (ms) => walkingGroup(ms / 4), scale: 1, speed: 4 })!;
    const out: FollowKey = { x: 0, z: 0, radius: 0 };
    // At 4x, real time t shows replay 4t: the same motion as the 1x fixture.
    const smooth = motion(durationMs, (ms) => followKeyAt(fast, ms * 4, out));
    expect(smooth.speed).toBeLessThan(15);
    expect(smooth.acceleration).toBeLessThan(40);
  });

  it("is null with nobody ever framed", () => {
    expect(buildFollowTrack({ startMs: 0, endMs: 5_000, unitsAt: () => [], scale: 1 })).toBeNull();
  });
});

describe("holdShot", () => {
  it("does not flip on a line of sight that alternates blocked and clear every frame", () => {
    const hold = createShotHold();
    let changes = 0;
    let last = `${hold.elevationDeg}|${hold.shortened}`;
    for (let frame = 0; frame < 600; frame++) {
      const blocked = frame % 2 === 0;
      holdShot(hold, blocked ? 50 : 28, blocked, frame * FRAME_MS);
      const now = `${hold.elevationDeg}|${hold.shortened}`;
      if (now !== last) changes++;
      last = now;
    }
    // Up once (the fight is not hidden), then held.
    expect(changes).toBe(1);
    expect(hold.shortened).toBe(true);
  });

  it("does not flip between two elevations either", () => {
    const hold = createShotHold();
    const seen: number[] = [];
    for (let frame = 0; frame < 600; frame++) {
      holdShot(hold, frame % 3 === 0 ? 43 : 33, false, frame * FRAME_MS);
      if (seen.at(-1) !== hold.elevationDeg) seen.push(hold.elevationDeg);
    }
    expect(seen).toEqual([43]);
  });

  it("comes back down once the lower answer has held for the release time", () => {
    const hold = createShotHold();
    holdShot(hold, 50, true, 0);
    holdShot(hold, 28, false, 100);
    expect(hold.shortened).toBe(true);
    holdShot(hold, 28, false, 100 + SHOT_RELEASE_MS - 1);
    expect(hold.elevationDeg).toBe(50);
    holdShot(hold, 28, false, 100 + SHOT_RELEASE_MS);
    expect(hold).toMatchObject({ elevationDeg: 28, shortened: false });
  });
});

describe("isReplayJump", () => {
  it("tells playback from a seek, a skipped gap or a loop", () => {
    // 1x playback: 16 ms of frame is 16 ms of replay.
    expect(isReplayJump(1_000, 1_016, 16, 1)).toBe(false);
    // A coarse replay tick re-anchoring the clock is not a jump.
    expect(isReplayJump(1_000, 1_300, 16, 1)).toBe(false);
    // Skipping a 40 s gap between encounters, or looping back to the start.
    expect(isReplayJump(60_000, 100_000, 16, 1)).toBe(true);
    expect(isReplayJump(600_000, 0, 16, 1)).toBe(true);
    // Fast playback re-anchors by more replay time; the threshold scales with it.
    expect(isReplayJump(0, FOLLOW_JUMP_MS * 2, 16 * 8, 8)).toBe(false);
    // But a 10 s gap skipped at 8x is still a jump.
    expect(isReplayJump(0, 10_000, 16 * 8, 8)).toBe(true);
  });
});

describe("glidePoseAt", () => {
  it("crosses an encounter-gap jump at a bounded speed, easing in and out, pulled out mid-way", () => {
    const from: GlidePose = { x: 0, z: 0, distance: 30, elevationDeg: 28 };
    const to: GlidePose = { x: 300, z: 40, distance: 24, elevationDeg: 35 };
    const travel = Math.hypot(300, 40);
    const duration = glideDurationMs(travel, 1);
    expect(duration).toBeGreaterThanOrEqual(GLIDE_MIN_MS);
    expect(duration).toBeLessThanOrEqual(GLIDE_MAX_MS);
    const out: GlidePose = { x: 0, z: 0, distance: 0, elevationDeg: 0 };
    const steps: number[] = [];
    let previous = { ...from };
    let maxDistance = 0;
    for (let ms = FRAME_MS; ms <= duration + FRAME_MS; ms += FRAME_MS) {
      const pose = glidePoseAt(from, to, ms / duration, out);
      steps.push(Math.hypot(pose.x - previous.x, pose.z - previous.z) / (FRAME_MS / 1000));
      maxDistance = Math.max(maxDistance, pose.distance);
      previous = { ...pose };
    }
    // Sine ease-in-out peaks at pi/2 times the average speed; no frame is a whip.
    const average = travel / (duration / 1000);
    expect(Math.max(...steps)).toBeLessThanOrEqual((Math.PI / 2) * average + 1);
    expect(average).toBeLessThanOrEqual(Math.max(GLIDE_SPEED_YARDS_PER_S, travel / (GLIDE_MAX_MS / 1000)) + 1e-6);
    // Starts and stops gently.
    expect(steps[0]!).toBeLessThan(0.05 * average);
    expect(steps.at(-2)!).toBeLessThan(0.05 * average);
    // Pulls out on the way, within the cap, and lands on the target.
    expect(maxDistance).toBeGreaterThan(30);
    expect(maxDistance).toBeLessThanOrEqual(30 * (1 + GLIDE_PULL_OUT));
    expect(glidePoseAt(from, to, 1, out)).toMatchObject({ x: 300, z: 40, elevationDeg: 35 });
    expect(out.distance).toBeCloseTo(24, 6);
  });

  it("a short hop barely pulls out", () => {
    const out: GlidePose = { x: 0, z: 0, distance: 0, elevationDeg: 0 };
    const pose = glidePoseAt({ x: 0, z: 0, distance: 30, elevationDeg: 28 }, { x: 3, z: 0, distance: 30, elevationDeg: 28 }, 0.5, out);
    expect(pose.distance).toBeLessThan(30 * 1.06);
  });
});
