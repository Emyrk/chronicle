/**
 * Live-session presence for MapScene3D (chronicle-1970): sending your camera
 * or walking character (throttled) and drawing everyone else's where they
 * are on the same mesh. The scene supplies its view of you
 * (`currentPresence`) and steps the others each frame. Moved verbatim out of
 * MapScene3D.ts.
 */
import * as THREE from "three";
import { participantHue, participantLabel, type LiveMapPresence } from "../../liveSessionProtocol";
import { PLAYER_GEOMETRY_HEIGHT } from "./sceneConstants";
import { clockStepSeconds } from "./mapControls";
import { createLabelSprite } from "./sceneFactories";

// --- Live session presence: everyone's camera or walking character ---
/** Your presence goes out at most this often while it changes... */
const PRESENCE_SEND_MS = 100;
/** ...and others' ease toward each update at this rate (per second). */
const PRESENCE_EASE_PER_S = 12;
/** A camera glyph is this long next to a player (geometry units, as PLAYER_GEOMETRY_HEIGHT). */
const PRESENCE_CAMERA_LENGTH = 3;
/** Name tags keep one size on screen (their height, in view heights), near or far. */
const PRESENCE_LABEL_HEIGHT = 0.03;

interface RemotePresence {
  presence: LiveMapPresence;
  seeded: boolean;
  /** Eased toward the goal each frame. */
  position: THREE.Vector3;
  target: THREE.Vector3;
  goalPosition: THREE.Vector3;
  goalTarget: THREE.Vector3;
  group: THREE.Group;
  /** Placed and turned as a whole; holds the walker and the camera glyph. */
  body: THREE.Group;
  walker: THREE.Mesh;
  camera: THREE.Mesh;
  cameraGeometry: THREE.BufferGeometry;
  material: THREE.MeshBasicMaterial;
  label: THREE.Sprite;
}

// Someone else in the live session: a capsule in their colour while they
// walk, a camera (a four-sided cone opening toward what it looks at) while
// they orbit, and their name above.
function createRemotePresence(participantId: string, playerGeometry: THREE.BufferGeometry): RemotePresence {
  const material = new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(participantHue(participantId) / 360, 0.8, 0.6), transparent: true, opacity: 0.9 });
  const walker = new THREE.Mesh(playerGeometry, material);
  // Apex at the camera, opening along +z, which lookAt turns toward the target.
  const cameraGeometry = new THREE.ConeGeometry(PRESENCE_CAMERA_LENGTH * 0.45, PRESENCE_CAMERA_LENGTH, 4)
    .rotateX(-Math.PI / 2)
    .translate(0, 0, PRESENCE_CAMERA_LENGTH / 2);
  const camera = new THREE.Mesh(cameraGeometry, material);
  const body = new THREE.Group();
  body.add(walker, camera);
  const label = createLabelSprite(participantLabel(participantId));
  label.material.sizeAttenuation = false;
  label.scale.multiplyScalar(PRESENCE_LABEL_HEIGHT / label.scale.y);
  const group = new THREE.Group();
  group.add(body, label);
  return {
    presence: { ground: "", mode: "camera", position: [0, 0, 0], target: [0, 0, 1] },
    seeded: false,
    position: new THREE.Vector3(),
    target: new THREE.Vector3(),
    goalPosition: new THREE.Vector3(),
    goalTarget: new THREE.Vector3(),
    group,
    body,
    walker,
    camera,
    cameraGeometry,
    material,
    label,
  };
}

export interface LivePresenceOptions {
  scene: THREE.Scene;
  geometries: { player: THREE.BufferGeometry };
  now: () => number;
  requestRender: () => void;
  /** Your camera, or your character while walking; null off the mesh. */
  currentPresence: () => LiveMapPresence | null;
}

export class LivePresence {
  private readonly scene: THREE.Scene;
  private readonly geometries: { player: THREE.BufferGeometry };
  private readonly now: () => number;
  private readonly requestRender: () => void;
  private readonly currentPresence: () => LiveMapPresence | null;
  private disposed = false;
  private onPresence: ((presence: LiveMapPresence | null) => void) | null = null;
  private lastPresence: { json: string; at: number } | null = null;
  private presenceTimer = 0;
  private readonly remotePresences = new Map<string, RemotePresence>();
  private presenceAt = 0;

  constructor(options: LivePresenceOptions) {
    this.scene = options.scene;
    this.geometries = options.geometries;
    this.now = options.now;
    this.requestRender = options.requestRender;
    this.currentPresence = options.currentPresence;
  }

