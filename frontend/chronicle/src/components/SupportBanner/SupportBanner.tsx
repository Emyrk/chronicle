import { useEffect, useMemo, useState } from "react";
import { Heart, X } from "lucide-react";
import { useAuthorizationCheck, useSession } from "@/api/queries";

const HIDE_UNTIL_KEY = "support-banner-hide-until";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// The banner stays up (reappearing on every load) until it's dismissed —
// there's no cadence gate before that. Dismissing schedules how long it
// stays quiet afterward, depending on which variant was dismissed:
// - Thanked supporters go quiet for a fixed 3 months.
// - Everyone else goes quiet for a random 30-45 days, re-rolled on each
//   dismissal, so the ask doesn't land on the same day every cycle.
// Tune these once we've seen how it lands — nothing else depends on them.
const THANKS_HIDE_DAYS = 90;
const DONATE_HIDE_MIN_DAYS = 30;
const DONATE_HIDE_MAX_DAYS = 45;

// Never show to accounts newer than this — a fresh signup hasn't had a
// chance to get value out of Chronicle yet. Also tunable.
const MIN_ACCOUNT_AGE_DAYS = 90;
const MIN_ACCOUNT_AGE_MS = MIN_ACCOUNT_AGE_DAYS * ONE_DAY_MS;

const SUPPORT_URL = "https://chronicleclassic.com/support/";

function isDueToShow(): boolean {
  const hideUntil = Number(localStorage.getItem(HIDE_UNTIL_KEY) ?? 0);
  return Date.now() >= hideUntil;
}

/** Called on dismiss only — picks how long to stay quiet based on variant. */
function scheduleHideAfterDismiss(variant: "donate" | "thanks") {
  const hideDays =
    variant === "thanks"
      ? THANKS_HIDE_DAYS
      : DONATE_HIDE_MIN_DAYS + Math.random() * (DONATE_HIDE_MAX_DAYS - DONATE_HIDE_MIN_DAYS);
  localStorage.setItem(HIDE_UNTIL_KEY, String(Date.now() + hideDays * ONE_DAY_MS));
}

function isOldEnough(createdAt: string): boolean {
  return Date.now() - new Date(createdAt).getTime() >= MIN_ACCOUNT_AGE_MS;
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

const DONATE_BAR_CLASSES = `${BAR_BASE_CLASSES} border-rose-500/30 bg-rose-500/10`;
const DONATE_DISMISS_CLASSES = `${DISMISS_BASE_CLASSES} hover:bg-rose-500/20`;
const DONATE_HEADING_CLASSES = "font-wow font-bold text-rose-600 dark:text-rose-400";
const DONATE_LINK_CLASSES = "underline text-rose-600 dark:text-rose-400 hover:text-rose-500";

const THANKS_BAR_CLASSES = `${BAR_BASE_CLASSES} border-emerald-500/30 bg-emerald-500/10`;
const THANKS_DISMISS_CLASSES = `${DISMISS_BASE_CLASSES} hover:bg-emerald-500/20`;
const THANKS_HEADING_CLASSES = "font-wow font-bold text-emerald-600 dark:text-emerald-400";

/**
 * Site-wide reminder that Chronicle's hosting is donor-funded. Shows on every
 * load until dismissed (see scheduleHideAfterDismiss for what happens then).
 * Never shown to a logged-out visitor or to an account younger than
 * MIN_ACCOUNT_AGE_DAYS. Whether someone currently holds the "supporter"
 * SpiceDB role is checked last and decides the message.
 */
export function SupportBanner() {
  const { data: session, isLoading: sessionLoading } = useSession();
  const meetsAgeRequirement = !!session && isOldEnough(session.created_at);

  const authzChecks = useMemo(() => ({ supporter: "chronicle:chronicle#supporter" }), []);
  const { data: authz, isLoading: authzLoading } = useAuthorizationCheck(authzChecks, {
    enabled: meetsAgeRequirement,
  });

  // "pending" = still deciding what (if anything) to show.
  const [state, setState] = useState<"pending" | "hidden" | "donate" | "thanks">("pending");

  const stillDeciding = sessionLoading || (meetsAgeRequirement && authzLoading);

  useEffect(() => {
    if (state !== "pending" || stillDeciding) {
      return;
    }

    // Covers both "not logged in" (no session) and "account too young".
    if (!meetsAgeRequirement || !isDueToShow()) {
      setState("hidden");
      return;
    }

    const isSupporter = authz?.supporter ?? false;
    setState(isSupporter ? "thanks" : "donate");
  }, [state, stillDeciding, meetsAgeRequirement, authz]);

  if (state === "pending" || state === "hidden") {
    return null;
  }

  const handleDismiss = () => {
    scheduleHideAfterDismiss(state === "thanks" ? "thanks" : "donate");
    setState("hidden");
  };

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
