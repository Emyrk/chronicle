import { useEffect, useRef, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { X } from "lucide-react";
import { useSiteConfig } from "@/api/queries";
import { ARRIVAL_PARAM, chooserURL, parseArrival, type ChooseArrival } from "./chooseArrival";

const AUTO_HIDE_MS = 6_000;

const HEADINGS: Record<ChooseArrival, string> = {
  saved: "Taken here because of your saved choice",
  remembered: "Choice saved — future links will open here",
  picked: "Opened on your chosen community",
};

/** Label of the link back to the chooser. */
const ACTION_LABELS: Record<ChooseArrival, string> = {
  saved: "Change choice",
  remembered: "Change",
  picked: "Pick a different community",
};

const PRIMARY_ACTION_CLASSES =
  "rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90";
const SECONDARY_ACTION_CLASSES =
  "rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";

/**
 * Explains a redirect from the community chooser (choose.<primary-domain>):
 * animates the hop from the chooser to this community and offers links back
 * to change or forget the saved choice. The choice lives in the chooser
 * origin's localStorage, so changing it has to happen there.
 */
export function ChooseArrivalNotice() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const { data: siteConfig } = useSiteConfig();
  // Captured once so stripping the param below doesn't hide the notice.
  const [arrival] = useState(() => parseArrival(searchParams.get(ARRIVAL_PARAM)));
  const [visible, setVisible] = useState(arrival !== null);
  const [paused, setPaused] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // Keep the param out of the address bar so a copied URL doesn't replay it.
  useEffect(() => {
    if (!searchParams.has(ARRIVAL_PARAM)) return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete(ARRIVAL_PARAM);
        return next;
      },
      { replace: true },
    );
  }, [searchParams, setSearchParams]);

  const chooseOrigin = siteConfig?.choose_url;
  if (!visible || !arrival || !siteConfig || !chooseOrigin) return null;

  const tenant = siteConfig.tenant;
  const branding = tenant?.branding ?? siteConfig.branding;
  const destName = branding?.display_name || tenant?.name || "Chronicle";
  const destLogo = branding?.square_logo || "/c/chronicle/ChronicleIconSquare.webp";
  const chooseHost = new URL(chooseOrigin).host;
  const manageHref = chooserURL(chooseOrigin, location, "manage");
  const forgetHref = chooserURL(chooseOrigin, location, "forget");
  const hasSavedChoice = arrival !== "picked";

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center px-4">
      <div
        ref={cardRef}
        role="status"
        className="pointer-events-auto relative w-full max-w-md overflow-hidden rounded-xl border border-border bg-card/95 p-4 shadow-2xl backdrop-blur animate-choose-drop"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={(e) => {
          if (!cardRef.current?.contains(e.relatedTarget as Node | null)) setPaused(false);
        }}
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="truncate rounded-full border border-border px-2 py-0.5 font-mono">{chooseHost}</span>
              <span aria-hidden="true" className="relative h-px min-w-8 flex-1 bg-border">
                <span className="animate-choose-travel absolute -top-1 h-2 w-2 rounded-full bg-primary" />
              </span>
              <span className="animate-choose-arrive flex shrink-0 items-center gap-1.5 font-medium text-foreground">
                <img src={destLogo} alt="" className="h-5 w-5 rounded object-contain" />
                <span className="max-w-32 truncate">{destName}</span>
              </span>
            </div>
            <p className="mt-3 text-sm font-semibold text-foreground">{HEADINGS[arrival]}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {hasSavedChoice
                ? `Links from ${chooseHost} now open on ${destName} in this browser.`
                : `This link came from ${chooseHost}.`}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <a href={manageHref} className={PRIMARY_ACTION_CLASSES}>
                {ACTION_LABELS[arrival]}
              </a>
              {arrival === "saved" && (
                <a href={forgetHref} className={SECONDARY_ACTION_CLASSES}>
                  Forget choice
                </a>
              )}
              {/* They just saved it, so offering to forget it would be odd. */}
              {arrival === "remembered" && (
                <button type="button" onClick={() => setVisible(false)} className={SECONDARY_ACTION_CLASSES}>
                  Dismiss
                </button>
              )}
            </div>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={() => setVisible(false)}
            className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {/* The countdown bar drives auto-hide, so pausing it on hover/focus
            keeps the visual and the timer in sync. */}
        <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1 bg-border/60">
          <div
            className="animate-choose-countdown h-full origin-left bg-primary"
            style={{
              animationDuration: `${AUTO_HIDE_MS}ms`,
              animationPlayState: paused ? "paused" : "running",
            }}
            onAnimationEnd={() => setVisible(false)}
          />
        </div>
      </div>
    </div>
  );
}
