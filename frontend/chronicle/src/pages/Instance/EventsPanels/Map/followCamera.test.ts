import { describe, expect, it } from "vitest";
import { directorFrame, FRAME_FILL, MIN_FRAME_RADIUS_YARDS, smoothDamp, type DirectorUnit } from "./cameraDirector";
import {
  buildFollowTrack,
  startFollowTrackBuild,
  createShotHold,
  FOLLOW_CENTRE_CLAMP_YARDS,
  FOLLOW_CENTRE_WINDOW_MS,
  FOLLOW_JUMP_MS,
  FOLLOW_MAX_WINDOW_STRETCH,
  FOLLOW_SMOOTH_SECONDS,
  followSprings,
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

/**
 * The Summary mini preview's replay clock at `speed`: an interval tick every
 * 250 ms (+-15 ms) reads the cursor, React commits it 0-20 ms later and
 * stamps the clock then, and the scene runs the clock ahead of its stamp by
 * at most 250 ms of real time (MapScene3D.replayNow). Frames at 60 fps, one
 * in fifty dropped to 100 ms unless `drops` is false. Calls `frame` with the real time and the
 * replay time the scene reads. The cursor loops over `spanMs`.
 */
function previewPlayback(speed: number, spanMs: number, durationMs: number, frame: (now: number, replayMs: number) => void, drops = true) {
  let seed = 7;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  let clockMs = 0;
  let clockAt = 0;
  let nextTick = 250;
  let pending: { ms: number; at: number } | null = null;
  for (let now = 0; now < durationMs; now += drops && random() < 0.02 ? 100 : FRAME_MS) {
    while (nextTick <= now) {
      pending = { ms: (nextTick * speed) % spanMs, at: nextTick + random() * 20 };
      nextTick += 250 + (random() - 0.5) * 30;
    }
    if (pending && pending.at <= now) {
      clockMs = pending.ms;
      clockAt = pending.at;
      pending = null;
    }
    frame(now, clockMs + Math.min(now - clockAt, 250) * speed);
  }
}

/** Five players running a zigzag at `pace` yd/s (7 on foot, 14 mounted): 40 yd legs, alternately +x and +z. */
function zigzagGroup(ms: number, pace = 7): DirectorUnit[] {
  const run = (ms / 1000) * pace;
  const leg = Math.floor(run / 40);
  const along = run - leg * 40;
  const x = Math.ceil(leg / 2) * 40 + (leg % 2 === 0 ? along : 0);
  const z = Math.floor(leg / 2) * 40 + (leg % 2 === 1 ? along : 0);
  return [[0, 0], [2, 1], [-2, 1], [1, -2], [-1, -2]].map(([dx, dz], i) => unit(`p${i}`, x + dx!, z + dz!));
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

  it("keeps everyone framed inside the shot's headroom, whatever the smoothing", () => {
    const track = buildFollowTrack({ startMs: 0, endMs: durationMs, unitsAt: walkingGroup, scale: 1 })!;
    const out: FollowKey = { x: 0, z: 0, radius: 0 };
    // Who the per-frame rule frames at each sample.
    const framedAt: Set<string>[] = [];
    let inFrame = new Set<string>();
    for (let ms = 0; ms <= durationMs; ms += 250) {
      inFrame = new Set(directorFrame(walkingGroup(ms), inFrame)!.guids);
      framedAt.push(inFrame);
    }
    framedAt.forEach((_framed, i) => {
      const ms = i * 250;
      const key = followKeyAt(track, ms, out);
      for (const unit of walkingGroup(ms)) {
        // The centred window lets the frame shrink up to a second before a
        // straggler drops out (it looks ahead); anyone framed for the second
        // either side stays inside the fit's FRAME_FILL headroom.
        if (![-4, 0, 4].every((offset) => framedAt[i + offset]?.has(unit.guid) ?? true)) continue;
        expect(Math.hypot(unit.x - key.x, unit.z - key.z)).toBeLessThanOrEqual(Math.max(key.radius, MIN_FRAME_RADIUS_YARDS) * FRAME_FILL + 0.5);
      }
    });
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

  it("stays continuous at a fast speed, with a centre window capped in replay time", () => {
    const fast = buildFollowTrack({ startMs: 0, endMs: durationMs, unitsAt: walkingGroup, scale: 1, speed: 32 })!;
    const out: FollowKey = { x: 0, z: 0, radius: 0 };
    // In replay time the fast track is as smooth as the 1x one.
    const smooth = motion(durationMs, (ms) => followKeyAt(fast, ms, out));
    expect(smooth.speed).toBeLessThan(15);
    expect(smooth.acceleration).toBeLessThan(40);
    // But it looks ahead no further than the capped window: at 32x the old
    // stretch (32 x 3 s) started moving a minute and a half early.
    const standThenWalk = (ms: number) => [0, 1, 2].map((i) => unit(`p${i}`, (ms < 60_000 ? 0 : (ms - 60_000) / 1000 * 6) + i, 0));
    const track = buildFollowTrack({ startMs: 0, endMs: 120_000, unitsAt: standThenWalk, scale: 1, speed: 32 })!;
    const window = FOLLOW_CENTRE_WINDOW_MS * FOLLOW_MAX_WINDOW_STRETCH;
    expect(followKeyAt(track, 60_000 - window - 1_000, out).x).toBeCloseTo(1, 6);
    expect(followKeyAt(track, 60_000 - 1_000, out).x).toBeGreaterThan(1);
  });

  it.each([7, 14])("keeps the centre near the framed units on a zigzag path at 32x, never cutting its corners (%i yd/s)", (pace) => {
    // A group runs a cave-like zigzag (40 yd legs, alternating +x and +z) for ten minutes, on foot or mounted.
    const unitsAt = (ms: number) => zigzagGroup(ms, pace);
    const track = buildFollowTrack({ startMs: 0, endMs: 600_000, unitsAt, scale: 1, speed: 32 })!;
    const out: FollowKey = { x: 0, z: 0, radius: 0 };
    // The clamp holds at every sample; between them the Catmull-Rom can swing
    // a little past it (about 1.6 yd at a mounted pace).
    let inFrame = new Set<string>();
    for (let ms = 0; ms <= 600_000; ms += 100) {
      const frame = directorFrame(unitsAt(ms), inFrame)!;
      inFrame = new Set(frame.guids);
      const key = followKeyAt(track, ms, out);
      const bound = ms % track.sampleMs === 0 ? FOLLOW_CENTRE_CLAMP_YARDS + 1e-6 : FOLLOW_CENTRE_CLAMP_YARDS + 2;
      expect(Math.hypot(key.x - frame.x, key.z - frame.z)).toBeLessThanOrEqual(bound);
      // The cover radius stays the group's size, not swollen by an off-centre point.
      expect(key.radius).toBeLessThan(FOLLOW_CENTRE_CLAMP_YARDS + 6);
    }
  });

  it("keeps the aim on a moving group at 1x, 8x and 32x (harness)", () => {
    // The scene's position spring on the track, led by its trail (60 fps), against the framed
    // units' circle; the ends are left out (the windows clamp there).
    const lag = (speed: number) => {
      const end = 600_000;
      const track = buildFollowTrack({ startMs: 0, endMs: end, unitsAt: zigzagGroup, scale: 1, speed })!;
      const out: FollowKey = { x: 0, z: 0, radius: 0 };
      followKeyAt(track, 0, out);
      const x = { value: out.x, velocity: 0 };
      const z = { value: out.z, velocity: 0 };
      const { position: smooth, leadMs } = followSprings(speed, true);
      let max = 0;
      let sum = 0;
      let count = 0;
      for (let real = 0; real * speed <= end; real += FRAME_MS) {
        const ms = real * speed;
        const key = followKeyAt(track, ms + leadMs, out);
        smoothDamp(x, key.x, smooth, FRAME_MS / 1000);
        smoothDamp(z, key.z, smooth, FRAME_MS / 1000);
        if (ms < 20_000 || ms > end - 120_000) continue;
        const frame = directorFrame(zigzagGroup(ms))!;
        const off = Math.hypot(x.value - frame.x, z.value - frame.z);
        max = Math.max(max, off);
        sum += off;
        count++;
      }
      console.info(`follow aim vs group at ${speed}x: max ${max.toFixed(1)} yd, mean ${(sum / count).toFixed(1)} yd`);
      return { max, mean: sum / count };
    };
    for (const speed of [1, 8, 32]) {
      const { max, mean } = lag(speed);
      // The track's centre holds the clamp; the 0.3 s spring on it rounds a
      // 32x corner (about 10 s of replay) a little further.
      expect(max).toBeLessThan(FOLLOW_CENTRE_CLAMP_YARDS + 3);
      expect(mean).toBeLessThan(8);
    }
  });

  it("is null with nobody ever framed", () => {
    expect(buildFollowTrack({ startMs: 0, endMs: 5_000, unitsAt: () => [], scale: 1 })).toBeNull();
  });
});

describe("followSprings", () => {
  // The camera on a group walking +x at 7 yd/s in the 32x preview, its goal sampled from the track at `goalMs`.
  // No dropped frames here: across one, the frame-to-frame velocity reads a
  // jump whatever the spring (the old one included).
  const preview = (smooth: number, goalMs: (replayMs: number) => number) => {
    const speed = 32;
    const track = buildFollowTrack({ startMs: 0, endMs: 3_000_000, unitsAt: (ms) => [0, 1, 2].map((i) => unit(`p${i}`, (ms / 1000) * 7 + i, 0)), scale: 1, speed })!;
    const out: FollowKey = { x: 0, z: 0, radius: 0 };
    const x = { value: 1, velocity: 0 };
    let last: { now: number; x: number; velocity: number } | null = null;
    let jerk = 0;
    let lag = 0;
    previewPlayback(speed, 3_000_000, 60_000, (now, replayMs) => {
      const dt = last ? (now - last.now) / 1000 : FRAME_MS / 1000;
      smoothDamp(x, followKeyAt(track, goalMs(replayMs), out).x, smooth, dt);
      const velocity = last ? (x.value - last.x) / dt : 0;
      if (now > 2_000 && last) {
        jerk = Math.max(jerk, Math.abs(velocity - last.velocity));
        // Against where the group really is (the cursor, not the stepped clock).
        lag = Math.max(lag, Math.abs(x.value - ((now * speed) / 1000 * 7 + 1)));
      }
      last = { now, x: x.value, velocity };
    }, false);
    return { jerk, lag };
  };

  it("keeps the 32x preview's clock ticks out of the camera, without the spring's trail", () => {
    const springs = followSprings(32, true);
    const led = preview(springs.position, (replayMs) => replayMs + springs.leadMs);
    // The old spring on the track: smooth, but tens of yards behind.
    const trailing = preview(FOLLOW_SMOOTH_SECONDS, (replayMs) => replayMs);
    // A spring short enough to keep up copies each tick's step into the camera.
    const copying = preview(FOLLOW_SMOOTH_SECONDS / 32, (replayMs) => replayMs);
    const report = (name: string, run: { jerk: number; lag: number }) => `${name} jerk ${run.jerk.toFixed(0)} yd/s, off ${run.lag.toFixed(1)} yd`;
    console.info(`32x preview: ${report("led", led)}; ${report("trailing", trailing)}; ${report("copying", copying)}`);
    expect(trailing.lag).toBeGreaterThan(50);
    expect(copying.jerk).toBeGreaterThan(200);
    // Led, the camera changes speed as little as with the old spring.
    expect(led.jerk).toBeLessThan(trailing.jerk + 1);
    expect(led.jerk).toBeLessThan(5);
    // The clock itself runs up to ~20 ms x 32 behind the cursor, or 250 ms x 32 ahead on a late tick.
    expect(led.lag).toBeLessThan(10);
  });

  it("leads by the position spring's trail while playing; paused, no lead and 1x springs", () => {
    expect(followSprings(1, true)).toMatchObject({ position: FOLLOW_SMOOTH_SECONDS, leadMs: FOLLOW_SMOOTH_SECONDS * 1_000 });
    expect(followSprings(32, true).leadMs).toBeCloseTo(32 * FOLLOW_SMOOTH_SECONDS * 1_000, 6);
    // The distance spring still eases a shortened shot in.
    expect(followSprings(32, true).distance).toBeGreaterThanOrEqual(0.2);
    // Paused, a short seek eases in as at 1x rather than cutting.
    expect(followSprings(32, false)).toEqual({ ...followSprings(1, true), leadMs: 0 });
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

  it("sees no jump in steady 32x preview playback, only its loop", () => {
    const speed = 32;
    const spanMs = 45 * 60_000;
    let previous: { ms: number; at: number } | null = null;
    let jumps = 0;
    previewPlayback(speed, spanMs, 2.5 * (spanMs / speed), (now, replayMs) => {
      if (previous && isReplayJump(previous.ms, replayMs, (now - previous.at) * speed, speed)) jumps++;
      previous = { ms: replayMs, at: now };
    });
    // Two loops back to the start, and nothing else.
    expect(jumps).toBe(2);
  });

  it("only allows fast playback's slop while playing: a paused seek of a few seconds is a jump", () => {
    // Playing at 32x, a 5 s step could be a tick re-anchoring the clock.
    expect(isReplayJump(0, 5_000, 0, 32, true)).toBe(false);
    // Paused, nothing re-anchors: it is a seek, and glides.
    expect(isReplayJump(0, 5_000, 0, 32, false)).toBe(true);
    expect(isReplayJump(0, FOLLOW_JUMP_MS - 1, 0, 32, false)).toBe(false);
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

describe("startFollowTrackBuild", () => {
  it("builds in slices that each stop at the budget, giving the same track as one go", () => {
    // A fake clock: every unitsAt call costs 1 ms.
    let clock = 0;
    const unitsAt = (ms: number) => {
      clock += 1;
      return walkingGroup(ms);
    };
    const build = startFollowTrackBuild({ startMs: 0, endMs: 30_000, unitsAt, scale: 1 }, () => clock);
    let slices = 0;
    let longest = 0;
    for (;;) {
      const before = clock;
      const finished = build.step(6);
      longest = Math.max(longest, clock - before);
      slices++;
      if (finished) break;
    }
    // 121 samples at 1 ms each: about 20 slices of at most 6 ms.
    expect(slices).toBeGreaterThan(15);
    expect(longest).toBeLessThanOrEqual(6);
    const whole = buildFollowTrack({ startMs: 0, endMs: 30_000, unitsAt: walkingGroup, scale: 1 })!;
    expect(Array.from(build.result!.x)).toEqual(Array.from(whole.x));
    expect(Array.from(build.result!.radius)).toEqual(Array.from(whole.radius));
  });

  it("keeps every blocking slice short on a 3 h, 40-player run (benchmark)", () => {
    // 40 players walking a loop and 10 bosses standing about: the reviewer's worst case.
    const players = Array.from({ length: 40 }, (_, i) => i);
    const bosses = Array.from({ length: 10 }, (_, i) => unit(`boss${i}`, i * 120, 0, { player: false, boss: true }));
    const unitsAt = (ms: number) => [
      ...players.map((i) => unit(`p${i}`, ((ms / 1000) * 5) % 1200 + (i % 8) * 2, Math.floor(i / 8) * 2)),
      ...bosses,
    ];
    const build = startFollowTrackBuild({ startMs: 0, endMs: 3 * 60 * 60_000, unitsAt, scale: 1 });
    const spent: number[] = [];
    for (;;) {
      const started = performance.now();
      const finished = build.step(6);
      spent.push(performance.now() - started);
      if (finished) break;
    }
    const sorted = [...spent].sort((a, b) => a - b);
    const p95 = sorted[Math.floor(0.95 * (sorted.length - 1))]!;
    const total = spent.reduce((sum, ms) => sum + ms, 0);
    console.info(`follow track 3 h x 50 units: ${spent.length} slices, ${total.toFixed(0)} ms total, p95 ${p95.toFixed(1)} ms, longest ${sorted.at(-1)!.toFixed(1)} ms`);
    expect(build.result).not.toBeNull();
    expect(spent.length).toBeGreaterThan(100);
    // The budget is 6 ms (the fake-clock test above proves the slicing);
    // wall time here also carries GC and other test workers, so only the
    // typical slice is held to it, generously for slow CI machines.
    expect(p95).toBeLessThan(15);
  });

  it("is null when the followed unit is not in the source, so the per-frame path frames it", () => {
    // Following a mob or a pet: the source only holds players and bosses.
    expect(buildFollowTrack({ startMs: 0, endMs: 10_000, unitsAt: walkingGroup, scale: 1, subjectGuid: "mob-1" })).toBeNull();
    // A followed player who is in it gets a track centred on them.
    const track = buildFollowTrack({ startMs: 0, endMs: 10_000, unitsAt: walkingGroup, scale: 1, subjectGuid: "p4" })!;
    const out: FollowKey = { x: 0, z: 0, radius: 0 };
    const key = followKeyAt(track, 5_000, out);
    const p4 = walkingGroup(5_000).find((candidate) => candidate.guid === "p4")!;
    expect(Math.hypot(key.x - p4.x, key.z - p4.z)).toBeLessThan(2);
  });
});
