import { ArrowUpFromLine, Footprints, MoveDown, MoveLeft, MoveRight, MoveUp, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { IDLE_MOBILE_MAP_INPUT, mobileJoystickAxis, type MobileMapInput } from "./mapControls";

interface MobileMapControlsProps {
  walking: boolean;
  canWalk: boolean;
  onWalkingChange: (walking: boolean) => void;
  onInputChange: (input: MobileMapInput) => void;
  onClose: () => void;
}

type MoveDirection = "forward" | "back" | "left" | "right";

const controlButtonClass = "grid size-12 touch-none select-none place-items-center rounded-xl border border-white/20 bg-black/55 text-white shadow-[0_8px_24px_rgba(0,0,0,.45)] backdrop-blur-sm active:scale-95 active:bg-amber-300 active:text-black";

export function MobileMapControls({ walking, canWalk, onWalkingChange, onInputChange, onClose }: MobileMapControlsProps) {
  const [moves, setMoves] = useState<ReadonlySet<MoveDirection>>(() => new Set());
  const [look, setLook] = useState({ x: 0, y: 0 });
  const [jumping, setJumping] = useState(false);
  const joystickRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onInputChange({
      forward: (moves.has("forward") ? 1 : 0) - (moves.has("back") ? 1 : 0),
      strafe: (moves.has("right") ? 1 : 0) - (moves.has("left") ? 1 : 0),
      turn: mobileJoystickAxis(look.x),
      pitch: mobileJoystickAxis(look.y),
      jump: walking && jumping,
    });
  }, [jumping, look, moves, onInputChange, walking]);

  useEffect(() => () => onInputChange(IDLE_MOBILE_MAP_INPUT), [onInputChange]);

  const pressMove = (direction: MoveDirection) => (event: React.PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    setMoves((current) => new Set(current).add(direction));
  };
  const releaseMove = (direction: MoveDirection) => () => setMoves((current) => {
    const next = new Set(current);
    next.delete(direction);
    return next;
  });

  const updateJoystick = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = joystickRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const radius = Math.max(1, Math.min(bounds.width, bounds.height) / 2);
    let x = (event.clientX - (bounds.left + bounds.width / 2)) / radius;
    let y = (event.clientY - (bounds.top + bounds.height / 2)) / radius;
    const length = Math.hypot(x, y);
    if (length > 1) {
      x /= length;
      y /= length;
    }
    setLook({ x, y });
  }, []);

  const releaseJoystick = () => setLook({ x: 0, y: 0 });

  return (
    <div className="pointer-events-none absolute inset-0 z-50 touch-none select-none" aria-label="Mobile 3D controls">
      <div className="pointer-events-auto absolute left-[max(0.75rem,env(safe-area-inset-left))] top-[max(0.75rem,env(safe-area-inset-top))] flex items-center gap-2">
        <button type="button" onClick={onClose} aria-label="Close 3D world" className={controlButtonClass}>
          <X className="size-5" />
        </button>
        <button
          type="button"
          disabled={!canWalk}
          aria-pressed={walking}
          onClick={() => {
            if (walking) setJumping(false);
            onWalkingChange(!walking);
          }}
          className={cn(controlButtonClass, "w-auto gap-2 px-4 text-xs font-semibold uppercase tracking-[0.16em] disabled:opacity-40", walking && "border-amber-200/70 bg-amber-300 text-black")}
        >
          <Footprints className="size-5" />
          {walking ? "Walking" : "Drop in"}
        </button>
      </div>

      <div className="pointer-events-auto absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-[max(1rem,env(safe-area-inset-left))] grid grid-cols-3 grid-rows-3 gap-1" aria-label="Movement pad">
        <MoveButton direction="forward" label="Move forward" className="col-start-2 row-start-1" icon={<MoveUp />} onDown={pressMove} onUp={releaseMove} />
        <MoveButton direction="left" label="Strafe left" className="col-start-1 row-start-2" icon={<MoveLeft />} onDown={pressMove} onUp={releaseMove} />
        <div className="col-start-2 row-start-2 grid size-12 place-items-center rounded-full border border-white/10 bg-black/25">
          <span className="size-2 rounded-full bg-amber-300/80" />
        </div>
        <MoveButton direction="right" label="Strafe right" className="col-start-3 row-start-2" icon={<MoveRight />} onDown={pressMove} onUp={releaseMove} />
        <MoveButton direction="back" label="Move back" className="col-start-2 row-start-3" icon={<MoveDown />} onDown={pressMove} onUp={releaseMove} />
      </div>

      <button
        type="button"
        disabled={!walking}
        aria-label="Jump"
        className={cn(
          controlButtonClass,
          "pointer-events-auto absolute bottom-[calc(max(1rem,env(safe-area-inset-bottom))+9rem)] right-[max(3rem,env(safe-area-inset-right))] size-16 rounded-full border-amber-100/35 bg-amber-300/90 font-black uppercase tracking-wider text-black disabled:border-white/15 disabled:bg-black/45 disabled:text-white/35",
          walking && jumping && "scale-95 bg-amber-100",
        )}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          setJumping(true);
        }}
        onPointerUp={() => setJumping(false)}
        onPointerCancel={() => setJumping(false)}
        onLostPointerCapture={() => setJumping(false)}
      >
        <ArrowUpFromLine className="size-6" />
        <span className="sr-only">Jump</span>
      </button>

      <div
        ref={joystickRef}
        role="application"
        aria-label="Look joystick"
        className="pointer-events-auto absolute bottom-[max(1rem,env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))] size-32 touch-none rounded-full border border-white/20 bg-black/45 shadow-[inset_0_0_0_1px_rgba(255,255,255,.05),0_10px_32px_rgba(0,0,0,.5)] backdrop-blur-sm"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          updateJoystick(event);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) updateJoystick(event);
        }}
        onPointerUp={releaseJoystick}
        onPointerCancel={releaseJoystick}
      >
        <div className="pointer-events-none absolute inset-3 rounded-full border border-dashed border-white/15" />
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 grid size-14 place-items-center rounded-full border border-amber-100/35 bg-amber-300/85 text-black shadow-[0_6px_20px_rgba(0,0,0,.45)]"
          style={{ transform: `translate(calc(-50% + ${look.x * 34}px), calc(-50% + ${look.y * 34}px))` }}
        >
          <span className="size-2 rounded-full bg-black/60" />
        </div>
      </div>
    </div>
  );
}

function MoveButton({ direction, label, className, icon, onDown, onUp }: {
  direction: MoveDirection;
  label: string;
  className: string;
  icon: React.ReactNode;
  onDown: (direction: MoveDirection) => (event: React.PointerEvent<HTMLButtonElement>) => void;
  onUp: (direction: MoveDirection) => () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(controlButtonClass, className)}
      onPointerDown={onDown(direction)}
      onPointerUp={onUp(direction)}
      onPointerCancel={onUp(direction)}
      onLostPointerCapture={onUp(direction)}
    >
      {icon}
    </button>
  );
}
