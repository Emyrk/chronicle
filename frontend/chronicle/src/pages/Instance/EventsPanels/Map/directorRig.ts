/**
 * The Director rig (chronicle-1987): the cinematic camera (chronicle-1079)
 * that keeps the boss and the group framed while the dungeon mesh shows. With
 * a follow source it shoots from the look-ahead track built off the frame
 * loop (chronicle-1579); without one it frames each frame as it comes, moved
 * only when the fight leaves the dead zones. Its line of sight climbs (and
 * shortens) around the cave, a replay jump glides or cuts, and a wall eases
 * its camera in from last frame's collision ray (the deliberate one-frame
 * lag: MapScene3D's collision pass writes `allowed` after the camera is
 * placed, and the next frame reads it).
 *
 * MapScene3D keeps the decision of whether it runs (`directing`, through the
 * camera arbiter) and placing the camera (`place`: the floor, the pivot, the
 * pan and floor limits); the rig keeps its springs, the track and the shot.
 */
import * as THREE from "three";
import type { CameraRig } from "./cameraRig";
import {
  AIM_AHEAD_FRACTION,
  BOSS_ENGAGE_YARDS,
  CINEMATIC_ELEVATION_DEG,
  CINEMATIC_ELEVATION_STEP_DEG,
  directorFrame,
  DISTANCE_DEAD_ZONE,
  DISTANCE_SMOOTH_SECONDS,
  exceedsDeadZone,
  frameDistance,
  MAX_CINEMATIC_ELEVATION_DEG,
  MIN_FRAME_RADIUS_YARDS,
  smoothDamp,
  snapDampedValue,
  STRAGGLER_CUTOFF_YARDS,
  STRAGGLER_RELEASE_YARDS,
  TARGET_DEAD_ZONE_FRACTION,
  TARGET_SMOOTH_SECONDS,
  type DampedValue,
  type DirectorUnit,
} from "./cameraDirector";
import { clockStepSeconds } from "./mapControls";
import { climbElevations, createShotHold, fallbackShot, FOLLOW_CENTRE_WINDOW_MS, FOLLOW_SHOT_CHECK_MS, FOLLOW_STEEP_ELEVATION_DEG, releaseSteepShot, shotCheckDue, steepPullIn, FOLLOW_SIGHT_STRIDE, FOLLOW_STEEP_MIN_DISTANCE_YARDS, seesFraming, sightPicks, type ShotAnswer, FOLLOW_SLICE_MS, followSprings, followYawStep, handOverFollowSpring, handOverFollowYaw, startFollowTrackBuild, wrapAngle, type FollowTrackBuild, followKeyAt, glideDurationMs, glidePoseAt, glideTurnMs, unwrapNear, holdShot, isReplayJump, type FollowKey, type FollowTrack, type FollowYawProbe, type GlidePose } from "./followCamera";
import { FLOOR_TRACK_TOLERANCE_YARDS, floorTrackAt, type FloorTracks } from "./walkableFloors";
import { mapPointToScene } from "./mapModel";
import { GROUND_WIDTH, MESH_PLAYER_HEIGHT_YARDS } from "./sceneConstants";
import { FREE_CAM_COLLISION_PADDING_SCENE_UNITS, MIN_DOUBLE_CLICK_DISTANCE_YARDS } from "./controlProfile";
import type { DungeonWorld } from "./dungeonWorld";
import type { UnitLayer } from "./unitLayer";
import type { EffectsLayer } from "./effectsLayer";
import type { MapSceneDirector, MapSceneFollowSource } from "./MapScene3D";

// A Director spring is settled once it is within this fraction of its goal.
const DIRECTOR_SETTLED = 1e-3;
// The yaw counts as settled within this (radians).
const DIRECTOR_SETTLED_YAW = 1e-3;
// With even the highest elevation blocked, the shot comes this much closer.
const CLEAR_SHOT_SHORTEN = 0.75;
// The elevations the Director's line of sight climbs through.
const DIRECTOR_CLIMB = climbElevations(CINEMATIC_ELEVATION_DEG, CINEMATIC_ELEVATION_STEP_DEG, MAX_CINEMATIC_ELEVATION_DEG);
// A wall pulls the Director's camera in over about this long (seconds) instead
// of in one frame; it eases back out at the distance spring's pace.
const DIRECTOR_COLLISION_IN_SECONDS = 0.25;
// A user's jump (cutDirector) cuts when the replay jumps within this long of it.
const DIRECTOR_CUT_WINDOW_MS = 1_000;

/** What a follow track was built for. */
interface FollowTrackInputs {
  key: string;
  subject: string | null;
  aspect: number;
  scale: number;
  speed: number;
  endMs: number;
  /** The no-Z floor tracks the yaw probe read units' heights from (null before they land: their arrival rebuilds the track). */
  floors: FloorTracks | null;
}

