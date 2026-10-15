import { useEffect, useRef, useState } from "react";
import { miniatureThumbnail } from "./miniatureThumbnail";

export function MiniaturePreview({ name, url }: { name: string; url: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === "undefined");
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (!("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      rootMargin: "240px 0px",
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || thumbnail) return;
    let cancelled = false;
    void miniatureThumbnail(url).then((image) => {
      if (!cancelled) setThumbnail(image);
    }).catch((error: unknown) => {
      console.error(`Unable to render miniature preview for ${name}`, error);
      if (!cancelled) setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [name, thumbnail, url, visible]);

  return (
    <div
      ref={hostRef}
      className="relative aspect-[4/3] w-full overflow-hidden bg-[radial-gradient(circle_at_50%_42%,rgba(251,191,36,0.16),transparent_48%),linear-gradient(180deg,#15140f_0%,#090907_100%)]"
      aria-label={`${name} 3D miniature preview`}
      role="img"
    >
      <div className="pointer-events-none absolute inset-x-[18%] bottom-[12%] h-[12%] rounded-[50%] bg-black/60 blur-md" />
      {thumbnail && (
        <img
          src={thumbnail}
          alt=""
          className="absolute inset-0 size-full object-contain"
        />
      )}
      {!thumbnail && !failed && (
        <div className="absolute inset-0 grid place-items-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-amber-200/20 border-t-amber-200/80" />
        </div>
      )}
      {failed && (
        <div className="absolute inset-0 grid place-items-center px-5 text-center font-mono text-[10px] uppercase tracking-[0.14em] text-red-200/65">
          Preview unavailable
        </div>
      )}
    </div>
  );
}
