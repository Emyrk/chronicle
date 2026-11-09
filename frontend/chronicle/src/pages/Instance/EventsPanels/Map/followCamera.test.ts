import { describe, expect, it } from "vitest";
import { directorFrame, DISTANCE_SMOOTH_SECONDS, FRAME_FILL, MIN_FRAME_RADIUS_YARDS, smoothDamp, type DampedValue, type DirectorUnit } from "./cameraDirector";
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
  handOverFollowSpring,
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
  type FollowSprings,
  type FollowTrack,
  type GlidePose,
  heldYawChoices,
  nearestOpenYaw,
  FOLLOW_YAW_CANDIDATES_DEG,
  FOLLOW_YAW_MAX_RATE,
  FOLLOW_YAW_SMOOTH_SECONDS,
  followYawStep,
  handOverFollowYaw,
  wrapAngle,
  glideTurnMs,
  unwrapNear,
  type FollowYawProbe,
  climbElevations,
  directorPullIn,
  fallbackShot,
  FOLLOW_SIGHT_STRIDE,
  FOLLOW_STEEP_ELEVATION_DEG,
  seesFraming,
  sightPicks,
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
function motion(durationMs: number, at: (ms: number) => Pick<FollowKey, "x" | "z" | "radius">) {
  let previous: Pick<FollowKey, "x" | "z" | "radius"> | null = null;
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
    const out: FollowKey = { x: 0, z: 0, radius: 0, yaw: 0 };
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
    const out: FollowKey = { x: 0, z: 0, radius: 0, yaw: 0 };
    const before = followKeyAt(track, 8_000, out).x;
    const stillBefore = followKeyAt(track, 6_000, out).x;
    expect(before).toBeGreaterThan(stillBefore);
  });

  it("keeps everyone framed inside the shot's headroom, whatever the smoothing", () => {
    const track = buildFollowTrack({ startMs: 0, endMs: durationMs, unitsAt: walkingGroup, scale: 1 })!;
    const out: FollowKey = { x: 0, z: 0, radius: 0, yaw: 0 };
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
    const out: FollowKey = { x: 0, z: 0, radius: 0, yaw: 0 };
    const glide = motion(40_000, (ms) => followKeyAt(track, ms, out));
    // 300 yd over the 6 s triangular centre window peaks near 100 yd/s,
    // eased in and out; a one-frame jump would be 18,000 yd/s.
    expect(glide.speed).toBeLessThan(110);
    expect(glide.acceleration).toBeLessThan(80);
    expect(followKeyAt(track, 40_000, out).x).toBeCloseTo(302, 0);
  });

  it("stays continuous at a fast speed, with a centre window capped in replay time", () => {
    const fast = buildFollowTrack({ startMs: 0, endMs: durationMs, unitsAt: walkingGroup, scale: 1, speed: 32 })!;
    const out: FollowKey = { x: 0, z: 0, radius: 0, yaw: 0 };
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
    const out: FollowKey = { x: 0, z: 0, radius: 0, yaw: 0 };
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
      const out: FollowKey = { x: 0, z: 0, radius: 0, yaw: 0 };
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
  const preview = (smooth: number, goalMs: (replayMs: number) => number, drops = false) => {
    const speed = 32;
    const track = buildFollowTrack({ startMs: 0, endMs: 3_000_000, unitsAt: (ms) => [0, 1, 2].map((i) => unit(`p${i}`, (ms / 1000) * 7 + i, 0)), scale: 1, speed })!;
    const out: FollowKey = { x: 0, z: 0, radius: 0, yaw: 0 };
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
    }, drops);
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

  it("stays on the group with dropped frames too", () => {
    const springs = followSprings(32, true);
    const led = preview(springs.position, (replayMs) => replayMs + springs.leadMs, true);
    const trailing = preview(FOLLOW_SMOOTH_SECONDS, (replayMs) => replayMs, true);
    console.info(`32x preview, dropped frames: led jerk ${led.jerk.toFixed(0)} yd/s, off ${led.lag.toFixed(1)} yd; trailing jerk ${trailing.jerk.toFixed(0)} yd/s`);
    // Across a 100 ms frame the frame-to-frame velocity reads a step whatever
    // the spring: the led one reads no more than the old one did.
    expect(led.jerk).toBeLessThan(trailing.jerk + 1);
    expect(led.lag).toBeLessThan(10);
  });

  // A group walking +x at `pace` yd/s; the camera arrives on it at real time 0
  // by `arrive` (from a cut or a glide), then the position spring chases the
  // led goal as MapScene3D.updateDirector does. Returns the worst distance
  // between the camera and the group over the 2 s after.
  const afterHandover = (speed: number, pace: number, arrive: (track: FollowTrack, springs: FollowSprings, x: DampedValue) => number) => {
    const unitsAt = (ms: number) => [0, 1, 2].map((i) => unit(`p${i}`, (ms / 1000) * pace + i - 1, 0));
    const track = buildFollowTrack({ startMs: 0, endMs: 600_000, unitsAt, scale: 1, speed })!;
    const springs = followSprings(speed, true);
    const out: FollowKey = { x: 0, z: 0, radius: 0, yaw: 0 };
    const x: DampedValue = { value: 0, velocity: 0 };
    const startMs = arrive(track, springs, x);
    let worst = 0;
    for (let real = FRAME_MS; real <= 2_000; real += FRAME_MS) {
      const ms = startMs + real * speed;
      smoothDamp(x, followKeyAt(track, ms + springs.leadMs, out).x, springs.position, FRAME_MS / 1000);
      worst = Math.max(worst, Math.abs(x.value - (ms / 1000) * pace));
    }
    return worst;
  };
  // At 60 fps the spring's steady trail is about half a frame of travel past the lead's cancelling.
  const halfFrame = (speed: number, pace: number) => 0.5 * (FRAME_MS / 1000) * speed * pace + 0.1;

  it.each([[8, 7], [32, 7], [32, 14]])("hands over to the led spring after a cut without running ahead (%ix, %i yd/s)", (speed, pace) => {
    const startMs = 200_000;
    const cut = afterHandover(speed, pace, (track, springs, x) => {
      const out: FollowKey = { x: 0, z: 0, radius: 0, yaw: 0 };
      const at = followKeyAt(track, startMs, out).x;
      handOverFollowSpring(x, at, followKeyAt(track, startMs + springs.leadMs, out).x, springs);
      return startMs;
    });
    // Snapped onto the led goal at rest instead, it starts the whole lead ahead.
    const naive = afterHandover(speed, pace, (track, springs, x) => {
      x.value = followKeyAt(track, startMs + springs.leadMs, { x: 0, z: 0, radius: 0, yaw: 0 }).x;
      return startMs;
    });
    console.info(`cut at ${speed}x, ${pace} yd/s: off the group at most ${cut.toFixed(2)} yd (snapped onto the led goal: ${naive.toFixed(0)} yd)`);
    expect(naive).toBeGreaterThan(0.25 * speed * pace);
    expect(cut).toBeLessThan(halfFrame(speed, pace));
  });

  it.each([[8, 7], [32, 7], [32, 14]])("hands over to the led spring after a glide without running ahead (%ix, %i yd/s)", (speed, pace) => {
    const glide = afterHandover(speed, pace, (track, _springs, x) => {
      // A replay jump to 200 s: the glide (as updateDirector runs it) from
      // 300 yd away onto where the group is, riding along as it moves.
      const out: FollowKey = { x: 0, z: 0, radius: 0, yaw: 0 };
      const jumpMs = 200_000;
      const from: GlidePose = { x: followKeyAt(track, jumpMs, out).x - 300, z: 0, distance: 30, elevationDeg: 28 };
      const to: GlidePose = { x: 0, z: 0, distance: 30, elevationDeg: 28 };
      const pose: GlidePose = { x: 0, z: 0, distance: 0, elevationDeg: 0 };
      const duration = glideDurationMs(300, 1);
      x.value = from.x;
      let real = 0;
      for (;;) {
        real += FRAME_MS;
        to.x = followKeyAt(track, jumpMs + real * speed, out).x;
        const t = Math.min(1, real / duration);
        const last = x.value;
        glidePoseAt(from, to, t, pose, duration);
        x.value = pose.x;
        x.velocity = (pose.x - last) / (FRAME_MS / 1000);
        if (t >= 1) return jumpMs + real * speed;
      }
    });
    console.info(`glide at ${speed}x, ${pace} yd/s: off the group at most ${glide.toFixed(2)} yd after it lands`);
    expect(glide).toBeLessThan(halfFrame(speed, pace));
  });

  it("matches each spring's lead to its trail; paused, no lead", () => {
    expect(followSprings(1, true)).toEqual({
      position: FOLLOW_SMOOTH_SECONDS,
      leadMs: FOLLOW_SMOOTH_SECONDS * 1_000,
      distance: DISTANCE_SMOOTH_SECONDS,
      distanceLeadMs: DISTANCE_SMOOTH_SECONDS * 1_000,
      yaw: FOLLOW_YAW_SMOOTH_SECONDS,
      yawLeadMs: FOLLOW_YAW_SMOOTH_SECONDS * 1_000,
    });
    expect(followSprings(32, true).yawLeadMs).toBeCloseTo(32 * FOLLOW_YAW_SMOOTH_SECONDS * 1_000, 6);
    expect(followSprings(32, true).leadMs).toBeCloseTo(32 * FOLLOW_SMOOTH_SECONDS * 1_000, 6);
    expect(followSprings(32, true).distanceLeadMs).toBeCloseTo(32 * DISTANCE_SMOOTH_SECONDS * 1_000, 6);
    // Paused, a short seek eases in on the real-time springs rather than cutting.
    expect(followSprings(32, false)).toEqual({ ...followSprings(1, true), leadMs: 0, distanceLeadMs: 0, yawLeadMs: 0 });
  });

  it("a cut while paused hands over at rest", () => {
    const x = handOverFollowSpring({ value: 0, velocity: 5 }, 10, 10, followSprings(32, false));
    expect(x).toEqual({ value: 10, velocity: 0 });
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
    const out: FollowKey = { x: 0, z: 0, radius: 0, yaw: 0 };
    const key = followKeyAt(track, 5_000, out);
    const p4 = walkingGroup(5_000).find((candidate) => candidate.guid === "p4")!;
    expect(Math.hypot(key.x - p4.x, key.z - p4.z)).toBeLessThan(2);
  });
});

