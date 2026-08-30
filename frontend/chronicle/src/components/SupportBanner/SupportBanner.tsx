import { useEffect, useMemo, useState } from "react";
import { Heart, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAuthorizationCheck } from "@/api/queries";

const LAST_SHOWN_KEY = "support-banner-last-shown";

// How often the banner is allowed to reappear once it's been shown. A first
// visit (no stored timestamp) always counts as due. Tune once we've seen how
// this lands — nothing else depends on this number.
const SHOW_INTERVAL_DAYS = 30;
const SHOW_INTERVAL_MS = SHOW_INTERVAL_DAYS * 24 * 60 * 60 * 1000;

const SUPPORT_URL = "https://chronicleclassic.com/support/";

function isDueToShow(): boolean {
  const lastShown = Number(localStorage.getItem(LAST_SHOWN_KEY) ?? 0);
  return Date.now() - lastShown > SHOW_INTERVAL_MS;
}

function markShownNow() {
  localStorage.setItem(LAST_SHOWN_KEY, String(Date.now()));
}

/** Small medallion that flips between the Chronicle logo and a heart. */
function CoinMedallion() {
  return (
    <span
      aria-hidden="true"
      className="relative inline-block h-5 w-5 shrink-0"
      style={{ perspective: "300px" }}
    >
      <span className="support-banner-coin absolute inset-0">
        <span className="support-banner-coin-face support-banner-coin-front">
          <img
            src="/c/chronicle/ChronicleIconSquare.png"
            alt=""
            className="h-full w-full object-contain"
          />
        </span>
        <span className="support-banner-coin-face support-banner-coin-back">
          <Heart className="h-3 w-3 fill-current" />
        </span>
      </span>
    </span>
  );
}

const BAR_BASE_CLASSES =
  "relative flex items-center justify-center gap-2 border-b py-2 px-4 text-center text-sm";
const DISMISS_BASE_CLASSES =
  "absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-muted-foreground hover:text-foreground transition-colors";

const DONATE_BAR_CLASSES = `${BAR_BASE_CLASSES} border-amber-500/30 bg-amber-500/10`;
const DONATE_DISMISS_CLASSES = `${DISMISS_BASE_CLASSES} hover:bg-amber-500/20`;
const DONATE_HEADING_CLASSES = "font-wow font-bold text-amber-600 dark:text-amber-400";
const DONATE_LINK_CLASSES = "underline text-amber-600 dark:text-amber-400 hover:text-amber-500";

const THANKS_BAR_CLASSES = `${BAR_BASE_CLASSES} border-emerald-500/30 bg-emerald-500/10`;
const THANKS_DISMISS_CLASSES = `${DISMISS_BASE_CLASSES} hover:bg-emerald-500/20`;
const THANKS_HEADING_CLASSES = "font-wow font-bold text-emerald-600 dark:text-emerald-400";

/**
 * Site-wide reminder that Chronicle's hosting is donor-funded, shown at most
 * once every SHOW_INTERVAL_DAYS. Whether someone currently holds the
 * "supporter" SpiceDB role is checked before anything else and decides the
 * message — that check trumps the cadence/dismissal state below.
 */
export function SupportBanner() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const authzChecks = useMemo(() => ({ supporter: "chronicle:chronicle#supporter" }), []);
  const { data: authz, isLoading: authzLoading } = useAuthorizationCheck(authzChecks, {
    enabled: isAuthenticated,
  });

  // "pending" = still deciding what (if anything) to show; decided exactly
  // once per session so a later re-render can't flip an already-shown banner
  // back off just because its freshly-recorded timestamp is now "not due".
  const [state, setState] = useState<"pending" | "hidden" | "donate" | "thanks">("pending");

  const stillDeciding = authLoading || (isAuthenticated && authzLoading);

  useEffect(() => {
    if (state !== "pending" || stillDeciding) {
      return;
    }

    if (!isDueToShow()) {
      setState("hidden");
      return;
    }

    const isSupporter = authz?.supporter ?? false;

    markShownNow();
    setState(isSupporter ? "thanks" : "donate");
  }, [state, stillDeciding, authz]);

  if (state === "pending" || state === "hidden") {
    return null;
  }

  const handleDismiss = () => setState("hidden");

  if (state === "thanks") {
    return (
      <div className={THANKS_BAR_CLASSES}>
        <CoinMedallion />
        <span className={THANKS_HEADING_CLASSES}>
          Thank You
        </span>
        <span className="text-muted-foreground">
          Your support keeps Chronicle&apos;s servers running — we couldn&apos;t do this without you.
        </span>
        <button onClick={handleDismiss} className={THANKS_DISMISS_CLASSES} aria-label="Dismiss banner">
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className={DONATE_BAR_CLASSES}>
      <CoinMedallion />
      <span className={DONATE_HEADING_CLASSES}>
        Keep Chronicle Alive
      </span>
      <span className="text-muted-foreground">
        Hosting isn&apos;t free —{" "}
        <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer" className={DONATE_LINK_CLASSES}>
          support the project
        </a>
        .
      </span>
      <button onClick={handleDismiss} className={DONATE_DISMISS_CLASSES} aria-label="Dismiss banner">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