export interface DirectorRigHost {
  camera: THREE.PerspectiveCamera;
  controls(): { readonly target: THREE.Vector3 };
  world: DungeonWorld;
  unitLayer(): Pick<UnitLayer, "units" | "floorTracks" | "probeCeiling">;
  effects(): Pick<EffectsLayer, "clock" | "replayNow">;
  /** The Director's settings (null: off). */
  director(): MapSceneDirector | null;
  /** The followed unit (null: the group). */
  subject(): string | null;
  aspect(): number;
  now: () => number;
  disposed(): boolean;
  /** Whether the Director moves the camera now (MapScene3D.directing: it holds the camera, and no move or walk runs). */
  directing(): boolean;
  pivotFloor(x: number, z: number): number;
  cameraCeiling(): number | undefined;
  cameraYaw(): number;
  cameraElevationDeg(): number;
  /** Puts the camera on the shot (MapScene3D.placeDirectorCamera). */
  place(x: number, z: number, distance: number, elevationDeg: number, yaw: number): void;
  requestRender(): void;
}

export class DirectorRig implements CameraRig {
  readonly owner = "director";
  private readonly host: DirectorRigHost;

  // The springs are seeded and following; a re-engage while this is set is a
  // no-op, so the whole run's per-tick follow requests do not restart them.
  private running = false;
  // The first valid shot after the dungeon mesh loads should be visible immediately;
  // later Director changes keep their cinematic spring.
  private snapPending = false;
  // Springs: the aim point, the distance and the elevation above the horizon.
  private readonly xSpring: DampedValue = { value: 0, velocity: 0 };
  private readonly zSpring: DampedValue = { value: 0, velocity: 0 };
  private readonly distanceSpring: DampedValue = { value: 0, velocity: 0 };
  private readonly elevationSpring: DampedValue = { value: CINEMATIC_ELEVATION_DEG, velocity: 0 };
  // The goal the springs chase; it only moves when the fit leaves the dead zone.
  private readonly goal = { x: 0, z: 0, distance: 0, seeded: false };
  private frameAt = 0;
  // Scratch for the line-of-sight maths.
  private readonly aimScratch = new THREE.Vector3();
  private readonly eyeScratch = new THREE.Vector3();
  // Who the last frame held, for the straggler hysteresis.
  readonly inFrame = new Set<string>();
  // The look-ahead (chronicle-1579): the recorded replay, the framing track
  // built from it off the frame loop, and what that track was built for.
  private source: MapSceneFollowSource | null = null;
  // The last finished build and what it was for; its track is null when
  // nobody (or the followed unit) was ever there to frame, which is cached
  // too, so an empty floor is not rebuilt every frame.
  private followTrack: FollowTrack | null = null;
  private followTrackFor: FollowTrackInputs | null = null;
  // The build in flight, a slice per timer tick so a long run never blocks a frame.
  private followBuild: { build: FollowTrackBuild; inputs: FollowTrackInputs; timer: ReturnType<typeof setTimeout> } | null = null;
  // Whether the replay was playing at the Director's last frame: a pause or
  // resume re-anchors the jump check rather than reading as a jump.
  private replayPlaying = false;
  // The track where the group is, and the position and distance springs' goals (sampled ahead by their trails).
  private readonly followKey: FollowKey = { x: 0, z: 0, radius: 0, yaw: 0 };
  private readonly followLedKey: FollowKey = { x: 0, z: 0, radius: 0, yaw: 0 };
  private readonly followSizedKey: FollowKey = { x: 0, z: 0, radius: 0, yaw: 0 };
  private readonly followYawKey: FollowKey = { x: 0, z: 0, radius: 0, yaw: 0 };
  // The replay time the Director last framed, and when, to spot a jump.
  private lastReplayMs: number | null = null;
  private lastReplayAt = 0;
  // Until when a replay jump cuts instead of gliding (a jump the user asked for).
  private cutUntil = 0;
  // Line-of-sight hysteresis, so the shot cannot flip frame to frame.
  private readonly shotHold = createShotHold();
  // The last line-of-sight answer, and when it may be asked again (FOLLOW_SHOT_CHECK_MS).
  private shotRaw: ShotAnswer | null = null;
  private shotCheckAt = 0;
  // A wall pulled the steep camera in close: the next answer that is not steep replaces the held one.
  private shotRelease = false;
  // The last answer that was not steep: a release falls back to it when the answer is steep.
  private shotShallow: ShotAnswer | null = null;
  // The camera's actual target for the steep check (clearShot), and scratch vectors for it.
  private readonly shotPose = { x: 0, z: 0, floor: 0 };
  private readonly poseAimScratch = new THREE.Vector3();
  private readonly poseEyeScratch = new THREE.Vector3();
  // The framed units the line-of-sight answer keeps in sight (sightPicks), at player height.
  private readonly sightFramed: string[] = [];
  private readonly sightPicked: number[] = [];
  private readonly sightTargets: THREE.Vector3[] = [];
  private readonly sightBoss: boolean[] = [];
  private sightCount = 0;
  // The glide across a replay jump, from the pose the camera had.
  // The yaw turns on its own clock, `turn` ms, when a big turn needs longer than the move.
  private glide: { start: number; duration: number; turn: number } | null = null;
  private readonly glideFrom: GlidePose = { x: 0, z: 0, distance: 0, elevationDeg: 0 };
  private readonly glideTo: GlidePose = { x: 0, z: 0, distance: 0, elevationDeg: 0 };
  private readonly glidePose: GlidePose = { x: 0, z: 0, distance: 0, elevationDeg: 0 };
  // The yaw the Director shoots from while it follows a track (chronicle-1724),
  // unwrapped; without a track it keeps the camera's yaw.
  private readonly yawSpring: DampedValue = { value: 0, velocity: 0 };
  // The Director's collision: the distance it wants (the collision ray's
  // length), what the last ray allowed, and the eased reach between them.
  want: number | null = null;
  allowed: number | null = null;
  private readonly reachSpring: DampedValue = { value: 0, velocity: 0 };
  // Refilled per frame so the Director allocates nothing while it runs.
  private readonly unitList: DirectorUnit[] = [];

