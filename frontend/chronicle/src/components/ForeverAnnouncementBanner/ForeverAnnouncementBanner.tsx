import { useState } from "react";
import { ArrowUpRight, X } from "lucide-react";
import { SERVER_NAME, serverCapabilities } from "@/config/serverCapabilities";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "wow-forever-announcement-dismissed-v1";
const FOREVER_URL = "https://forever.chronicleclassic.com/";
const FOREVER_ASSETS = "https://icons.chronicleclassic.com/servers/forever";

function trackedForeverURL(source: string): string {
  const url = new URL(FOREVER_URL);
  url.searchParams.set("chr_src", source);
  url.searchParams.set("chr_pos", "announcement_banner");
  url.searchParams.set("chr_cmp", "wow_forever_launch");
  return url.toString();
}

function shouldShowForeverAnnouncement(flavor: readonly string[]): boolean {
  return !flavor.includes("wow-forever");
}

function wasDismissed(): boolean {
  return (
    typeof window !== "undefined" &&
    localStorage.getItem(STORAGE_KEY) === "true"
  );
}

export function ForeverAnnouncementBanner({
  flavor = serverCapabilities.defaultFlavor,
  source = SERVER_NAME,
}: {
  flavor?: readonly string[];
  source?: string;
}) {
  const [dismissed, setDismissed] = useState(wasDismissed);
  const foreverURL = trackedForeverURL(source);

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
      className="relative isolate overflow-hidden bg-[#0d1f3c]"
    >
      <img
        src={`${FOREVER_ASSETS}/background.avif`}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-20 size-full object-cover object-[0%_6%] saturate-[1.25]"
      />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-r from-transparent via-[#0d1f3c]/45 to-[#0d1f3c]/80" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#f0c869]/70 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-[#8a6526] via-[#f0c869] to-[#8a6526]" />

      <div className="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 py-2.5 sm:gap-5">
        <a
          href={foreverURL}
          target="_blank"
          rel="noopener noreferrer"
          tabIndex={-1}
          className="group flex min-w-0 flex-1 items-center gap-3 sm:gap-5"
        >
          <img
            src={`${FOREVER_ASSETS}/logo_wide.webp`}
            alt=""
            className="h-11 w-auto shrink-0 drop-shadow-[0_2px_8px_rgb(0_0_0/0.8)] transition-transform duration-200 group-hover:scale-110 sm:h-14"
          />
          <div className="min-w-0 [text-shadow:0_1px_3px_rgb(0_0_0/0.9)]">
            <p className="flex items-center gap-2 font-semibold leading-tight text-white sm:text-lg">
              <span className="hidden rounded-sm bg-[#f0c869] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#1a1203] [text-shadow:none] sm:inline">
                New
              </span>
              <span className="decoration-white/60 underline-offset-4 group-hover:underline">
                Now supporting WoW Forever
              </span>
            </p>
            <p className="mt-0.5 hidden text-sm text-white/80 md:block">
              Logs, rankings, and replays now live at
              forever.chronicleclassic.com
            </p>
          </div>
        </a>
        <Button asChild size="sm" variant="secondary" className="shadow-[0_2px_8px_rgb(0_0_0/0.45)]">
          <a href={foreverURL} target="_blank" rel="noopener noreferrer">
            <span className="hidden sm:inline">Visit WoW Forever</span>
            <span className="sm:hidden">Visit</span>
            <ArrowUpRight aria-hidden="true" />
          </a>
        </Button>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss WoW Forever announcement"
          className="-mr-1 shrink-0 rounded p-1 text-white/70 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </div>
    </section>
  );
}
