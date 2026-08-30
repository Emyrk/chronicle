import { ArrowRight, Heart } from "lucide-react";

export function SupportRibbon() {
  return (
    <a
      href="/support/"
      aria-label="Support Chronicle"
      className="support-ribbon group fixed right-3 top-4 z-40 flex h-[4.5rem] items-center pl-[4.25rem] pr-3 text-left shadow-2xl shadow-black/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:right-5 sm:top-6 sm:h-20 sm:pl-[5.25rem] sm:pr-4"
    >
      <span className="support-ribbon-medallion absolute -left-3 top-1/2 z-10 h-[4.75rem] w-[4.75rem] -translate-y-1/2 rounded-full sm:-left-4 sm:h-[5.75rem] sm:w-[5.75rem]">
        <span className="support-ribbon-coin absolute inset-0">
          <span className="support-ribbon-coin-face support-ribbon-coin-front">
            <span className="support-ribbon-orbit absolute inset-1 rounded-full border border-dashed border-amber-300/35" />
            <img
              src="/chronicle-logo.png"
              alt=""
              aria-hidden="true"
              className="h-[4.15rem] w-[4.15rem] rounded-full object-contain sm:h-20 sm:w-20"
            />
          </span>
          <span className="support-ribbon-coin-face support-ribbon-coin-back">
            <span className="support-ribbon-orbit absolute inset-1 rounded-full border border-dashed border-amber-200/40" />
            <Heart
              aria-hidden="true"
              className="h-8 w-8 fill-amber-300/25 text-amber-200 sm:h-10 sm:w-10"
              strokeWidth={1.75}
            />
          </span>
        </span>
      </span>

      <span className="relative z-10 min-w-0">
        <span className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.2em] text-amber-300/85 sm:text-[10px]">
          <Heart aria-hidden="true" className="h-3 w-3 fill-current" />
          Keep it running
        </span>
        <span className="mt-0.5 flex items-center gap-2 whitespace-nowrap text-sm font-bold tracking-wide text-white sm:text-base">
          Support Chronicle
          <ArrowRight aria-hidden="true" className="h-3.5 w-3.5 text-amber-300 transition-transform group-hover:translate-x-1 group-focus-visible:translate-x-1" />
        </span>
        <span className="mt-0.5 hidden text-[10px] text-slate-400 sm:block">
          Help cover hosting &amp; development
        </span>
      </span>
    </a>
  );
}