  constructor(host: DirectorRigHost) {
    this.host = host;
  }

  /** Whether the Director moves the camera now. */
  active(): boolean {
    return this.host.directing();
  }

  /** The recorded replay the track is built from (null: per-frame framing). */
  get followSource(): MapSceneFollowSource | null {
    return this.source;
  }

  /** Sets the follow source; false when it is the one already set. */
  setFollowSource(source: MapSceneFollowSource | null): boolean {
    if (source === this.source) return false;
    this.source = source;
    return true;
  }

  /** Stops following: the next engage re-seeds the springs. */
  stop() {
    this.running = false;
  }

  /** Turned off: stops following, and a pending first-shot snap is dropped. */
  off() {
    this.running = false;
    this.snapPending = false;
  }

  /** The replay jumped at the user's request: the jump cuts, and the next shot is framed afresh. */
  cut(now: number) {
    // A replay jump that lands a frame or two later still cuts, not glides.
    this.cutUntil = now + DIRECTOR_CUT_WINDOW_MS;
    this.goal.seeded = false;
    this.inFrame.clear();
  }

  /**
   * Takes the camera (the arbiter handed it back), springing from wherever
   * it is now; `snap` puts the next shot straight in place. Already
   * following: nothing to seed, or the springs would stutter.
   */
  engage(snap: boolean) {
    if (snap) this.snapPending = true;
    if (this.running) return;
    this.running = true;
    this.goal.seeded = false;
    this.inFrame.clear();
    this.frameAt = 0;
    const { target } = this.host.controls();
    this.xSpring.value = target.x;
    this.zSpring.value = target.z;
    this.xSpring.velocity = 0;
    this.zSpring.velocity = 0;
    this.distanceSpring.value = this.host.camera.position.distanceTo(target);
    this.distanceSpring.velocity = 0;
    this.elevationSpring.value = this.host.cameraElevationDeg();
    this.elevationSpring.velocity = 0;
    this.yawSpring.value = this.host.cameraYaw();
    this.yawSpring.velocity = 0;
    this.reachSpring.value = this.distanceSpring.value;
    this.reachSpring.velocity = 0;
    this.want = null;
    this.allowed = null;
    this.lastReplayMs = null;
    this.glide = null;
    Object.assign(this.shotHold, createShotHold());
    this.shotRaw = null;
    this.shotRelease = false;
    this.shotShallow = null;
  }

  /** The loop is going to sleep: the next frame takes a first-frame step. */
  restartClock() {
    this.frameAt = 0;
  }

  dispose() {
    if (this.followBuild) clearTimeout(this.followBuild.timer);
  }

  // The framing track for the current source and followed unit, or null
  // while none fits (or the last build found nobody to frame: the per-frame
  // path then frames). A missing track is built in slices off the frame loop;
  // one for another speed, or one the data has grown past, still serves until
  // its replacement is ready. Growth only rebuilds once the replay nears the
  // old track's end, so a streaming result does not rebuild on every chunk.
  private currentFollowTrack(replayMs: number): FollowTrack | null {
    const mesh = this.host.world.dungeonMesh;
    const source = this.source;
    if (!mesh || !source) return null;
    const subject = this.host.subject();
    const speed = Math.max(1, this.host.effects().clock.speed);
    const built = this.followTrackFor;
    const fits = this.followInputsMatch(built, source.key, subject, mesh.scale);
    const stale = !fits
      || built!.speed !== speed
      // Not the (capped) centre window: the margin stays 3 s of real time at any speed, longer than a sliced rebuild takes.
      || (source.endMs > built!.endMs && replayMs > built!.endMs - FOLLOW_CENTRE_WINDOW_MS * speed)
      // Built before the no-Z floor tracks landed (a slower build): the yaw
      // probe reads units' heights from them. Later changes to them (growth)
      // are picked up by the next rebuild.
      || (built!.floors === null && this.host.unitLayer().floorTracks !== null);
    const pending = this.followBuild?.inputs ?? null;
    if (stale && !(this.followInputsMatch(pending, source.key, subject, mesh.scale) && pending!.speed === speed && (pending!.floors !== null || this.host.unitLayer().floorTracks === null))) {
      this.startFollowBuild(source, { key: source.key, subject, aspect: this.host.aspect(), scale: mesh.scale, speed, endMs: source.endMs, floors: this.host.unitLayer().floorTracks });
    }
    return fits ? this.followTrack : null;
  }