describe("follow track yaw", () => {
  const DEG = Math.PI / 180;
  // Behind travel along +x, and along +z (the camera sits at (sin yaw, cos yaw) from the aim).
  const BEHIND_X = -Math.PI / 2;
  const BEHIND_Z = Math.PI;
  const angleOff = (a: number, b: number) => Math.abs(wrapAngle(a - b));
  const keyAt = (track: FollowTrack, ms: number) => followKeyAt(track, ms, { x: 0, z: 0, radius: 0, yaw: 0 });

  /** Three players walk +x at 7 yd/s for 60 s, then turn and walk +z for 60 s. */
  const corner = (ms: number) => {
    const t = Math.min(ms, 120_000) / 1000;
    const x = Math.min(t, 60) * 7;
    const z = Math.max(0, t - 60) * 7;
    return [0, 1, 2].map((i) => unit(`p${i}`, x + i, z));
  };

  it("turns with the path: behind the group on each leg, turning before the corner", () => {
    const track = buildFollowTrack({ startMs: 0, endMs: 120_000, unitsAt: corner, scale: 1 })!;
    expect(angleOff(keyAt(track, 30_000).yaw, BEHIND_X)).toBeLessThan(DEG);
    expect(angleOff(keyAt(track, 100_000).yaw, BEHIND_Z)).toBeLessThan(DEG);
    // Look-ahead: already turning before the group reaches the corner.
    expect(angleOff(keyAt(track, 59_000).yaw, BEHIND_X)).toBeGreaterThan(5 * DEG);
    // And it turns the short way (90 degrees), not round through the other side.
    const swept = Math.abs(keyAt(track, 100_000).yaw - keyAt(track, 30_000).yaw);
    expect(swept).toBeCloseTo(Math.PI / 2, 2);
  });

  it("holds steady while the group stands (a fight) instead of spinning", () => {
    // Walk +x for 20 s, then stand for 60 s shuffling 2 yd about in every direction.
    const fight = (ms: number) => {
      const t = ms / 1000;
      const x = Math.min(t, 20) * 7;
      return [0, 1, 2, 3].map((i) => {
        const shuffle = t > 20 ? 2 * Math.sin(t * (1.3 + i) + i) : 0;
        return unit(`p${i}`, x + shuffle, Math.cos(t * (0.7 + i)) * (t > 20 ? 2 : 0) + i);
      });
    };
    const track = buildFollowTrack({ startMs: 0, endMs: 80_000, unitsAt: fight, scale: 1 })!;
    let worst = 0;
    for (let ms = 30_000; ms <= 80_000; ms += 250) worst = Math.max(worst, angleOff(keyAt(track, ms).yaw, BEHIND_X));
    console.info(`fight: worst yaw drift ${(worst / DEG).toFixed(1)} deg over 50 s of shuffling`);
    expect(worst / DEG).toBeLessThan(5);
  });

  it("starts on the first move's yaw, and keeps the initial yaw when nobody ever moves", () => {
    const later = (ms: number) => [0, 1].map((i) => unit(`p${i}`, Math.max(0, ms / 1000 - 30) * 7 + i, 0));
    const track = buildFollowTrack({ startMs: 0, endMs: 60_000, unitsAt: later, scale: 1, initialYaw: 1 })!;
    expect(angleOff(keyAt(track, 0).yaw, BEHIND_X)).toBeLessThan(DEG);
    const still = buildFollowTrack({ startMs: 0, endMs: 60_000, unitsAt: () => [unit("p0", 5, 5)], scale: 1, initialYaw: 1 })!;
    expect(keyAt(still, 30_000).yaw).toBeCloseTo(1, 9);
  });

  /** Five players walking a staircase of `leg` yd legs at 7 yd/s, alternately +x and +z: a 90 degree turn every leg. */
  const stairs = (leg: number) => (ms: number) => {
    const run = (ms / 1000) * 7;
    const i = Math.floor(run / leg);
    const along = run - i * leg;
    const x = Math.ceil(i / 2) * leg + (i % 2 === 0 ? along : 0);
    const z = Math.floor(i / 2) * leg + (i % 2 === 1 ? along : 0);
    return [[0, 0], [2, 1], [-2, 1], [1, -2], [-1, -2]].map(([dx, dz], k) => unit(`p${k}`, x + dx!, z + dz!));
  };

  it("unwraps across +-pi: a group walking circles turns on and on, never spinning back", () => {
    // A 40 yd circle walked anticlockwise at 7 yd/s: about 36 s a lap, five laps.
    const circle = (ms: number) => {
      const a = ((ms / 1000) * 7) / 40;
      return [unit("p0", 40 * Math.cos(a), 40 * Math.sin(a))];
    };
    const track = buildFollowTrack({ startMs: 0, endMs: 180_000, unitsAt: circle, scale: 1 })!;
    let previous = keyAt(track, 0).yaw;
    for (let ms = FRAME_MS; ms <= 180_000; ms += FRAME_MS) {
      const yaw = keyAt(track, ms).yaw;
      expect(Math.abs(yaw - previous)).toBeLessThan(0.05);
      previous = yaw;
    }
    // Several whole turns, one way.
    expect(Math.abs(keyAt(track, 170_000).yaw - keyAt(track, 10_000).yaw)).toBeGreaterThan(4 * Math.PI);
    // The spring turns the short way across the seam too.
    const spring = { value: Math.PI - 0.05, velocity: 0 };
    followYawStep(spring, -Math.PI + 0.05, FOLLOW_YAW_SMOOTH_SECONDS, 1);
    expect(spring.value).toBeGreaterThan(Math.PI - 0.05);
    expect(spring.value).toBeLessThanOrEqual(Math.PI + 0.05 + 1e-9);
  });

  it("caps the track's turn rate in real time, at 1x and 32x", () => {
    const worstTurn = (speed: number, leg: number, yawWindowMs?: number) => {
      const track = buildFollowTrack({ startMs: 0, endMs: 1_200_000, unitsAt: stairs(leg), scale: 1, speed, yawWindowMs })!;
      let worst = 0;
      const step = FRAME_MS * speed;
      let previous = keyAt(track, 0).yaw;
      for (let ms = step; ms <= 1_200_000; ms += step) {
        const yaw = keyAt(track, ms).yaw;
        worst = Math.max(worst, Math.abs(yaw - previous) / (FRAME_MS / 1000));
        previous = yaw;
      }
      return worst;
    };
    for (const [speed, leg] of [[1, 60], [32, 1_200]] as const) {
      // The default window: at 1x it alone keeps a sharp corner under the cap;
      // at 32x (stretched only FOLLOW_MAX_YAW_STRETCH) the cap is what holds it.
      const smoothed = worstTurn(speed, leg);
      // With almost no yaw window, the cap is what holds it.
      const capped = worstTurn(speed, leg, 250);
      console.info(`stairs ${speed}x: worst track turn ${(smoothed / DEG).toFixed(1)} deg/s, ${(capped / DEG).toFixed(1)} with a 250 ms window (cap ${(FOLLOW_YAW_MAX_RATE / DEG).toFixed(0)})`);
      if (speed === 1) expect(smoothed).toBeLessThan(FOLLOW_YAW_MAX_RATE);
      else expect(smoothed).toBeGreaterThan(FOLLOW_YAW_MAX_RATE * 0.9);
      expect(smoothed).toBeLessThan(FOLLOW_YAW_MAX_RATE * 1.3);
      // (At 1x the centre's own window spreads a corner over seconds; at 32x it is a fifth of a second of real time.)
      if (speed === 32) expect(capped).toBeGreaterThan(FOLLOW_YAW_MAX_RATE * 0.9);
      // Catmull-Rom between capped samples can overshoot a sample's chord a little.
      expect(capped).toBeLessThan(FOLLOW_YAW_MAX_RATE * 1.3);
    }
  });

  it("never turns more than the rate cap in a frame, without stutter, on the 32x preview clock", () => {
    const speed = 32;
    const span = 3_000_000;
    const track = buildFollowTrack({ startMs: 0, endMs: span, unitsAt: stairs(1_200), scale: 1, speed })!;
    const run = (smooth: number, lead: number) => {
      const spring: DampedValue = { value: keyAt(track, 0).yaw, velocity: 0 };
      let last: { now: number; yaw: number; rate: number } | null = null;
      let worstStep = 0;
      let jerk = 0;
      previewPlayback(speed, span, 60_000, (now, replayMs) => {
        const dt = last ? (now - last.now) / 1000 : FRAME_MS / 1000;
        const yaw = followYawStep(spring, keyAt(track, replayMs + lead).yaw, smooth, dt);
        const rate = last ? (yaw - last.yaw) / dt : 0;
        worstStep = Math.max(worstStep, Math.abs(rate));
        if (last && now > 2_000) jerk = Math.max(jerk, Math.abs(rate - last.rate));
        last = { now, yaw, rate };
      }, false);
      return { worstStep, jerk };
    };
    const springs = followSprings(speed, true);
    const led = run(springs.yaw, springs.yawLeadMs);
    const copying = run(FOLLOW_YAW_SMOOTH_SECONDS / speed, 0);
    console.info(`32x preview yaw: led worst ${(led.worstStep / DEG).toFixed(1)} deg/s, jerk ${(led.jerk / DEG).toFixed(2)} deg/s per frame; short spring jerk ${(copying.jerk / DEG).toFixed(2)}`);
    expect(led.worstStep).toBeLessThanOrEqual(FOLLOW_YAW_MAX_RATE + 1e-9);
    // The turns are real (the camera does turn), but its rate changes smoothly frame to frame.
    expect(led.worstStep).toBeGreaterThan(FOLLOW_YAW_MAX_RATE / 2);
    expect(led.jerk).toBeLessThan(copying.jerk);
    expect(led.jerk).toBeLessThan(2 * DEG);
  });

  /** A stub probe: `clear(sample, offsetDeg)` says whether candidate `offsetDeg` around the base is clear at the n-th sample probed. */
  const stubProbe = (base: number, clear: (sample: number, offsetDeg: number) => boolean) => {
    let sample = -1;
    const calls: number[] = [];
    const probe: FollowYawProbe = {
      sample: () => {
        sample++;
        calls[sample] = 0;
      },
      clearYaw: (yaw) => {
        calls[sample]!++;
        return clear(sample, Math.round(wrapAngle(yaw - base) / DEG));
      },
    };
    return { probe, calls };
  };

  it("turns a blocked base yaw to the nearest clear one, probing only until each side's nearest is known", () => {
    const straight = (ms: number) => [0, 1, 2].map((i) => unit(`p${i}`, (ms / 1000) * 7 + i, 0));
    // The cave blocks from 40 degrees one side of behind to 70 the other: only -60 and beyond are clear on that side.
    const { probe, calls } = stubProbe(BEHIND_X, (_, off) => off < -40 || off > 70);
    const track = buildFollowTrack({ startMs: 0, endMs: 60_000, unitsAt: straight, scale: 1, probe })!;
    expect(angleOff(keyAt(track, 30_000).yaw, BEHIND_X - 60 * DEG)).toBeLessThan(DEG);
    // The alternatives stay on the track: base, which candidates were probed, which were clear, and the choice.
    const i = Math.round(30_000 / track.sampleMs);
    expect(angleOff(track.baseYaw[i]!, BEHIND_X)).toBeLessThan(DEG);
    const listed = (mask: number) => FOLLOW_YAW_CANDIDATES_DEG.filter((_, k) => mask & (1 << k));
    // 0, 30, -30, 60 blocked; -60 is the nearest clear on the right, 90 on the left: stop there.
    expect(listed(track.yawProbed[i]!)).toEqual([0, 30, -30, 60, -60, 90]);
    expect(listed(track.yawOpen[i]!)).toEqual([-60, 90]);
    expect(FOLLOW_YAW_CANDIDATES_DEG[track.yawChoice[i]!]).toBe(-60);
    expect(calls[i]).toBe(6);
    // A clear base takes one ray.
    const open = stubProbe(BEHIND_X, () => true);
    buildFollowTrack({ startMs: 0, endMs: 60_000, unitsAt: straight, scale: 1, probe: open.probe });
    expect(open.calls.every((n) => n === 1)).toBe(true);
    // Without a probe every candidate counts as clear and the base wins.
    const free = buildFollowTrack({ startMs: 0, endMs: 60_000, unitsAt: straight, scale: 1 })!;
    expect(free.yawOpen[i]).toBe((1 << FOLLOW_YAW_CANDIDATES_DEG.length) - 1);
    expect(angleOff(keyAt(free, 30_000).yaw, BEHIND_X)).toBeLessThan(DEG);
  });

  it("gives each sample's probe the framed units' own height", () => {
    // Walking down a ramp: the height at each sample, not the one at build time.
    const ramp = (ms: number) => [0, 1, 2].map((i) => ({ ...unit(`p${i}`, (ms / 1000) * 7 + i, 0), height: -ms / 1000 + i }));
    const heights: (number | undefined)[] = [];
    buildFollowTrack({ startMs: 0, endMs: 20_000, unitsAt: ramp, scale: 1, probe: { sample: (_x, _z, _r, height) => void heights.push(height), clearYaw: () => true } });
    // The median of the three (i = 1).
    expect(heights[0]).toBeCloseTo(1, 9);
    expect(heights[40]).toBeCloseTo(-10 + 1, 9);
    // Unknown heights stay unknown.
    const none: (number | undefined)[] = [];
    buildFollowTrack({ startMs: 0, endMs: 5_000, unitsAt: corner, scale: 1, probe: { sample: (_x, _z, _r, height) => void none.push(height), clearYaw: () => true } });
    expect(none.every((height) => height === undefined)).toBe(true);
  });

  // A group walks in along +x for 10 s, then stands (a fight) for the rest.
  const standing = (ms: number) => {
    const t = Math.min(ms / 1000, 10);
    return [0, 1, 2, 3].map((i) => unit(`p${i}`, t * 6 + (i % 2), i));
  };
  // The total turn, and the worst distance from any probed choice (base + a candidate), over the fight.
  const fightYaw = (track: FollowTrack, fromMs: number) => {
    let worstOffChoice = 0;
    for (let ms = fromMs; ms <= track.endMs; ms += 250) {
      const yaw = keyAt(track, ms).yaw;
      worstOffChoice = Math.max(worstOffChoice, Math.min(...FOLLOW_YAW_CANDIDATES_DEG.map((deg) => angleOff(yaw, BEHIND_X + deg * DEG))));
    }
    // A blocked base (+90/-90 pairs) gives way once, to one side, and stays.
    const switches = Array.from(track.yawChoice).filter((k, j, all) => j > 0 && k !== all[j - 1]).length;
    expect(switches).toBeLessThanOrEqual(1);
    return { turn: Math.abs(keyAt(track, track.endMs).yaw - keyAt(track, fromMs).yaw), worstOffChoice };
  };

  it("does not spin through a fight when the clear yaw flips half a turn or side to side every sample (review 1728)", () => {
    for (const [name, pair] of [["0/180", [0, 180]], ["+90/-90", [90, -90]]] as const) {
      // From 15 s, only one of the pair is clear, alternating every sample.
      const { probe } = stubProbe(BEHIND_X, (sample, off) => (sample > 60 ? off === pair[sample % 2] : true));
      const track = buildFollowTrack({ startMs: 0, endMs: 300_000, unitsAt: standing, scale: 1, probe })!;
      const { turn, worstOffChoice } = fightYaw(track, 30_000);
      console.info(`flip ${name} every sample: turned ${(turn / DEG).toFixed(1)} deg, at most ${(worstOffChoice / DEG).toFixed(1)} deg off a probed choice`);
      expect(turn).toBeLessThan(DEG);
      expect(worstOffChoice).toBeLessThan(DEG);
    }
  });

  it("does not spin, nor settle sideways, when the clear yaw flips every 0.25-2.5 s", () => {
    for (const pair of [[0, 180], [90, -90]] as const) {
      let seed = 3;
      const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      let state = 0;
      let left = 0;
      const { probe } = stubProbe(BEHIND_X, (sample, off) => {
        if (sample <= 60) return true;
        if (off === 0) {
          // Once per sample (the base is always probed first): count the run down.
          if (left-- <= 0) {
            state ^= 1;
            left = 1 + Math.floor(random() * 10);
          }
        }
        return off === pair[state];
      });
      const track = buildFollowTrack({ startMs: 0, endMs: 300_000, unitsAt: standing, scale: 1, probe })!;
      const { turn, worstOffChoice } = fightYaw(track, 30_000);
      console.info(`flip ${pair.join("/")} in 0.25-2.5 s runs: turned ${(turn / DEG).toFixed(1)} deg, at most ${(worstOffChoice / DEG).toFixed(1)} deg off a probed choice`);
      expect(turn).toBeLessThan(DEG);
      expect(worstOffChoice).toBeLessThan(DEG);
    }
  });

  it("takes a new clear yaw that holds past the dwell, and still never accumulates a turn", () => {
    // The clear yaw flips 0 <-> 180 in runs of 1-10 s: some runs outlast the dwell and are taken.
    let seed = 11;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const runs: number[] = [];
    for (let at = 60; at < 1_300; at += 4 + Math.floor(random() * 36)) runs.push(at);
    const stateAt = (sample: number) => runs.filter((at) => at <= sample).length % 2;
    const { probe } = stubProbe(BEHIND_X, (sample, off) => (sample <= 60 ? true : off === (stateAt(sample) ? 180 : 0)));
    const track = buildFollowTrack({ startMs: 0, endMs: 300_000, unitsAt: standing, scale: 1, probe })!;
    const choices = new Set(Array.from(track.yawChoice).map((k) => FOLLOW_YAW_CANDIDATES_DEG[k]));
    expect(choices).toEqual(new Set([0, 180]));
    // Every yaw on the track lies between the two choices on one side (no laps): within half a turn of the base.
    for (const yaw of track.yaw) expect(Math.abs(yaw - BEHIND_X)).toBeLessThanOrEqual(Math.PI + 1e-9);
  });

  // Walking +x with the base blocked from 10 s on; `open(sample)` says which offsets are clear.
  const walkingBlocked = (open: (sample: number) => number[]) => {
    const walking = (ms: number) => [0, 1, 2, 3].map((i) => unit(`p${i}`, (ms / 1000) * 6 + (i % 2), i));
    const { probe } = stubProbe(BEHIND_X, (sample, off) => (sample < 40 ? true : open(sample).includes(off)));
    return buildFollowTrack({ startMs: 0, endMs: 120_000, unitsAt: walking, scale: 1, probe })!;
  };

  it("turns off a blocked base while walking even when the clear side moves between +30 and +60 each sample (review 1728b)", () => {
    const track = walkingBlocked((sample) => (sample % 2 ? [30] : [60]));
    const i = Math.round(60_000 / track.sampleMs);
    expect([30, 60]).toContain(FOLLOW_YAW_CANDIDATES_DEG[track.yawChoice[i]!]);
    // It switched once and stays (the held +30 or +60 is asked for again every other sample).
    const switches = Array.from(track.yawChoice).filter((k, j, all) => j > 0 && k !== all[j - 1]).length;
    expect(switches).toBe(1);
    expect(angleOff(keyAt(track, 60_000).yaw, BEHIND_X)).toBeGreaterThan(25 * DEG);
  });

  it("turns off a blocked base while walking even when one sample in eight has nothing clear (review 1728b)", () => {
    const track = walkingBlocked((sample) => (sample % 8 === 0 ? [] : [60]));
    expect(FOLLOW_YAW_CANDIDATES_DEG[track.yawChoice[Math.round(60_000 / track.sampleMs)]!]).toBe(60);
    expect(angleOff(keyAt(track, 60_000).yaw, BEHIND_X + 60 * DEG)).toBeLessThan(DEG);
  });

  it("skips a sample the probe cannot tell (no floor): it keeps the held choice", () => {
    let sample = -1;
    const probe: FollowYawProbe = {
      // From 10 s on, every other sample has no floor below; the rest have only +60 clear.
      sample: () => ++sample < 40 || sample % 2 === 0,
      clearYaw: (yaw) => sample < 40 || Math.round(wrapAngle(yaw - BEHIND_X) / DEG) === 60,
    };
    const walking = (ms: number) => [0, 1, 2, 3].map((i) => unit(`p${i}`, (ms / 1000) * 6 + (i % 2), i));
    const track = buildFollowTrack({ startMs: 0, endMs: 120_000, unitsAt: walking, scale: 1, probe })!;
    const i = Math.round(60_000 / track.sampleMs);
    expect(track.yawProbed[i % 2 ? i : i + 1]).toBe(0);
    expect(FOLLOW_YAW_CANDIDATES_DEG[track.yawChoice[i]!]).toBe(60);
  });

  it("heldYawChoices: a new choice takes over only after the dwell; nothing clear pauses the count", () => {
    const bit = (deg: number) => 1 << FOLLOW_YAW_CANDIDATES_DEG.indexOf(deg);
    const at = (deg: number) => FOLLOW_YAW_CANDIDATES_DEG.indexOf(deg);
    const open = Uint16Array.from([bit(0), bit(30), bit(30), bit(0), bit(30), 0, bit(30), bit(30), bit(0)]);
    // Asking for the held 0 again starts the count over; the empty sample only pauses it.
    expect(Array.from(heldYawChoices(open, 3))).toEqual([at(0), at(0), at(0), at(0), at(0), at(0), at(0), at(30), at(30)]);
    // The clear side moving between candidates still counts as away, and the latest one asked for takes over.
    expect(Array.from(heldYawChoices(Uint16Array.from([bit(0), bit(30), bit(60), bit(30), bit(60)]), 3))).toEqual([at(0), at(0), at(0), at(30), at(30)]);
    // The first sample takes its own choice; dwell 1 switches at once.
    expect(Array.from(heldYawChoices(Uint16Array.from([bit(60), bit(0)]), 1))).toEqual([at(60), at(0)]);
  });

  it("nearestOpenYaw: nearest clear candidate, a tie going to the side held, -1 when nothing is clear", () => {
    const bit = (deg: number) => 1 << FOLLOW_YAW_CANDIDATES_DEG.indexOf(deg);
    const at = (deg: number) => FOLLOW_YAW_CANDIDATES_DEG.indexOf(deg);
    expect(nearestOpenYaw(bit(30) | bit(-30), -1)).toBe(at(-30));
    expect(nearestOpenYaw(bit(30) | bit(-30), 1)).toBe(at(30));
    expect(nearestOpenYaw(bit(30) | bit(-30))).toBe(at(30));
    expect(nearestOpenYaw(bit(90) | bit(-60))).toBe(at(-60));
    expect(nearestOpenYaw(0)).toBe(-1);
  });

  it("hands the yaw spring over after a cut turning with the track, at rest when paused", () => {
    const playing = handOverFollowYaw({ value: 0, velocity: 0 }, 1, 1.1, followSprings(8, true));
    expect(playing.value).toBe(1);
    expect(playing.velocity).toBeCloseTo(0.1 / FOLLOW_YAW_SMOOTH_SECONDS, 9);
    expect(handOverFollowYaw({ value: 0, velocity: 3 }, 1, 1, followSprings(8, false))).toEqual({ value: 1, velocity: 0 });
  });

  it("a glide turns along the yaw it is given, slowly enough for a big turn, the move keeping its own length", () => {
    const from: GlidePose = { x: 0, z: 0, distance: 10, elevationDeg: 30, yaw: 3 };
    const to: GlidePose = { x: 0, z: 0, distance: 10, elevationDeg: 30, yaw: unwrapNear(-3, 3) };
    const out: GlidePose = { x: 0, z: 0, distance: 0, elevationDeg: 0 };
    // From 3 rad to -3 rad is 0.28 rad the short way, across pi (the caller unwraps the target).
    expect(glidePoseAt(from, to, 0.5, out).yaw).toBeCloseTo(3 + (2 * Math.PI - 6) / 2, 9);
    expect(glidePoseAt(from, to, 1, out).yaw).toBeCloseTo(-3 + 2 * Math.PI, 9);
    // Any turn's clock is long enough that its eased peak stays at the cap, even past GLIDE_MAX_MS...
    for (const turn of [Math.PI / 4, Math.PI / 2, Math.PI]) {
      const ms = glideTurnMs(turn, GLIDE_MIN_MS);
      expect(ms).toBeCloseTo(Math.max(GLIDE_MIN_MS, (1000 * turn * Math.PI) / (2 * FOLLOW_YAW_MAX_RATE)), 6);
      let peak = 0;
      for (let t = 0; t <= 1; t += 0.001) {
        const a = glidePoseAt({ ...from, yaw: 0 }, { ...to, yaw: turn }, 1, out, GLIDE_MIN_MS, t, ms).yaw!;
        const b = glidePoseAt({ ...from, yaw: 0 }, { ...to, yaw: turn }, 1, out, GLIDE_MIN_MS, t + 0.001, ms).yaw!;
        peak = Math.max(peak, Math.abs(b - a) / ((0.001 * ms) / 1000));
      }
      expect(peak).toBeLessThanOrEqual(FOLLOW_YAW_MAX_RATE * 1.001);
    }
    expect(glideTurnMs(Math.PI, GLIDE_MAX_MS)).toBeGreaterThan(GLIDE_MAX_MS);
    // ...while the move keeps car 1's length, GLIDE_MAX_MS at most.
    expect(glideDurationMs(10_000, 1)).toBe(GLIDE_MAX_MS);
    expect(glideTurnMs(0.1, 2_000)).toBe(2_000);
  });

  it("a glide whose target drifts across the opposite direction keeps turning the same way (review 1728b)", () => {
    // As MapScene3D.updateDirector glides: a 177 degree turn, the track's yaw drifting 6 degrees past half a turn meanwhile.
    const from: GlidePose = { x: 0, z: 0, distance: 10, elevationDeg: 30, yaw: 0, vyaw: 0 };
    const trackYaw = (t: number) => Math.PI - 3 * DEG + 6 * DEG * t;
    const to: GlidePose = { x: 0, z: 0, distance: 10, elevationDeg: 30, yaw: unwrapNear(trackYaw(0), from.yaw!) };
    const moveMs = GLIDE_MIN_MS;
    const turnMs = glideTurnMs(to.yaw! - from.yaw!, moveMs);
    const out: GlidePose = { x: 0, z: 0, distance: 0, elevationDeg: 0 };
    let previous = 0;
    let worst = 0;
    for (let now = FRAME_MS; now <= turnMs + FRAME_MS; now += FRAME_MS) {
      const turnT = Math.min(1, now / turnMs);
      to.yaw = unwrapNear(trackYaw(turnT), to.yaw!);
      const yaw = glidePoseAt(from, to, Math.min(1, now / moveMs), out, moveMs, turnT, turnMs).yaw!;
      worst = Math.max(worst, Math.abs(yaw - previous) / (FRAME_MS / 1000));
      previous = yaw;
    }
    console.info(`drifting half-turn glide: worst ${(worst / DEG).toFixed(1)} deg/s, ends at ${(previous / DEG).toFixed(1)} deg`);
    // Without the fixed direction this snapped about 180 degrees in one frame.
    expect(worst).toBeLessThan(FOLLOW_YAW_MAX_RATE * 1.1);
    expect(previous).toBeCloseTo(Math.PI + 3 * DEG, 6);
  });

  it("probes in slices too: no slice runs past its budget by more than one sample's probes", () => {
    let clock = 0;
    // Only half a turn round is clear, so every candidate is probed: 0.5 ms a floor, 0.1 ms a ray.
    const probe: FollowYawProbe = {
      sample: () => {
        clock += 0.5;
      },
      clearYaw: () => {
        clock += 0.1;
        return false;
      },
    };
    const build = startFollowTrackBuild({ startMs: 0, endMs: 120_000, unitsAt: corner, scale: 1, probe }, () => clock);
    let longest = 0;
    let slices = 0;
    for (;;) {
      const before = clock;
      const finished = build.step(6);
      longest = Math.max(longest, clock - before);
      slices++;
      if (finished) break;
    }
    // 481 samples of 1.5 ms each: about 120 slices.
    expect(slices).toBeGreaterThan(110);
    expect(longest).toBeLessThanOrEqual(6 + 1.5 + 1e-9);
    const whole = buildFollowTrack({ startMs: 0, endMs: 120_000, unitsAt: corner, scale: 1, probe: { sample: () => {}, clearYaw: () => false } })!;
    expect(Array.from(build.result!.yaw)).toEqual(Array.from(whole.yaw));
  });
});

