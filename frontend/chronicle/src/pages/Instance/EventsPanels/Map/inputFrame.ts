/**
 * One input model for the 3D replay (chronicle-1982): the held keys, the
 * mouse drag, the Shift modifier and the mobile pad and stick, gathered by
 * MapScene3D's event handlers into MapInputState, and read by walk mode and
 * the free cam once per frame as an InputFrame. Neither mode reads raw events
 * or the held keys itself.
 *
 * Mouse look and the wheel act when the event arrives (as they always have:
 * the free cam's constraint and pitch clamp run per event, and pointer lock
 * can only be asked for inside one); their deltas come from MouseDrag, the one
 * drag and pointer-lock path. Everything continuous is in the InputFrame.
 */
import { UNIT_CLICK_SLOP_PX } from "./controlProfile";
import { IDLE_MOBILE_MAP_INPUT, rightDragWalkAxes, setWalkMouseButton, walkMouseControl, type MapControlAction, type MobileMapInput } from "./mapControls";

/** What the controls ask for this frame, the same for walk mode and the free cam. */
export interface InputFrame {
  /** -1…1: W/S, both mouse buttons, the move pad. */
  forward: number;
  /** -1…1 (+ is right): strafe keys (A/D while right-dragging, or with A/D strafe), the move pad. */
  strafe: number;
  /** -1…1 (+ is left): A/D unless right-dragging, the look stick (right turns clockwise). */
  turn: number;
  /** -1…1: Space/Z and the jump button, for the free cam's pivot. */
  vertical: number;
  /** Space or the jump button is held: walk mode jumps (and keeps flying up). */
  jump: boolean;
  /** Z is held: walk mode flies down while airborne. */
  descend: boolean;
  /** -1…1: the look stick's pitch (up raises the camera). */
  pitch: number;
  /** A drag that is looking (any held button, once engaged). */
  looking: boolean;
  /** Right-drag: the character (walk) or the travel (free cam) follows the camera. */
  steering: boolean;
  /** Both buttons: move forward. */
  movingForward: boolean;
  /** A mouse or touch drag is held at all (walk mode stops trailing the camera while one is). */
  dragging: boolean;
  /** Shift: the free cam travels faster. */
  fast: boolean;
  /** Any continuous input at all (a held key, the pad or stick, both buttons): the free cam moves. */
  active: boolean;
}

export function createInputFrame(): InputFrame {
  return {
    forward: 0, strafe: 0, turn: 0, vertical: 0, jump: false, descend: false, pitch: 0,
    looking: false, steering: false, movingForward: false, dragging: false, fast: false, active: false,
  };
}

/**
 * Whether the mobile pad, stick or jump button is giving input. The idle
 * input is no input: `jump: false` does not count (it used to, so an
 * interactive scene's render loop never went idle, chronicle-1982).
 */
export function mobileInputActive(input: MobileMapInput): boolean {
  return input.jump || input.forward !== 0 || input.strafe !== 0 || input.turn !== 0 || input.pitch !== 0;
}

/**
 * One mouse (or walk-mode touch) drag: the held buttons (`PointerEvent.button`
 * bits, tracked here rather than read from `event.buttons`), where the
 * pointer last was, and whether it has started looking. Walk mode looks from
 * the press; the free cam once the pointer passes the click slop, or at once
 * with both buttons (MapScene3D decides when to engage).
 */
export class MouseDrag {
  buttons = 0;
  x = 0;
  y = 0;
  engaged = false;
  /** The last look delta (pixels), from `look`. */
  dx = 0;
  dy = 0;

  /** A button went down at (x, y): holds it and re-anchors there. */
  press(button: number, x: number, y: number) {
    this.buttons = setWalkMouseButton(this.buttons, button, true);
    this.x = x;
    this.y = y;
  }

  /** A button came up; returns the buttons still held. */
  release(button: number): number {
    this.buttons = setWalkMouseButton(this.buttons, button, false);
    return this.buttons;
  }

  /** Whether the pointer at (x, y) is further than the click slop from the anchor. */
  pastSlop(x: number, y: number): boolean {
    return Math.hypot(x - this.x, y - this.y) > UNIT_CLICK_SLOP_PX;
  }

  /** Moves the anchor to (x, y). */
  anchor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  /**
   * The look delta of a move to (clientX, clientY), into `dx`/`dy`, and
   * re-anchors there. With the cursor locked (hidden), clientX/Y stand still
   * and only movementX/Y report the drag.
   */
  look(event: { clientX: number; clientY: number; movementX: number; movementY: number }, locked: boolean) {
    this.dx = locked ? event.movementX : event.clientX - this.x;
    this.dy = locked ? event.movementY : event.clientY - this.y;
    this.x = event.clientX;
    this.y = event.clientY;
  }
}

/** The controls' live state, fed by the scene's event handlers. */
export class MapInputState {
  readonly held = new Set<MapControlAction>();
  fast = false;
  mobile: MobileMapInput = IDLE_MOBILE_MAP_INPUT;
  drag: MouseDrag | null = null;
  private readonly out = createInputFrame();

  /** This frame's input (one object, refilled on every call). */
  frame(): InputFrame {
    return buildInputFrame(this.held, this.fast, this.mobile, this.drag, this.out);
  }
}

/**
 * Assembles the frame: keys, the engaged drag's buttons and the mobile pad
 * and stick, each axis clamped to -1…1. Holding right-click turns A/D into
 * the matching strafe (WoW), whatever the A/D strafe setting.
 */
export function buildInputFrame(
  held: ReadonlySet<MapControlAction>,
  fast: boolean,
  mobile: MobileMapInput,
  drag: MouseDrag | null,
  out: InputFrame = createInputFrame(),
): InputFrame {
  const axis = (positive: MapControlAction, negative: MapControlAction) => (held.has(positive) ? 1 : 0) - (held.has(negative) ? 1 : 0);
  const clamp = (value: number) => Math.max(-1, Math.min(1, value));
  const mouse = walkMouseControl(drag?.engaged ? drag.buttons : 0);
  const axes = rightDragWalkAxes(axis("turn_left", "turn_right"), axis("strafe_right", "strafe_left"), mouse.steering);
  out.turn = clamp(axes.turn - mobile.turn);
  out.strafe = clamp(axes.strafe + mobile.strafe);
  out.forward = clamp(axis("forward", "back") + (mouse.movingForward ? 1 : 0) + mobile.forward);
  out.vertical = clamp(axis("up", "down") + (mobile.jump ? 1 : 0));
  out.jump = held.has("up") || mobile.jump;
  out.descend = held.has("down");
  out.pitch = mobile.pitch;
  out.looking = mouse.looking;
  out.steering = mouse.steering;
  out.movingForward = mouse.movingForward;
  out.dragging = drag !== null;
  out.fast = fast;
  out.active = held.size > 0 || mobileInputActive(mobile) || mouse.movingForward;
  return out;
}
