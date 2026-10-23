import { Link } from "react-router-dom";
import { Crown, HandHeart } from "lucide-react";
import { DiscordIcon } from "@/components/icons/DiscordIcon";
import { useSiteConfig } from "@/api/queries";
import type { Branding, SiteConfig } from "@/api/typesGenerated";

const DISCORD_URL = "https://discord.gg/gz97ABFVAj";
const SUPPORT_URL = "https://chronicleclassic.com/support/";
const ADS_URL = "https://chronicleclassic.com/ads/";

export function Footer() {
  const { data: siteConfig } = useSiteConfig();
  const tenant = siteConfig?.tenant ?? null;

  const gitTag = document
    .querySelector("meta[property=GitTag]")
    ?.getAttribute("content");

  const gitCommit = document
    .querySelector("meta[property=GitCommit]")
    ?.getAttribute("content");

  const buildTime = document
    .querySelector("meta[property=BuildTime]")
    ?.getAttribute("content");

  return (
    <footer className="border-t bg-muted/30">
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Navigation */}
          <div>
            <h4 className="font-semibold mb-3">Navigation</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link to="/supported" className="hover:text-foreground transition-colors">
                  Supported Instances
                </Link>
              </li>
              <li>
                <Link to="/wowdb" className="hover:text-foreground transition-colors">
                  WoW Database
                </Link>
              </li>
              <li>
                <Link to="/tools" className="hover:text-foreground transition-colors">
                  Tools & FAQ
                </Link>
              </li>
              <li>
                {/* The blog is a separately hydrated app, so it requires a document navigation. */}
                <a href="/blog" className="hover:text-foreground transition-colors">
                  What's New
                </a>
              </li>
              <li>
                <Link to="/technical" className="hover:text-foreground transition-colors">
                  Technical Details
                </Link>
              </li>
            </ul>
          </div>

          {/* Community */}
          <div>
            <h4 className="font-semibold mb-3">Community</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <a
                  href="https://chronicleclassic.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-foreground transition-colors inline-flex items-center gap-1"
                >
                  <img src="/c/chronicle/ChronicleIconSquare.webp" alt="" aria-hidden="true" className="h-4 w-4" />
                  Supported Servers
                </a>
              </li>
              <li>
                <a
                  href={DISCORD_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-foreground transition-colors inline-flex items-center gap-1"
                >
                  <DiscordIcon className="h-4 w-4" />
                  Chronicle Discord
                </a>
              </li>
              <li>
                <Link to="/contact" className="hover:text-foreground transition-colors">
                  About & Contact
                </Link>
              </li>
            </ul>
          </div>

          {/* Contribute Support */}
          <div>
            <h4 className="font-semibold mb-3">Contribute Support</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {siteConfig?.billing_enabled && (
                <li>
                  <Link
                    to="/supporter"
                    title="Supporter tiers include ad-free browsing, extra storage, and more"
                    className="hover:text-foreground transition-colors inline-flex items-center gap-1"
                  >
                    <Crown className="h-4 w-4 text-[#f0c060]" aria-hidden="true" />
                    Support Chronicle
                    <span className="ml-1 rounded-full border border-[#f0c060]/50 bg-[#f0c060]/10 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider text-[#f0c060]">
                      Perks
                    </span>
                  </Link>
                </li>
              )}
              <li>
                <a
                  href={SUPPORT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-foreground transition-colors inline-flex items-center gap-1"
                >
                  <HandHeart className="h-4 w-4" aria-hidden="true" />
                  Donate to Chronicle
                </a>
              </li>
            </ul>
          </div>

          {/* Legal/Build */}
          <div className="text-sm text-muted-foreground">
            <FooterBranding siteConfig={siteConfig ?? undefined} isTenant={!!tenant} />
            <p>© {new Date().getFullYear()} Chronicle</p>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
              <Link
                to="/privacy"
                className="hover:text-foreground transition-colors"
              >
                Privacy Policy
              </Link>
              <Link
                to="/terms"
                className="hover:text-foreground transition-colors"
              >
                Terms of Service
              </Link>
              <a
                href={ADS_URL}
                className="hover:text-foreground transition-colors"
              >
                Why Ads?
              </a>
              <Link
                to="/disclaimer"
                className="hover:text-foreground transition-colors"
              >
                Disclaimer
              </Link>
            </div>
            <p className="text-xs mt-2">
              {gitTag} ({gitCommit}) • Built {buildTime}
            </p>
            {siteConfig?.ads_enabled && (
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                <span id="ncmp-consent-link" className="cursor-pointer hover:text-foreground transition-colors" />
                <span data-ccpa-link="1" className="cursor-pointer hover:text-foreground transition-colors" />
              </div>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
}

const CHRONICLE_LOGO = "/c/chronicle/ChronicleLogoCenter.svg";

/**
 * FooterBranding renders above the copyright line in the Legal/Build column.
 * Shows the wide logo (or square logo + display name fallback) with
 * "Powered by Chronicle" underneath.
 * If no branding exists, renders nothing.
 */
function FooterBranding({ siteConfig, isTenant }: { siteConfig?: SiteConfig; isTenant: boolean }) {
  const branding: Branding | null | undefined = isTenant
    ? siteConfig?.tenant?.branding
    : siteConfig?.branding;

  if (!branding) return null;

  const { logo_wide, square_logo, display_name } = branding;
  // Need at least one visual element to render.
  if (!logo_wide && !square_logo && !display_name) return null;

  return (
    <div className="mb-3 space-y-1.5">
      {logo_wide ? (
        <img src={logo_wide} alt={display_name ?? ""} className="h-8 object-contain object-left" />
      ) : (
        <div className="flex items-center gap-2">
          {square_logo && (
            <img src={square_logo} alt="" className="h-7 w-7 rounded object-contain" />
          )}
          {display_name && (
            <span className="font-semibold text-foreground">{display_name}</span>
          )}
        </div>
      )}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span>Powered by</span>
        <a href="https://chronicleclassic.com" target="_blank" rel="noopener noreferrer">
        <img src={CHRONICLE_LOGO} alt="Chronicle" className="h-8 object-contain" />
        </a>
      </div>
    </div>
  );
}
