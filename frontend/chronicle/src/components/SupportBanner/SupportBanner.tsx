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

/** Medallion that flips between the Chronicle logo and a heart. Links to the support page. */
function CoinMedallion({ className }: { className: string }) {
  return (
    <a
      href={SUPPORT_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Support Chronicle"
      className={`relative inline-block shrink-0 rounded-full transition-transform hover:scale-105 ${className}`}
      style={{ perspective: "300px" }}
    >
      <span aria-hidden="true" className="support-banner-coin absolute inset-0">
        <span className="support-banner-coin-face support-banner-coin-front">
          <img
            src="/c/chronicle/ChronicleIconSquare.png"
            alt=""
            className="h-full w-full object-contain"
          />
        </span>
        <span className="support-banner-coin-face support-banner-coin-back">
          <Heart className="h-1/2 w-1/2 fill-current" />
        </span>
      </span>
    </a>
  );
}

const BAR_BASE_CLASSES = "border-b py-4 px-6 text-left";
const CONTENT_ROW_CLASSES = "mx-auto flex w-full max-w-5xl items-center gap-4";
const BUTTON_BASE_CLASSES =
  "shrink-0 rounded-md px-4 py-2 text-sm font-bold text-white transition-colors";
const DISMISS_BASE_CLASSES =
  "shrink-0 rounded p-1 text-muted-foreground hover:text-foreground transition-colors";

const DONATE_BAR_CLASSES = `${BAR_BASE_CLASSES} border-rose-500/30 bg-rose-500/10`;
const DONATE_HEADING_CLASSES = "font-wow text-base font-bold text-foreground";
const DONATE_BUTTON_CLASSES = `${BUTTON_BASE_CLASSES} bg-rose-500 hover:bg-rose-600`;
const DONATE_DISMISS_CLASSES = `${DISMISS_BASE_CLASSES} hover:bg-rose-500/20`;

const THANKS_BAR_CLASSES = `${BAR_BASE_CLASSES} border-emerald-500/30 bg-emerald-500/10`;
const THANKS_HEADING_CLASSES = "font-wow text-base font-bold text-foreground";
const THANKS_DISMISS_CLASSES = `${DISMISS_BASE_CLASSES} hover:bg-emerald-500/20`;

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
        <div className={CONTENT_ROW_CLASSES}>
          <CoinMedallion className="h-10 w-10" />
          <div className="min-w-0 flex-1">
            <div className={THANKS_HEADING_CLASSES}>Thank you for supporting Chronicle.</div>
            <div className="mt-0.5 text-sm text-muted-foreground">
              Your generosity keeps every server here running.
            </div>
          </div>
          <button onClick={handleDismiss} className={THANKS_DISMISS_CLASSES} aria-label="Dismiss banner">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={DONATE_BAR_CLASSES}>
      <div className={CONTENT_ROW_CLASSES}>
        <CoinMedallion className="h-10 w-10" />
        <div className="min-w-0 flex-1">
          <div className={DONATE_HEADING_CLASSES}>Chronicle runs on donations, not ads.</div>
          <div className="mt-0.5 text-sm text-muted-foreground">
            Every server here is hosted for free. Help keep it that way.
          </div>
        </div>
        <a
          href={SUPPORT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={DONATE_BUTTON_CLASSES}
        >
          Support Chronicle
        </a>
        <button onClick={handleDismiss} className={DONATE_DISMISS_CLASSES} aria-label="Dismiss banner">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
