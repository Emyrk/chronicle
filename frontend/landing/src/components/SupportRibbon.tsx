import { Heart } from "lucide-react";

export function SupportRibbon() {
  return (
    <a
      href="/support/"
      aria-label="Support Chronicle"
      className="support-ribbon group fixed right-0 top-5 z-40 flex h-16 items-center gap-2 pl-5 pr-3 text-left text-sky-100 shadow-2xl shadow-black/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:top-7"
    >
      <span className="relative z-10 hidden min-w-0 sm:block">
        <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-300/80">
          <Heart aria-hidden="true" className="h-3 w-3 fill-current" />
          Keep it running
        </span>
        <span className="mt-0.5 block whitespace-nowrap text-sm font-bold tracking-wide text-white">
          Support Chronicle
        </span>
      </span>

      <span className="support-ribbon-orbit relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-sky-200/40 bg-slate-950/90 shadow-lg shadow-sky-400/20 sm:h-14 sm:w-14">
        <span className="absolute inset-1 rounded-full border border-dashed border-sky-300/30" />
        <img
          src="/chronicle-logo.png"
          alt=""
          aria-hidden="true"
          className="support-ribbon-logo h-9 w-9 object-contain sm:h-10 sm:w-10"
        />
      </span>
    </a>
  );
}
