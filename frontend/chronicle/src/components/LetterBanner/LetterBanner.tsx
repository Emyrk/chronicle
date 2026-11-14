import { useState } from "react";
import { X } from "lucide-react";
import { useSiteConfig } from "@/api/queries";
import { iconUrl } from "@/config/iconUrl";
import { SERVER_NAME } from "@/config/serverCapabilities";

const KEY = "ratings-letter-banner-dismissed";
const POST_PATH = "/blog/beyond-the-best-parse";
const TEN_YEARS_MS = 10 * 365 * 24 * 60 * 60 * 1000;

function readDismissed(): boolean {
  try {
    if (localStorage.getItem(KEY) === "true") return true;
  } catch {
    // Storage can be blocked; the cookie still counts.
  }
  return document.cookie.split(";").some((part) => part.trim() === `${KEY}=true`);
}

/** Remembers the dismissal for good, across subdomains when the site has a primary domain. */
function writeDismissed(primaryDomain?: string): void {
  try {
    localStorage.setItem(KEY, "true");
  } catch {
    // Fall back to the cookie alone.
  }
  const attributes = [`${KEY}=true`, "Path=/", `Expires=${new Date(Date.now() + TEN_YEARS_MS).toUTCString()}`, "SameSite=Lax"];
  if (primaryDomain) attributes.push(`Domain=${primaryDomain}`);
  if (window.location.protocol === "https:") attributes.push("Secure");
  document.cookie = attributes.join("; ");
}

function postHref(): string {
  const params = new URLSearchParams({ chr_src: SERVER_NAME, chr_pos: "letter_banner", chr_cmp: "beyond_the_best_parse" });
  return `${POST_PATH}?${params}`;
}

/**
 * Site-wide pointer to the ratings and Armory letter. Dismissing it, or
 * opening the letter, hides it permanently.
 */
export function LetterBanner() {
  const { data: siteConfig } = useSiteConfig();
  const [dismissed, setDismissed] = useState(readDismissed);
  if (dismissed) return null;

  const dismiss = () => {
    writeDismissed(siteConfig?.primary_domain);
    setDismissed(true);
  };

  return (
    <div className="relative border-b border-[#6b5320] bg-gradient-to-r from-[#1e1710] via-[#2a1f10] to-[#1e1710]">
      <div className="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 py-2.5 pr-12">
        <img
          src={iconUrl("inv_letter_15")}
          alt=""
          width={36}
          height={36}
          className="size-9 shrink-0 rounded border-2 border-[#f0c060]/60"
        />
        <div className="min-w-0 flex-1">
          <div className="font-wow text-sm text-[#f0c060] sm:text-base">
            Parses are back on the Armory
          </div>
          <div className="text-xs text-[#cfb88a] sm:text-sm">
            <span className="sm:hidden">A letter on what went wrong, and why ratings exist.</span>
            <span className="hidden sm:inline">
              A letter on what I got wrong with the Armory, what&apos;s been fixed, and why ratings exist.
            </span>
          </div>
        </div>
        <a
          href={postHref()}
          onClick={dismiss}
          className="shrink-0 rounded-md border border-[#f0c060] bg-[#f0c060] px-3 py-1.5 text-xs font-semibold text-[#1a1206] transition-colors hover:bg-[#ffd27a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 sm:text-sm"
        >
          Read the letter
        </a>
      </div>
      <button
        type="button"
        onClick={dismiss}
        className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1.5 text-[#cfb88a] transition-colors hover:bg-white/10 hover:text-white"
        aria-label="Dismiss banner"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