describe("line of sight to the framed units (chronicle-1725)", () => {
  const CLIMB = climbElevations(28, 5, 50);
  const DEG = Math.PI / 180;
  // Walking +x, the camera sits behind at -x: yaw -90 degrees.
  const BEHIND_X = -Math.PI / 2;
  const keyAt = (track: FollowTrack, ms: number) => followKeyAt(track, ms, { x: 0, z: 0, radius: 0, yaw: 0 });
  // A seeded random, so flicker tests are repeatable.
  const seeded = (seed: number) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  it("climbs in steps up to the cap", () => {
    expect(CLIMB).toEqual([28, 33, 38, 43, 48, 50]);
  });

  it("checks the boss and at most five players, spread through the framing", () => {
    const picks: number[] = [];
    // A 5-man: everyone.
    expect(sightPicks(5, () => false, picks)).toEqual([0, 1, 2, 3, 4]);
    // The boss first, wherever it sits in the list.
    expect(sightPicks(6, (i) => i === 3, picks)).toEqual([3, 0, 1, 2, 4, 5]);
    // A raid of 40 with a boss: the boss and every eighth player.
    const raid = sightPicks(41, (i) => i === 40, picks);
    expect(raid).toEqual([40, 0, 8, 16, 24, 32]);
    // Never more than six, even with several bosses.
    expect(sightPicks(10, (i) => i < 3, picks)).toHaveLength(6);
    expect(sightPicks(0, () => false, picks)).toEqual([]);
  });

  it("needs the boss and most (60%) of the players checked", () => {
    const boss = (i: number) => i === 0;
    const sees = (clear: boolean[]) => seesFraming(clear.length, boss, (i) => clear[i]!);
    // Boss and 3 of 5 players: seen.
    expect(sees([true, true, true, true, false, false])).toBe(true);
    // Boss and 2 of 5: not.
    expect(sees([true, true, true, false, false, false])).toBe(false);
    // Every player but no boss: not.
    expect(sees([false, true, true, true, true, true])).toBe(false);
    // No boss framed: 3 of 5 players.
    expect(seesFraming(5, () => false, (i) => i < 3)).toBe(true);
    expect(seesFraming(5, () => false, (i) => i < 2)).toBe(false);
    // One player: that one. Nobody framed: nothing to hide.
    expect(seesFraming(1, () => false, () => false)).toBe(false);
    expect(seesFraming(0, () => false, () => false)).toBe(true);
    // A boss alone.
    expect(seesFraming(1, () => true, () => true)).toBe(true);
  });

  it("casts no more rays than the answer needs", () => {
    const boss = (i: number) => i === 0;
    let rays = 0;
    const count = (clear: boolean) => () => (rays++, clear);
    // A blocked boss: one ray.
    seesFraming(6, boss, count(false));
    expect(rays).toBe(1);
    // Everything clear: the boss and three players.
    rays = 0;
    seesFraming(6, boss, count(true));
    expect(rays).toBe(4);
    // Players blocked: the boss and three players (the third miss settles it).
    rays = 0;
    seesFraming(6, boss, (i) => (rays++, i === 0));
    expect(rays).toBe(4);
  });

  it("climbs before it shortens, and asks in that order", () => {
    const asked: string[] = [];
    const answer = (ok: (deg: number, shortened: boolean) => boolean) => fallbackShot(CLIMB, (deg, shortened) => {
      asked.push(`${deg}${shortened ? "s" : ""}`);
      return ok(deg, shortened);
    });
    // Clear at the base: no climb.
    expect(answer(() => true)).toEqual({ elevationDeg: 28, shortened: false });
    expect(asked).toEqual(["28"]);
    // A modest climb is enough.
    asked.length = 0;
    expect(answer((deg, shortened) => !shortened && deg >= 43)).toEqual({ elevationDeg: 43, shortened: false });
    expect(asked).toEqual(["28", "33", "38", "43"]);
    // A shortened shot sees from lower than the full one does: still every full climb first.
    asked.length = 0;
    expect(answer((deg, shortened) => shortened || deg >= 50)).toEqual({ elevationDeg: 50, shortened: false });
    // Nothing at the full distance: the lowest shortened shot that sees.
    asked.length = 0;
    expect(answer((deg, shortened) => shortened && deg >= 38)).toEqual({ elevationDeg: 38, shortened: true });
    expect(asked).toEqual(["28", "33", "38", "43", "48", "50", "28s", "38s"]);
    // Nothing anywhere: the top, shortened, as before.
    asked.length = 0;
    expect(answer(() => false)).toEqual({ elevationDeg: 50, shortened: true });
    expect(asked).toHaveLength(CLIMB.length + 3);
  });

  it("never pulls a steep camera in closer than the floor-safe distance", () => {
    // Shallow: a wall 3 out pulls the camera to 3 - padding (the old rule).
    expect(directorPullIn(30, 3, 0.75, 28, 1, 10)).toBeCloseTo(2.25, 9);
    // Steep: it stops at 10.
    expect(directorPullIn(30, 3, 0.75, FOLLOW_STEEP_ELEVATION_DEG + 1, 1, 10)).toBe(10);
    // A camera that wants less than that is not pushed out.
    expect(directorPullIn(8, 3, 0.75, 50, 1, 10)).toBe(8);
    // A wall past the floor-safe distance pulls in as before; no wall, no pull.
    expect(directorPullIn(30, 20, 0.75, 50, 1, 10)).toBeCloseTo(19.25, 9);
    expect(directorPullIn(30, null, 0.75, 50, 1, 10)).toBeNull();
  });

  it("holds the answer while each unit's line flickers from check to check", () => {
    // Every 100 ms check, each of the boss and five players is seen from the
    // base elevation with even odds (a pillar edge), and always from 43 degrees up.
    const random = seeded(11);
    const hold = createShotHold();
    let rawChanges = 0;
    let heldChanges = 0;
    let lastRaw = -1;
    let lastHeld = hold.elevationDeg;
    for (let now = 0; now < 60_000; now += 100) {
      const clear = Array.from({ length: 6 }, () => random() < 0.5);
      const raw = fallbackShot(CLIMB, (deg) => deg >= 43 || seesFraming(6, (i) => i === 0, (i) => clear[i]!));
      if (raw.elevationDeg !== lastRaw) rawChanges++;
      lastRaw = raw.elevationDeg;
      holdShot(hold, raw.elevationDeg, raw.shortened, now);
      if (hold.elevationDeg !== lastHeld) heldChanges++;
      lastHeld = hold.elevationDeg;
    }
    // The raw answer flips hundreds of times; the shot climbs once and stays.
    expect(rawChanges).toBeGreaterThan(100);
    expect(heldChanges).toBe(1);
    expect(hold.elevationDeg).toBe(43);
  });

  it("gives the probe each sample's boss and players, as the framing changes", () => {
    // Five players walk +x; one strays out of the frame and back every few
    // samples, and the boss is framed only in the second half.
    const random = seeded(5);
    const strays: boolean[] = [];
    const units = (ms: number) => {
      const i = Math.round(ms / 250);
      strays[i] ??= random() < 0.4;
      const walked = (ms / 1000) * 3;
      const group = [0, 1, 2, 3].map((k) => unit(`p${k}`, walked + k, 0, { height: 5 + k }));
      group.push(unit("p4", walked + (strays[i] ? 60 : 4), 0));
      if (ms >= 10_000) group.push(unit("boss", walked + 10, 0, { player: false, boss: true, height: 7 }));
      return group;
    };
    const seen: { count: number; boss: boolean; heights: number[]; hasStray: boolean }[] = [];
    const probe: FollowYawProbe = {
      sample: (_x, _z, _r, _h, targets) => {
        const count = targets.length / FOLLOW_SIGHT_STRIDE;
        const heights: number[] = [];
        let boss = false;
        let hasStray = false;
        for (let k = 0; k < count; k++) {
          heights.push(targets[k * FOLLOW_SIGHT_STRIDE + 2]!);
          if (targets[k * FOLLOW_SIGHT_STRIDE + 3] === 1) boss = true;
          if (targets[k * FOLLOW_SIGHT_STRIDE]! > (seen.length * 250 / 1000) * 3 + 30) hasStray = true;
        }
        seen.push({ count, boss, heights, hasStray });
      },
      clearYaw: () => true,
    };
    buildFollowTrack({ startMs: 0, endMs: 20_000, unitsAt: units, scale: 1, probe });
    expect(seen).toHaveLength(81);
    for (let i = 0; i < seen.length; i++) {
      const sample = seen[i]!;
      // The straggler is never a sight target while it is out of the frame.
      expect(sample.hasStray).toBe(false);
      expect(sample.boss).toBe(i * 250 >= 10_000);
      // Each target's own height; NaN for the one without.
      expect(sample.heights.slice(sample.boss ? 1 : 0, (sample.boss ? 1 : 0) + 4)).toEqual([5, 6, 7, 8]);
    }
    // Both framings occur: the straggler in (5 players) and out (4).
    const counts = new Set(seen.filter((sample) => !sample.boss).map((sample) => sample.count));
    expect(counts).toEqual(new Set([4, 5]));
  });

  it("turns to a yaw that sees the group before it climbs", () => {
    // Walking +x. Behind the group (and 30 degrees either side), a pillar
    // hides three of the five players from the base elevation, though the
    // aim line is clear; from 60 degrees round all five are seen. From
    // 43 degrees up, every yaw sees them.
    const straight = (ms: number) => [0, 1, 2, 3, 4].map((i) => unit(`p${i}`, (ms / 1000) * 7 + i, i % 2));
    const hiddenFrom = (offsetDeg: number, elevationDeg: number) => elevationDeg < 43 && Math.abs(offsetDeg) <= 30;
    let offset = 0;
    let count = 0;
    const probe: FollowYawProbe = {
      sample: (_x, _z, _r, _h, targets) => void (count = targets.length / FOLLOW_SIGHT_STRIDE),
      clearYaw: (yaw) => {
        offset = Math.round(wrapAngle(yaw - BEHIND_X) / DEG);
        return seesFraming(count, () => false, (k) => !(hiddenFrom(offset, 28) && k < 3));
      },
    };
    const track = buildFollowTrack({ startMs: 0, endMs: 60_000, unitsAt: straight, scale: 1, probe })!;
    const i = Math.round(30_000 / track.sampleMs);
    // The track turned (nearest clear: 60 degrees round)...
    expect(Math.abs(FOLLOW_YAW_CANDIDATES_DEG[track.yawChoice[i]!]!)).toBe(60);
    // ...so the shot at its yaw needs no climb.
    const turned = Math.round(wrapAngle(keyAt(track, 30_000).yaw - BEHIND_X) / DEG);
    const shot = fallbackShot(CLIMB, (deg) => seesFraming(5, () => false, (k) => !(hiddenFrom(turned, deg) && k < 3)));
    expect(shot).toEqual({ elevationDeg: 28, shortened: false });
    // Held at the base yaw instead, it would have had to climb.
    const behind = fallbackShot(CLIMB, (deg) => seesFraming(5, () => false, (k) => !(hiddenFrom(0, deg) && k < 3)));
    expect(behind).toEqual({ elevationDeg: 43, shortened: false });
  });
});