  /** Called with where you are on the mesh (throttled), for a live session; null once you are not. */
  setOnPresence(callback: ((presence: LiveMapPresence | null) => void) | null) {
    this.onPresence = callback;
    this.lastPresence = null;
    if (callback) this.emitPresence(true);
  }

  /**
   * Sends your presence when it changed (at most every PRESENCE_SEND_MS, the
   * last change always going out), or regardless with `force` (the heartbeat).
   */
  emitPresence(force = false) {
    const send = this.onPresence;
    if (!send || this.disposed) return;
    const presence = this.currentPresence();
    const json = JSON.stringify(presence);
    const last = this.lastPresence;
    const now = this.now();
    if (!force && last) {
      if (json === last.json) return;
      const wait = PRESENCE_SEND_MS - (now - last.at);
      if (wait > 0) {
        if (!this.presenceTimer) {
          this.presenceTimer = window.setTimeout(() => {
            this.presenceTimer = 0;
            this.emitPresence();
          }, wait);
        }
        return;
      }
    }
    clearTimeout(this.presenceTimer);
    this.presenceTimer = 0;
    this.lastPresence = { json, at: now };
    send(presence);
  }

  /** Everyone else's presence in the live session, drawn where it is on the same mesh. */
  setRemotePresences(presences: ReadonlyMap<string, LiveMapPresence>) {
    for (const [participantId, object] of this.remotePresences) {
      if (presences.has(participantId)) continue;
      this.disposeRemotePresence(object);
      this.remotePresences.delete(participantId);
    }
    for (const [participantId, presence] of presences) {
      let object = this.remotePresences.get(participantId);
      if (!object) {
        object = createRemotePresence(participantId, this.geometries.player);
        this.scene.add(object.group);
        this.remotePresences.set(participantId, object);
      }
      // A change of mode jumps rather than gliding from the sky to the floor.
      const jump = !object.seeded || object.presence.mode !== presence.mode;
      object.presence = presence;
      object.goalPosition.fromArray(presence.position);
      object.goalTarget.fromArray(presence.target);
      if (jump) {
        object.position.copy(object.goalPosition);
        object.target.copy(object.goalTarget);
        object.seeded = true;
      }
    }
    this.requestRender();
  }

  // Eases others' presences toward their latest update; true while any moves.
  updateRemotePresences(now: number, mesh: { url: string } | null, unitScale: number): boolean {
    const dt = clockStepSeconds(now, this.presenceAt);
    this.presenceAt = now;
    if (this.remotePresences.size === 0) return false;
    const ease = 1 - Math.exp(-PRESENCE_EASE_PER_S * dt);
    let moving = false;
    for (const object of this.remotePresences.values()) {
      const shown = mesh !== null && object.presence.ground === mesh.url;
      object.group.visible = shown;
      if (!shown) continue;
      object.position.lerp(object.goalPosition, ease);
      object.target.lerp(object.goalTarget, ease);
      const settle = 1e-4;
      if (object.position.distanceToSquared(object.goalPosition) > settle * settle
        || object.target.distanceToSquared(object.goalTarget) > settle * settle) {
        moving = true;
      }
      const walking = object.presence.mode === "walk";
      object.walker.visible = walking;
      object.camera.visible = !walking;
      object.body.position.copy(object.position);
      object.body.scale.setScalar(unitScale);
      if (walking) {
        object.body.rotation.set(0, Math.atan2(object.position.x - object.target.x, object.position.z - object.target.z), 0);
      } else {
        object.body.lookAt(object.target);
      }
      const labelHeight = walking ? PLAYER_GEOMETRY_HEIGHT + 0.2 : 1.6;
      object.label.position.set(object.position.x, object.position.y + labelHeight * unitScale, object.position.z);
    }
    return moving;
  }

  private disposeRemotePresence(object: RemotePresence) {
    this.scene.remove(object.group);
    object.material.dispose();
    object.cameraGeometry.dispose();
    object.label.material.map?.dispose();
    object.label.material.dispose();
  }

  /** The render loop slept: the next frame starts the easing clock again (MapScene3D.restartFrameClocks). */
  restartClock() {
    this.presenceAt = 0;
  }

  dispose() {
    this.disposed = true;
    clearTimeout(this.presenceTimer);
    for (const presence of this.remotePresences.values()) this.disposeRemotePresence(presence);
    this.remotePresences.clear();
  }
}