  // Whether `inputs` is a build of the same data, followed unit and placement.
  private followInputsMatch(inputs: FollowTrackInputs | null, key: string, subject: string | null, scale: number): boolean {
    return inputs !== null && inputs.key === key && inputs.subject === subject && inputs.aspect === this.host.aspect() && inputs.scale === scale;
  }

  // Starts (or restarts) the sliced follow-track build for `inputs`.
  private startFollowBuild(source: MapSceneFollowSource, inputs: FollowTrackInputs) {
    if (this.followBuild) clearTimeout(this.followBuild.timer);
    const { aspect } = inputs;
    const build = startFollowTrackBuild({
      startMs: source.startMs,
      endMs: inputs.endMs,
      scale: inputs.scale,
      subjectGuid: inputs.subject,
      speed: inputs.speed,
      initialYaw: this.host.cameraYaw(),
      probe: this.followYawProbe(inputs.scale),
      unitsAt: (ms) => source.unitsAt(ms).map((unit): DirectorUnit => {
        const { x, z } = mapPointToScene(unit.point, aspect, GROUND_WIDTH);
        // The sample's own height: logged, or the unit's floor track then (no-Z logs).
        const track = unit.z === undefined ? inputs.floors?.units.get(unit.guid) : undefined;
        const floor = track ? floorTrackAt(track, ms, x, z, FLOOR_TRACK_TOLERANCE_YARDS * inputs.scale) : null;
        const height = unit.z ?? (floor === null ? undefined : floor / inputs.scale);
        return { guid: unit.guid, x, z, player: unit.player, boss: unit.boss, dead: unit.dead, height };
      }),
    }, this.host.now);
    const slice = () => {
      const current = this.followBuild;
      if (this.host.disposed() || !current || current.build !== build) return;
      if (!build.step(FOLLOW_SLICE_MS)) {
        current.timer = setTimeout(slice, 0);
        return;
      }
      this.followBuild = null;
      this.followTrack = build.result;
      this.followTrackFor = inputs;
      this.host.requestRender();
    };
    this.followBuild = { build, inputs, timer: setTimeout(slice, 0) };
  }

  // The line-of-sight answer at `yaw` (the track has already turned it to a
  // clear side where it could): the lowest cinematic elevation whose camera
  // is clear of the cave toward the aim point and sees the framed units,
  // climbing in steps; the shot shortens only if no climb does (fallbackShot).
  // `floor` is the floor below (x, z).
  // With a `pose` (where the camera's spring actually holds its target, and
  // the floor there), a steep shot must also stay clear of a wall closer than
  // FOLLOW_STEEP_MIN_DISTANCE_YARDS from there: its line from the goal can be
  // clear while the camera's own is not (the led spring, floor differences),
  // and a wall that pulls a steep camera in shows only the floor.
  private clearShot(x: number, floor: number, z: number, distance: number, yaw: number, pose: { x: number; z: number; floor: number } | null = null): ShotAnswer {
    const lift = MESH_PLAYER_HEIGHT_YARDS * (this.host.world.dungeonMesh?.scale ?? 1);
    const steepMin = FOLLOW_STEEP_MIN_DISTANCE_YARDS * (this.host.world.dungeonMesh?.scale ?? 1);
    return fallbackShot(DIRECTOR_CLIMB, (elevationDeg, shortened) => {
      // From the fight's own height, not the floor the ray would graze.
      const aim = this.aimScratch.set(x, floor + lift, z);
      const out = shortened ? this.shortenedShot(distance) : distance;
      const elevation = (elevationDeg * Math.PI) / 180;
      const eye = this.eyeScratch.set(
        x + Math.sin(yaw) * Math.cos(elevation) * out,
        floor + Math.sin(elevation) * out,
        z + Math.cos(yaw) * Math.cos(elevation) * out,
      );
      // A wall on the aim line would pull the camera in: not this shot.
      if (this.host.world.meshBlocks(aim, eye)) return false;
      if (pose && elevationDeg > FOLLOW_STEEP_ELEVATION_DEG) {
        const from = this.poseAimScratch.set(pose.x, pose.floor + lift, pose.z);
        const to = this.poseEyeScratch.set(
          pose.x + Math.sin(yaw) * Math.cos(elevation) * out,
          pose.floor + Math.sin(elevation) * out,
          pose.z + Math.cos(yaw) * Math.cos(elevation) * out,
        );
        const hit = this.host.world.meshHitDistance(from, to);
        if (hit !== null && hit - FREE_CAM_COLLISION_PADDING_SCENE_UNITS < steepMin) return false;
      }
      return seesFraming(this.sightCount, (k) => this.sightBoss[k]!, (k) => !this.host.world.meshBlocks(eye, this.sightTargets[k]!)) || "aim";
    });
  }

