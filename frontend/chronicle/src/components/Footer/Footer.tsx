import { useState } from "react";
import { Link } from "react-router-dom";
import { DiscordIcon } from "@/components/icons/DiscordIcon";
import { CryptoTipModal } from "./CryptoTipModal";
import { useSiteConfig } from "@/api/queries";
import type { Branding, SiteConfig } from "@/api/typesGenerated";

const SERVER_NAME = import.meta.env.VITE_SERVER_NAME ?? "turtle";


const DISCORD_URL = "https://discord.gg/gz97ABFVAj";
const PATREON_URL = "https://www.patreon.com/cw/ChronicleClassic";
const GITHUB_SPONSORS_URL = "https://github.com/sponsors/Emyrk/";
const BUY_ME_A_COFFEE_URL = "https://buymeacoffee.com/chronicleclassic";
const BUY_ME_A_COFFEE_ICON_URL =
  "https://cdn.brandfetch.io/idiZkYjDE2/w/192/h/192/theme/dark/logo.png?c=1bxid64Mup7aczewSAYMX&t=1708787601888";
const PATREON_ICON_URL =
  "https://cdn.brandfetch.io/id5ZYO6A-6/theme/light/symbol.svg?c=1bxid64Mup7aczewSAYMX&t=1697549446035";
const PATREON_TOOLTIP =
  "Finantial contributions are greatly appreciated, but never required. Visit the patreon link to learn more!";

export function Footer() {
  const [cryptoModalOpen, setCryptoModalOpen] = useState(false);
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
                <Link to="/contact" className="hover:text-foreground transition-colors">
                  About & Contact
                </Link>
              </li>
              <li>
                <Link to="/supported" className="hover:text-foreground transition-colors">
                  Supported Instances
                </Link>
              </li>
              <li>
                <Link to="/technical" className="hover:text-foreground transition-colors">
                  Technical Details
                </Link>
              </li>
              <li>
                <Link to="/parsing" className="hover:text-foreground transition-colors">
                  Parsing
                </Link>
              </li>
              <li>
                <Link to="/wowdb" className="hover:text-foreground transition-colors">
                  WoW Database
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
                  <img src="/c/chronicle/ChronicleIconSquare.png" alt="" aria-hidden="true" className="h-4 w-4" />
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
            </ul>
          </div>

          {/* Contribute Support */}
          <div>
            <h4 className="font-semibold mb-3">Contribute Support</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <a
                  href={PATREON_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={PATREON_TOOLTIP}
                  className="hover:text-foreground transition-colors inline-flex items-center gap-1"
                >
                  <img
                    src={PATREON_ICON_URL}
                    alt=""
                    aria-hidden="true"
                    className="h-4 w-4"
                  />
                  Patreon
                </a>
              </li>
              <li>
                <a
                  href={BUY_ME_A_COFFEE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-foreground transition-colors inline-flex items-center gap-1"
                >
                  <img
                    src={BUY_ME_A_COFFEE_ICON_URL}
                    alt=""
                    aria-hidden="true"
                    className="h-4 w-4"
                  />
                  Buy Me a Coffee
                </a>
              </li>
              <li>
                <a
                  href={GITHUB_SPONSORS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-foreground transition-colors inline-flex items-center gap-1"
                >
                  <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <path d="M8 .2C3.58.2 0 3.78 0 8.2c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8.2c0-4.42-3.58-8-8-8z" />
                  </svg>
                  GitHub Sponsors
                </a>
              </li>
              <li>
                <button
                  onClick={() => setCryptoModalOpen(true)}
                  className="hover:text-foreground transition-colors inline-flex items-center gap-1"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M9.5 8h5a2 2 0 0 1 0 4h-5m0-4v8m0-8H8m1.5 4h4.5a2 2 0 0 1 0 4H9.5m0 0H8" />
                  </svg>
                  Tip with Crypto
                </button>
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
              <Link
                to="/disclaimer"
                className="hover:text-foreground transition-colors"
              >
                Disclaimer
              </Link>
            </div>
            <p className="text-xs mt-2">
              {gitTag} ({gitCommit}) • Built {buildTime} • Server: {SERVER_NAME}
            </p>
          </div>
        </div>
      </div>
      {cryptoModalOpen && (
        <CryptoTipModal
          open
          onClose={() => setCryptoModalOpen(false)}
        />
      )}
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
