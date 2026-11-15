/**
 * The little of the browser MapScene3D touches, for Node: a window and a
 * document (EventTargets that count their listeners), a container and a
 * canvas with a no-op 2D context, ResizeObserver, requestAnimationFrame on a
 * manual clock, and pointer lock. Installed on globalThis by installFakeDom
 * and removed again by its `uninstall`.
 *
 * Only what the scene and OrbitControls read is here. If a change to the
 * scene reaches for more of the DOM, add it here rather than in a test.
 */

type ListenerKey = string;

function listenerKey(type: string, options?: boolean | AddEventListenerOptions | EventListenerOptions): ListenerKey {
  const capture = typeof options === "boolean" ? options : Boolean(options?.capture);
  return `${type}|${capture}`;
}

/** An EventTarget that knows which listeners are attached (for the dispose tests). */
export class TrackedTarget extends EventTarget {
  private readonly listening = new Map<ListenerKey, Set<unknown>>();

  override addEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) {
    if (listener) {
      const key = listenerKey(type, options);
      let set = this.listening.get(key);
      if (!set) this.listening.set(key, (set = new Set()));
      set.add(listener);
    }
    super.addEventListener(type, listener, options);
  }

  override removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions) {
    if (listener) this.listening.get(listenerKey(type, options))?.delete(listener);
    super.removeEventListener(type, listener, options);
  }

  /** The attached listeners, as "type|capture" with a count, e.g. { "keydown|true": 1 }. */
  listeners(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [key, set] of this.listening) if (set.size > 0) result[key] = set.size;
    return result;
  }

  listenerCount(): number {
    let count = 0;
    for (const set of this.listening.values()) count += set.size;
    return count;
  }
}

/** A 2D context that accepts every call and draws nothing; measureText is 6 px a character. */
function createFake2dContext(canvas: FakeCanvas): CanvasRenderingContext2D {
  const chain: object = new Proxy(() => chain, {
    get: (_target, prop) => (prop === Symbol.toPrimitive ? () => "" : chain),
    apply: () => chain,
  });
  const values = new Map<PropertyKey, unknown>();
  return new Proxy({} as CanvasRenderingContext2D, {
    get: (_target, prop) => {
      if (prop === "canvas") return canvas;
      if (prop === "measureText") return (text: string) => ({ width: text.length * 6, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 });
      if (prop === "getImageData" || prop === "createImageData") {
        return (...args: number[]) => {
          const width = args.length >= 4 ? args[2] : args[0];
          const height = args.length >= 4 ? args[3] : args[1];
          return { width, height, data: new Uint8ClampedArray(Math.max(0, width * height * 4)) };
        };
      }
      if (values.has(prop)) return values.get(prop);
      // Every other method (fillRect, createRadialGradient().addColorStop, ...) is a no-op.
      return () => chain;
    },
    set: (_target, prop, value) => {
      values.set(prop, value);
      return true;
    },
  });
}