  // The video drone's line of sight (unchanged by chronicle-1725): the lowest
  // cinematic elevation with a clear line to the aim point, climbing in steps;
  // the shot shortens only if even the highest one is blocked.
  droneClearShot(x: number, z: number, distance: number, yaw: number): { elevation: number; distance: number } {
    const floor = this.host.world.floorHeights.heightAt("director-shot", x, z, this.host.cameraCeiling());
    const aim = this.aimScratch.set(x, floor + MESH_PLAYER_HEIGHT_YARDS * (this.host.world.dungeonMesh?.scale ?? 1), z);
    for (const elevationDeg of DIRECTOR_CLIMB) {
      const elevation = (elevationDeg * Math.PI) / 180;
      const eye = this.eyeScratch.set(
        x + Math.sin(yaw) * Math.cos(elevation) * distance,
        floor + Math.sin(elevation) * distance,
        z + Math.cos(yaw) * Math.cos(elevation) * distance,
      );
      if (!this.host.world.meshBlocks(aim, eye)) return { elevation: elevationDeg, distance };
    }
    // Still blocked overhead: come in closer instead.
    return { elevation: MAX_CINEMATIC_ELEVATION_DEG, distance: this.shortenedShot(distance) };
  }

  // Re-reads the framed units the line of sight checks: the boss and up to
  // FOLLOW_SIGHT_MAX_PLAYERS players, at player height above where they stand.
  private readSightTargets(bossGuids: ReadonlySet<string>, scale: number) {
    const framed = this.sightFramed;
    framed.length = 0;
    for (const guid of this.inFrame) if (this.host.unitLayer().units.has(guid)) framed.push(guid);
    const picked = sightPicks(framed.length, (k) => bossGuids.has(framed[k]!), this.sightPicked);
    for (let j = 0; j < picked.length; j++) {
      const guid = framed[picked[j]!]!;
      const { base } = this.host.unitLayer().units.get(guid)!;
      (this.sightTargets[j] ??= new THREE.Vector3()).set(base.x, base.y + MESH_PLAYER_HEIGHT_YARDS * scale, base.z);
      this.sightBoss[j] = bossGuids.has(guid);
    }
    this.sightCount = picked.length;
  }

  // The follow track's yaw probe: per sample, the floor below the framing
  // (found once, below that sample's units) and the base shot's distance;
  // per yaw, the line from the framing to where updateDirector puts the
  // camera at the base elevation (the aim point sits AIM_AHEAD_FRACTION of
  // the radius past the framing, away from it).
  private followYawProbe(scale: number): FollowYawProbe {
    const from = new THREE.Vector3();
    const to = new THREE.Vector3();
    const elevation = (CINEMATIC_ELEVATION_DEG * Math.PI) / 180;
    const lift = MESH_PLAYER_HEIGHT_YARDS * scale;
    const targets: THREE.Vector3[] = [];
    const boss: boolean[] = [];
    let count = 0;
    let out = 0;
    let up = 0;
    return {
      sample: (x, z, radius, height, framed) => {
        if (!this.host.world.dungeonMesh) return false;
        // No floor below (a chasm, off the mesh): skip the sample rather than cast from y = 0.
        const floor = this.host.world.sampleFloor(x, z, this.host.unitLayer().probeCeiling(height, scale));
        if (floor === null) return false;
        from.set(x, floor + lift, z);
        // The framed units at player height: over their own logged or tracked
        // height, else over the framing's floor (no extra floor rays).
        count = framed.length / FOLLOW_SIGHT_STRIDE;
        for (let k = 0; k < count; k++) {
          const at = k * FOLLOW_SIGHT_STRIDE;
          const own = framed[at + 2]!;
          (targets[k] ??= new THREE.Vector3()).set(framed[at]!, (Number.isNaN(own) ? floor : own * scale) + lift, framed[at + 1]!);
          boss[k] = framed[at + 3] === 1;
        }
        const distance = frameDistance(radius, {
          verticalFov: (this.host.camera.fov * Math.PI) / 180,
          aspect: this.host.camera.aspect,
          elevationDeg: CINEMATIC_ELEVATION_DEG,
          scale,
        });
        out = Math.cos(elevation) * distance - AIM_AHEAD_FRACTION * Math.max(radius, MIN_FRAME_RADIUS_YARDS * scale);
        up = floor + Math.sin(elevation) * distance;
        return true;
      },
      clearYaw: (yaw) => {
        if (!this.host.world.dungeonMesh) return true;
        to.set(from.x + Math.sin(yaw) * out, up, from.z + Math.cos(yaw) * out);
        if (this.host.world.meshBlocks(from, to)) return false;
        return seesFraming(count, (k) => boss[k]!, (k) => !this.host.world.meshBlocks(to, targets[k]!)) || "aim";
      },
    };
  }

