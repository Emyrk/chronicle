import { compassRotationDegrees } from "./mapCompassModel";

interface MapCompassProps {
  /** Clockwise screen rotation of world north, in radians. */
  northRadians?: number;
}

/** A compact north/south reference for both fixed 2D maps and orbiting 3D views. */
export function MapCompass({ northRadians = 0 }: MapCompassProps) {
  const rotation = compassRotationDegrees(northRadians);
  return (
    <div
      role="img"
      aria-label="Map compass. Red points north and white points south."
      title="Red: north · White: south"
      className="pointer-events-none absolute bottom-3 right-3 z-30 flex size-14 items-center justify-center rounded-full border border-white/25 bg-black/75 shadow-[0_3px_14px_rgba(0,0,0,.65)] backdrop-blur-sm"
    >
      <span className="absolute inset-1 rounded-full border border-white/10" />
      <span className="absolute left-1/2 top-1 h-1.5 w-px -translate-x-1/2 bg-white/45" />
      <span className="absolute bottom-1 left-1/2 h-1.5 w-px -translate-x-1/2 bg-white/45" />
      <span className="absolute left-1 top-1/2 h-px w-1.5 -translate-y-1/2 bg-white/30" />
      <span className="absolute right-1 top-1/2 h-px w-1.5 -translate-y-1/2 bg-white/30" />
      <div
        className="relative size-10 transition-transform duration-100 ease-out"
        style={{ transform: `rotate(${rotation}deg)` }}
      >
        <span className="absolute left-1/2 top-0 -translate-x-1/2 text-[9px] font-black leading-none text-red-400 drop-shadow-[0_1px_2px_black]">N</span>
        <span className="absolute bottom-0 left-1/2 -translate-x-1/2 text-[8px] font-bold leading-none text-white/80 drop-shadow-[0_1px_2px_black]">S</span>
        <svg viewBox="0 0 40 40" className="absolute inset-0 size-full" aria-hidden="true">
          <path d="M20 7 L24 20 L20 18 L16 20 Z" fill="#f87171" stroke="rgba(0,0,0,.8)" strokeWidth="1" />
          <path d="M20 33 L16 20 L20 22 L24 20 Z" fill="rgba(255,255,255,.82)" stroke="rgba(0,0,0,.8)" strokeWidth="1" />
          <circle cx="20" cy="20" r="2.25" fill="#11100d" stroke="rgba(255,255,255,.8)" strokeWidth="1" />
        </svg>
      </div>
    </div>
  );
}