export class FakeElement extends TrackedTarget {
  readonly tagName: string;
  readonly style: Record<string, string> = {};
  readonly children: FakeElement[] = [];
  parentNode: FakeElement | null = null;
  clientWidth = 0;
  clientHeight = 0;
  isContentEditable = false;
  readonly ownerDocument: FakeDocument;
  constructor(tagName: string, ownerDocument: FakeDocument) {
    super();
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
  }
  appendChild<T extends FakeElement>(child: T): T {
    child.parentNode?.removeChild(child);
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  removeChild<T extends FakeElement>(child: T): T {
    const index = this.children.indexOf(child);
    if (index >= 0) this.children.splice(index, 1);
    child.parentNode = null;
    return child;
  }
  remove() {
    this.parentNode?.removeChild(this);
  }
  getRootNode(): FakeDocument {
    return this.ownerDocument;
  }
  getBoundingClientRect() {
    const width = this.parentNode?.clientWidth ?? this.clientWidth;
    const height = this.parentNode?.clientHeight ?? this.clientHeight;
    return { left: 0, top: 0, right: width, bottom: height, x: 0, y: 0, width, height, toJSON: () => ({}) };
  }
}

export class FakeCanvas extends FakeElement {
  width = 300;
  height = 150;
  private context: CanvasRenderingContext2D | null = null;
  readonly pointerCaptures = new Set<number>();
  pointerLockRequests = 0;
  constructor(ownerDocument: FakeDocument) {
    super("canvas", ownerDocument);
  }
  getContext(kind: string): CanvasRenderingContext2D | null {
    if (kind !== "2d") return null;
    this.context ??= createFake2dContext(this);
    return this.context;
  }
  setPointerCapture(pointerId: number) {
    this.pointerCaptures.add(pointerId);
  }
  releasePointerCapture(pointerId: number) {
    this.pointerCaptures.delete(pointerId);
  }
  hasPointerCapture(pointerId: number) {
    return this.pointerCaptures.has(pointerId);
  }
  /** Counted, never granted: the scene then reads clientX/Y deltas, as when a browser refuses the lock. */
  requestPointerLock(): Promise<void> {
    this.pointerLockRequests++;
    if (this.ownerDocument.grantPointerLock) this.ownerDocument.pointerLockElement = this;
    return Promise.resolve();
  }
}

export class FakeDocument extends TrackedTarget {
  pointerLockElement: FakeElement | null = null;
  /** Set to make requestPointerLock lock (then drags read movementX/Y). */
  grantPointerLock = false;
  pointerLockExits = 0;
  readonly body: FakeElement;
  readonly defaultView: FakeWindow;
  constructor(defaultView: FakeWindow) {
    super();
    this.defaultView = defaultView;
    this.body = new FakeElement("body", this);
  }
  createElement(tag: string): FakeElement {
    return tag.toLowerCase() === "canvas" ? new FakeCanvas(this) : new FakeElement(tag, this);
  }
  exitPointerLock() {
    this.pointerLockExits++;
    this.pointerLockElement = null;
  }
}

export class FakeWindow extends TrackedTarget {
  devicePixelRatio = 1;
  document!: FakeDocument;
  // Read at call time so vi.useFakeTimers applies to the scene's window.setTimeout.
  setTimeout(handler: () => void, ms?: number) {
    return globalThis.setTimeout(handler, ms) as unknown as number;
  }
  clearTimeout(id: number | undefined) {
    globalThis.clearTimeout(id);
  }
}

/** ResizeObserver whose callbacks the test fires (`FakeResizeObserver.fireAll()`). */
export class FakeResizeObserver {
  static readonly live = new Set<FakeResizeObserver>();
  readonly observed = new Set<unknown>();
  private readonly callback: () => void;
  constructor(callback: () => void) {
    this.callback = callback;
    FakeResizeObserver.live.add(this);
  }
  observe(target: unknown) {
    this.observed.add(target);
  }
  unobserve(target: unknown) {
    this.observed.delete(target);
  }
  disconnect() {
    this.observed.clear();
    FakeResizeObserver.live.delete(this);
  }
  static fireAll() {
    for (const observer of FakeResizeObserver.live) if (observer.observed.size > 0) observer.callback();
  }
}

/**
 * The manual clock: what the scene reads as now (its `now` seam) and the
 * timestamp requestAnimationFrame callbacks get.
 */
export class ManualClock {
  // Not 0: the scene uses 0 as "no previous frame" in several places.
  ms = 10_000;
  now = () => this.ms;
  advance(ms: number) {
    this.ms += ms;
  }
}

/** requestAnimationFrame on the manual clock: frames run only when the test steps them. */
export class FrameQueue {
  private nextId = 1;
  private readonly callbacks = new Map<number, FrameRequestCallback>();
  readonly request = (callback: FrameRequestCallback): number => {
    const id = this.nextId++;
    this.callbacks.set(id, callback);
    return id;
  };
  readonly cancel = (id: number) => {
    this.callbacks.delete(id);
  };
  get pending(): number {
    return this.callbacks.size;
  }
  /** Runs the callbacks queued before this call (not ones they queue), at `now`. */
  run(now: number): number {
    const due = [...this.callbacks.values()];
    this.callbacks.clear();
    for (const callback of due) callback(now);
    return due.length;
  }
}

export interface FakeDom {
  window: FakeWindow;
  document: FakeDocument;
  clock: ManualClock;
  frames: FrameQueue;
  uninstall: () => void;
}

const GLOBALS = ["window", "document", "ResizeObserver", "requestAnimationFrame", "cancelAnimationFrame"] as const;

let installed: FakeDom | null = null;

/** Installs the fake browser on globalThis (once; later calls return the same one). */
export function installFakeDom(): FakeDom {
  if (installed) return installed;
  const saved = new Map<string, PropertyDescriptor | undefined>();
  for (const name of GLOBALS) saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  const window = new FakeWindow();
  const document = new FakeDocument(window);
  window.document = document;
  const clock = new ManualClock();
  const frames = new FrameQueue();
  const define = (name: string, value: unknown) => Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  define("window", window);
  define("document", document);
  define("ResizeObserver", FakeResizeObserver);
  define("requestAnimationFrame", frames.request);
  define("cancelAnimationFrame", frames.cancel);
  const dom: FakeDom = {
    window,
    document,
    clock,
    frames,
    uninstall: () => {
      for (const [name, descriptor] of saved) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else delete (globalThis as Record<string, unknown>)[name];
      }
      FakeResizeObserver.live.clear();
      installed = null;
    },
  };
  installed = dom;
  return dom;
}

