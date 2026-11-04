import { useMemo } from "react";
import { cn } from "@/lib/utils";

interface MagicLogoProps {
  src?: string;
  alt?: string;
  className?: string;
  children?: React.ReactNode;
}

// Generate stable particle configurations outside render
function generateParticles(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    delay: `-${i * 0.4}s`,
    x: `${10 + Math.random() * 80}%`,
    y: `${20 + Math.random() * 41}%`,
    duration: `${3 + Math.random() * 9}s`,  // Slower
    size: `${2 + Math.random() * 2}px`,     // Smaller (2-4px)
    travel: `-${100 + Math.random() * 100}px`,  // 200-400px range
  }));
}

export function MagicLogo({ src, alt = "", className, children }: MagicLogoProps) {
  // Memoize particle configs so they don't change on re-render
  const particles = useMemo(() => generateParticles(16), []);

  return (
    <div className="relative inline-block overflow-visible">
      {/* Particle container - extends beyond logo bounds */}
      <div className="z-10 magic-particles absolute -inset-8 pointer-events-none overflow-visible">
        {particles.map((particle, i) => (
          <span
            key={i}
            className="particle"
            style={{
              "--travel": particle.travel,  // Add this
              "--delay": particle.delay,
              "--x": particle.x,
              "--y": particle.y,
              "--duration": particle.duration,
              "--size": particle.size,
            } as React.CSSProperties}
          />
        ))}
      </div>

      {/* Glow effect behind logo - organic blobs spread across */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute left-[-13%] top-[8%] w-48 h-24 bg-blue-300/10 blur-3xl [rotate:-15deg] rounded-full animate-pulse [animation-delay:3s] [animation-duration:4.5s]" />
        {/* <div className="absolute right-[10%] top-[20%] w-40 h-18 bg-blue-500/15 rounded-full  animate-pulse [animation-delay:0.5s]" /> */}
        <div className="absolute left-[-17%] top-[16%] w-110 h-55 bg-blue-400/15 blur-2xl rounded-full animate-pulse [animation-delay:0s] [animation-duration:4.5s]" /> 
        <div className="absolute right-[-25%] top-[60%] w-48 h-24 bg-blue-300/10 blur-3xl [rotate:-15deg] rounded-full  animate-pulse [animation-delay:1.5s] [animation-duration:4.5s]" />
        {/* <div className="absolute left-[15%] top-[70%] w-40 h-16 bg-blue-400/15 rounded-full  animate-pulse [animation-delay:0.8s]" /> */}
      </div>

      {/* Logo */}
      {children ? (
        <div className={cn("relative z-10", className)}>{children}</div>
      ) : (
        <img src={src} alt={alt} className={cn("relative z-10", className)} />
      )}
    </div>
  );
}
