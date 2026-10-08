import { useState } from "react";
import { ArrowUpRight, X } from "lucide-react";
import { serverCapabilities } from "@/config/serverCapabilities";

const STORAGE_KEY = "wow-forever-announcement-dismissed-v1";
const FOREVER_URL = "https://forever.chronicleclassic.com/";

function shouldShowForeverAnnouncement(flavor: readonly string[]): boolean {
  return !flavor.includes("wow-forever");
}

function wasDismissed(): boolean {
  return typeof window !== "undefined" && localStorage.getItem(STORAGE_KEY) === "true";
}

export function ForeverAnnouncementBanner({
  flavor = serverCapabilities.defaultFlavor,
}: {
  flavor?: readonly string[];
}) {
  const [dismissed, setDismissed] = useState(wasDismissed);

  if (dismissed || !shouldShowForeverAnnouncement(flavor)) {
    return null;
  }

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, "true");
    setDismissed(true);
  };

  return (
    <section
      aria-label="WoW Forever announcement"
      role="status"
      className="relative isolate overflow-hidden border-b border-[#b68a54]/55 bg-[#071a25] px-4 py-3 text-[#f4ead7]"
    >
      <img
        src="/c/forever/wow-forever-hero.jpg"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-20 size-full object-cover object-[center_42%] opacity-35 saturate-[0.85]"
      />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(4,18,27,0.96),rgba(7,35,48,0.86)_55%,rgba(40,28,19,0.9))]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#d7b27a]/80 to-transparent" />

      <div className="relative mx-auto flex w-full max-w-7xl items-center gap-3 pr-8 sm:gap-4 sm:pr-10">
        <img
          src="https://icons.chronicleclassic.com/servers/forever/logo_sq.avif"
          alt=""
          aria-hidden="true"
          className="size-10 shrink-0 rounded-md border border-[#d7b27a]/60 object-contain shadow-[0_0_18px_rgba(47,180,205,0.25)] sm:size-11"
        />
        <div className="min-w-0 flex-1 sm:flex sm:items-baseline sm:gap-2">
          <p className="font-wow font-bold text-[#f7ecd9] [text-shadow:0_1px_2px_rgb(0_0_0/0.8)]">
            WoW Forever is now supported.
          </p>
          <p className="mt-0.5 text-sm text-[#b8d6dc] sm:mt-0">
            Upload logs and explore detailed raid analysis on Chronicle.
          </p>
        </div>
        <a
          href={FOREVER_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="hidden shrink-0 items-center gap-1.5 rounded-md border border-[#d7b27a]/70 bg-[#163e4d]/85 px-3 py-1.5 text-sm font-semibold text-[#f7ecd9] shadow-sm transition-colors hover:border-[#ead09f] hover:bg-[#20596b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#53bdd0] sm:inline-flex"
        >
          Visit WoW Forever
          <ArrowUpRight aria-hidden="true" className="size-3.5 text-[#72d0df]" />
        </a>
        <a
          href={FOREVER_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Visit WoW Forever"
          className="shrink-0 text-[#72d0df] transition-colors hover:text-[#a3e4ee] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#53bdd0] sm:hidden"
        >
          <ArrowUpRight aria-hidden="true" className="size-5" />
        </a>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss WoW Forever announcement"
          className="absolute right-0 top-1/2 -translate-y-1/2 rounded p-1 text-[#b8d6dc] transition-colors hover:bg-[#d7b27a]/15 hover:text-[#f7ecd9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#53bdd0]"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </div>
    </section>
  );
}