// --- Events, shaped as the browser sends them ---

export interface PointerInit {
  clientX?: number;
  clientY?: number;
  /** 0 left, 1 middle, 2 right. */
  button?: number;
  buttons?: number;
  pointerId?: number;
  pointerType?: "mouse" | "touch" | "pen";
  movementX?: number;
  movementY?: number;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}

export class FakePointerEvent extends Event {
  readonly clientX: number;
  readonly clientY: number;
  readonly pageX: number;
  readonly pageY: number;
  readonly button: number;
  readonly buttons: number;
  readonly pointerId: number;
  readonly pointerType: string;
  readonly movementX: number;
  readonly movementY: number;
  readonly shiftKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly isPrimary = true;
  constructor(type: string, init: PointerInit = {}) {
    super(type, { bubbles: true, cancelable: true });
    this.clientX = init.clientX ?? 0;
    this.clientY = init.clientY ?? 0;
    this.pageX = this.clientX;
    this.pageY = this.clientY;
    this.button = init.button ?? 0;
    this.buttons = init.buttons ?? 0;
    this.pointerId = init.pointerId ?? 1;
    this.pointerType = init.pointerType ?? "mouse";
    this.movementX = init.movementX ?? 0;
    this.movementY = init.movementY ?? 0;
    this.shiftKey = init.shiftKey ?? false;
    this.ctrlKey = init.ctrlKey ?? false;
    this.metaKey = init.metaKey ?? false;
    this.altKey = init.altKey ?? false;
  }
}

export class FakeWheelEvent extends FakePointerEvent {
  readonly deltaX = 0;
  readonly deltaY: number;
  readonly deltaZ = 0;
  readonly deltaMode = 0;
  constructor(deltaY: number, init: PointerInit = {}) {
    super("wheel", init);
    this.deltaY = deltaY;
  }
}

export interface KeyInit {
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  repeat?: boolean;
  /** What has focus (an input swallows map keys). */
  target?: FakeElement;
}

export class FakeKeyboardEvent extends Event {
  readonly code: string;
  readonly key: string;
  readonly shiftKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly repeat: boolean;
  private readonly focus: FakeElement | undefined;
  constructor(type: "keydown" | "keyup", code: string, init: KeyInit = {}) {
    super(type, { bubbles: true, cancelable: true });
    this.focus = init.target;
    this.code = code;
    this.key = code === "Escape" ? "Escape" : code === "Space" ? " " : code.replace(/^Key/, "").toLowerCase();
    this.shiftKey = init.shiftKey ?? false;
    this.ctrlKey = init.ctrlKey ?? false;
    this.metaKey = init.metaKey ?? false;
    this.altKey = init.altKey ?? false;
    this.repeat = init.repeat ?? false;
  }
  // The window gets the press, as it bubbles up from what has focus.
  override get target(): EventTarget | null {
    return this.focus ?? super.target;
  }
}
