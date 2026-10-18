import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { REPLAY_TOGGLE_EVENT, type ReplayToggle } from "./replayToggleKey";

const FLASH_MS = 650;

/**
 * A big play or pause icon that pops in the middle of the screen and fades
 * when X toggles the replay, like a video player's. Mount once per page.
 */
export function ReplayToggleFlash() {
  const [flash, setFlash] = useState<{ action: ReplayToggle; id: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let id = 0;
    const handleToggle = (event: Event) => {
      const action = (event as CustomEvent<ReplayToggle>).detail;
      if (action === "play" || action === "pause") setFlash({ action, id: ++id });
    };
    window.addEventListener(REPLAY_TOGGLE_EVENT, handleToggle);
    return () => window.removeEventListener(REPLAY_TOGGLE_EVENT, handleToggle);
  }, []);

  // Restarted on every press, so quick presses each flash.
  useEffect(() => {
    if (!flash || !ref.current) return;
    const animation = ref.current.animate(
      [
        { opacity: 0.95, transform: "scale(0.85)" },
        { opacity: 0.95, transform: "scale(1)", offset: 0.25 },
        { opacity: 0, transform: "scale(1.35)" },
      ],
      { duration: FLASH_MS, easing: "ease-out", fill: "forwards" },
    );
    animation.onfinish = () => setFlash((current) => (current?.id === flash.id ? null : current));
    return () => animation.cancel();
  }, [flash]);

  if (!flash) return null;
  const Icon = flash.action === "play" ? Play : Pause;
  return (
    <div className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center" aria-hidden>
      <div ref={ref} className="flex h-24 w-24 items-center justify-center rounded-full bg-black/65 text-white shadow-2xl backdrop-blur-sm">
        <Icon className="h-11 w-11" fill="currentColor" />
      </div>
    </div>
  );
}