  // How close a shot blocked even from overhead comes in.
  private shortenedShot(distance: number): number {
    return Math.max(MIN_DOUBLE_CLICK_DISTANCE_YARDS * (this.host.world.dungeonMesh?.scale ?? 1), distance * CLEAR_SHOT_SHORTEN);
  }

  // Re-fills the pooled unit list the framing rule reads.
  private readUnits(bossGuids: ReadonlySet<string>): DirectorUnit[] {
    const units = this.unitList;
    let count = 0;
    for (const [guid, object] of this.host.unitLayer().units) {
      const slot = (units[count] ??= { guid: "", x: 0, z: 0, player: false, boss: false, dead: false });
      slot.guid = guid;
      slot.x = object.base.x;
      slot.z = object.base.z;
      slot.player = object.kind === "player";
      slot.boss = bossGuids.has(guid);
      slot.dead = object.dead || object.health?.dead === true;
      count++;
    }
    units.length = count;
    return units;
  }

  /**
   * One Director step: works out the shot that holds the boss and the group
   * and springs the camera toward it. With a follow source the shot comes
   * from the look-ahead track at the replay time (continuous, so the springs
   * only smooth what is left); without one, from this frame's framing, moved
   * only when it leaves the dead zones. A replay jump glides (or cuts, when
   * the user asked for it). Returns whether the camera needs another frame.
   */
  update(now: number): boolean {
    const mesh = this.host.world.dungeonMesh;
    const director = this.host.director();
    if (!mesh || !director || !this.host.directing()) return false;
    const frame = directorFrame(this.readUnits(director.bossGuids), this.inFrame, {
      stragglerCutoff: STRAGGLER_CUTOFF_YARDS * mesh.scale,
      stragglerRelease: STRAGGLER_RELEASE_YARDS * mesh.scale,
      bossEngageDistance: BOSS_ENGAGE_YARDS * mesh.scale,
      subjectGuid: this.host.subject(),
    });
    const dt = clockStepSeconds(now, this.frameAt);
    this.frameAt = now;
    this.inFrame.clear();
    if (frame) for (const guid of frame.guids) this.inFrame.add(guid);
    const replayMs = this.host.effects().replayNow(now);
    const track = this.currentFollowTrack(replayMs);
    if (!frame && !track) return false;

    // A replay jump: the clock moved by more than playback explains. A pause
    // or resume since the last frame re-anchors instead (the paused time is
    // not playback it missed).
    const previousMs = this.host.effects().clock.playing === this.replayPlaying ? this.lastReplayMs : null;
    const expectedMs = this.host.effects().clock.playing ? (now - this.lastReplayAt) * this.host.effects().clock.speed : 0;
    const jumped = previousMs !== null && isReplayJump(previousMs, replayMs, expectedMs, this.host.effects().clock.speed, this.host.effects().clock.playing);
    this.lastReplayMs = replayMs;
    this.lastReplayAt = now;
    this.replayPlaying = this.host.effects().clock.playing;

    // Where the group is, and the springs' goals: sampled ahead by each
    // spring's trail, which the spring then takes back.
    const springs = track ? followSprings(this.host.effects().clock.speed, this.host.effects().clock.playing) : null;
    const key = track ? followKeyAt(track, replayMs, this.followKey) : null;
    const led = track ? followKeyAt(track, replayMs + springs!.leadMs, this.followLedKey) : null;
    const sized = track ? followKeyAt(track, replayMs + springs!.distanceLeadMs, this.followSizedKey) : null;
    const centreX = key ? key.x : frame!.x;
    const centreZ = key ? key.z : frame!.z;
    const frameRadius = sized ? sized.radius : frame!.radius;
    const radius = Math.max(frameRadius, MIN_FRAME_RADIUS_YARDS * mesh.scale);
    // The yaw: the track's where it has one (where the group is, and led for
    // the spring, as the position); otherwise whatever the user last orbited to.
    const yawLed = track ? followKeyAt(track, replayMs + springs!.yawLeadMs, this.followYawKey).yaw : null;
    const yaw = key ? key.yaw : this.host.cameraYaw();
    // The yaw the camera actually sits at: the spring's (rate-capped, so up to
    // half a turn off the track's for a few seconds after Follow or a new
    // track), or the track's on a cut. The aim offset and the line of sight
    // use it; glide and cut targets use the track's.
    const cutting = this.snapPending || (jumped && now < this.cutUntil);
    const placedYaw = key && !cutting ? this.yawSpring.value : yaw;
    // The aim point sits past the fight, away from the camera, so the fight
    // reads below the centre line with the room above it.
    const ahead = AIM_AHEAD_FRACTION * radius;
    const aimX = centreX - Math.sin(placedYaw) * ahead;
    const aimZ = centreZ - Math.cos(placedYaw) * ahead;
    const fitted = frameDistance(frameRadius, {
      verticalFov: (this.host.camera.fov * Math.PI) / 180,
      aspect: this.host.camera.aspect,
      elevationDeg: this.elevationSpring.value,
      scale: mesh.scale,
    });
    const goal = this.goal;
    if (!goal.seeded || key) {
      // The track is already smooth: the goal follows it exactly.
      goal.x = aimX;
      goal.z = aimZ;
      goal.distance = fitted;
      goal.seeded = true;
    } else {
      // Dead zones: a fight that stays put keeps the camera still.
      if (Math.hypot(aimX - goal.x, aimZ - goal.z) > TARGET_DEAD_ZONE_FRACTION * radius) {
        goal.x = aimX;
        goal.z = aimZ;
      }
      if (exceedsDeadZone(goal.distance, fitted, DISTANCE_DEAD_ZONE)) goal.distance = fitted;
    }
    // The position spring chases the led aim point; the line of sight, a
    // glide and a cut use the goal (where the group is).
    const springX = led ? led.x - Math.sin(placedYaw) * ahead : goal.x;
    const springZ = led ? led.z - Math.cos(placedYaw) * ahead : goal.z;
    // While the held shot is steep, a wall that pulled the camera in close
    // (last frame's collision) releases it for the next answer that is not;
    // steep answers then cannot win straight back (releaseSteepShot).
    if (this.shotHold.elevationDeg <= FOLLOW_STEEP_ELEVATION_DEG) this.shotRelease = false;
    else if (steepPullIn(this.elevationSpring.value, this.allowed, FOLLOW_STEEP_MIN_DISTANCE_YARDS * mesh.scale)) this.shotRelease = true;
    // Asked again every FOLLOW_SHOT_CHECK_MS, and at once on a cut or a jump.
    if (shotCheckDue(now, this.shotCheckAt, this.shotRaw !== null, cutting || jumped)) {
      this.readSightTargets(director.bossGuids, mesh.scale);
      // Gliding (from the jump's frame on), the shot lands at the track's yaw
      // where the group is: check there, not at the yaw the camera turns
      // through. Otherwise, where the camera is headed, steep shots also
      // checked from where its spring actually holds it.
      const gliding = key !== null && (jumped || this.glide !== null);
      const checkYaw = gliding ? yaw : placedYaw;
      const checkX = gliding ? centreX - Math.sin(yaw) * ahead : goal.x;
      const checkZ = gliding ? centreZ - Math.cos(yaw) * ahead : goal.z;
      const floor = this.host.world.floorHeights.heightAt("director-shot", checkX, checkZ, this.host.cameraCeiling());
      let pose: { x: number; z: number; floor: number } | null = null;
      if (!gliding && !cutting) {
        pose = this.shotPose;
        pose.x = this.xSpring.value;
        pose.z = this.zSpring.value;
        pose.floor = this.host.pivotFloor(pose.x, pose.z);
      }
      this.shotRaw = this.clearShot(checkX, floor, checkZ, goal.distance, checkYaw, pose);
      this.shotCheckAt = now + FOLLOW_SHOT_CHECK_MS;
      if (this.shotRaw.elevationDeg <= FOLLOW_STEEP_ELEVATION_DEG) this.shotShallow = this.shotRaw;
      if (this.shotRelease && releaseSteepShot(this.shotHold, this.shotRaw, now, this.shotShallow)) this.shotRelease = false;
    }
    const hold = holdShot(this.shotHold, this.shotRaw!.elevationDeg, this.shotRaw!.shortened, now);
    const shotElevation = hold.elevationDeg;
    const shotDistance = hold.shortened ? this.shortenedShot(goal.distance) : goal.distance;

    if (jumped) {
      if (now < this.cutUntil) {
        this.cutUntil = 0;
        this.snapPending = true;
      } else if (!this.snapPending) {
        const from = this.glideFrom;
        from.x = this.xSpring.value;
        from.z = this.zSpring.value;
        from.distance = this.distanceSpring.value;
        from.elevationDeg = this.elevationSpring.value;
        from.vx = this.xSpring.velocity;
        from.vz = this.zSpring.velocity;
        from.yaw = this.yawSpring.value;
        from.vyaw = this.yawSpring.velocity;
        // The turn's direction is fixed here (the short way now), and a track
        // lost mid-glide keeps this target rather than swinging back.
        this.glideTo.yaw = key ? unwrapNear(yaw, from.yaw) : from.yaw;
        const duration = glideDurationMs(Math.hypot(goal.x - from.x, goal.z - from.z), mesh.scale);
        // Started a frame back, so this frame already moves (no one-frame stall).
        this.glide = { start: now - dt * 1000, duration, turn: glideTurnMs(this.glideTo.yaw - from.yaw, duration) };
      }
    }

    if (this.snapPending) {
      this.snapPending = false;
      this.glide = null;
      // On the group, already moving with it, so the led spring has nothing to take back.
      const x = springs ? handOverFollowSpring(this.xSpring, goal.x, springX, springs).value : snapDampedValue(this.xSpring, goal.x);
      const z = springs ? handOverFollowSpring(this.zSpring, goal.z, springZ, springs).value : snapDampedValue(this.zSpring, goal.z);
      const distance = snapDampedValue(this.distanceSpring, shotDistance);
      const elevation = snapDampedValue(this.elevationSpring, shotElevation);
      const shotYaw = springs ? handOverFollowYaw(this.yawSpring, yaw, yawLed!, springs).value : snapDampedValue(this.yawSpring, yaw);
      this.host.place(x, z, this.reachFor(distance, dt, true), elevation, shotYaw);
      return false;
    }

    const glide = this.glide;
    if (glide) {
      const to = this.glideTo;
      // Landing where the group is, at the track's yaw (not the yaw the camera is still turning from).
      to.x = key ? centreX - Math.sin(yaw) * ahead : goal.x;
      to.z = key ? centreZ - Math.cos(yaw) * ahead : goal.z;
      to.distance = shotDistance;
      to.elevationDeg = shotElevation;
      // The target follows the track near where it was (never flipping the
      // turn); without a track it keeps the yaw it was heading for.
      if (key) to.yaw = unwrapNear(yaw, to.yaw!);
      const t = Math.min(1, (now - glide.start) / glide.duration);
      const turnT = Math.min(1, (now - glide.start) / glide.turn);
      const lastX = this.xSpring.value;
      const lastZ = this.zSpring.value;
      const lastYaw = this.yawSpring.value;
      const pose = glidePoseAt(this.glideFrom, to, t, this.glidePose, glide.duration, turnT, glide.turn);
      // The springs ride along (velocity too), so the springs, or another
      // jump's glide, carry on from here without a corner.
      snapDampedValue(this.xSpring, pose.x);
      snapDampedValue(this.zSpring, pose.z);
      this.xSpring.velocity = (pose.x - lastX) / dt;
      this.zSpring.velocity = (pose.z - lastZ) / dt;
      snapDampedValue(this.distanceSpring, pose.distance);
      snapDampedValue(this.elevationSpring, pose.elevationDeg);
      snapDampedValue(this.yawSpring, pose.yaw!);
      this.yawSpring.velocity = (pose.yaw! - lastYaw) / dt;
      if (t >= 1 && turnT >= 1) this.glide = null;
      this.host.place(pose.x, pose.z, this.reachFor(pose.distance, dt, false), pose.elevationDeg, pose.yaw!);
      return true;
    }

    const smooth = springs ? springs.position : TARGET_SMOOTH_SECONDS;
    const x = smoothDamp(this.xSpring, springX, smooth, dt);
    const z = smoothDamp(this.zSpring, springZ, smooth, dt);
    const distance = smoothDamp(this.distanceSpring, shotDistance, springs ? springs.distance : DISTANCE_SMOOTH_SECONDS, dt);
    const elevation = smoothDamp(this.elevationSpring, shotElevation, TARGET_SMOOTH_SECONDS, dt);
    const shotYaw = springs ? followYawStep(this.yawSpring, yawLed!, springs.yaw, dt) : snapDampedValue(this.yawSpring, yaw);
    const reach = this.reachFor(distance, dt, false);
    this.host.place(x, z, reach, elevation, shotYaw);
    const settled = Math.hypot(x - goal.x, z - goal.z) <= DIRECTOR_SETTLED * mesh.scale
      && Math.abs(distance - shotDistance) <= DIRECTOR_SETTLED * mesh.scale
      && Math.abs(reach - Math.min(distance, this.allowed ?? distance)) <= DIRECTOR_SETTLED * mesh.scale
      && Math.abs(elevation - shotElevation) <= DIRECTOR_SETTLED
      && Math.abs(wrapAngle(shotYaw - yaw)) <= DIRECTOR_SETTLED_YAW;
    // Playing, the track keeps moving; paused, the line-of-sight hold may still release.
    return !settled || (key !== null && this.host.effects().clock.playing) || this.shotHold.lowerSinceMs !== null;
  }

  // The distance the Director's camera sits at: `distance`, or nearer while
  // the last collision ray found a wall, easing in over
  // DIRECTOR_COLLISION_IN_SECONDS rather than in one frame.
  private reachFor(distance: number, dt: number, snap: boolean): number {
    const previous = this.want;
    // Not held in by a wall last frame: the reach is just the distance.
    const free = previous === null || this.reachSpring.value >= previous - 1e-4 * Math.max(1, previous);
    this.want = distance;
    const allowed = Math.min(distance, this.allowed ?? distance);
    if (snap || (free && allowed >= distance)) return snapDampedValue(this.reachSpring, allowed);
    const smooth = allowed < this.reachSpring.value ? DIRECTOR_COLLISION_IN_SECONDS : DISTANCE_SMOOTH_SECONDS;
    return Math.min(distance, smoothDamp(this.reachSpring, allowed, smooth, dt));
  }
}
