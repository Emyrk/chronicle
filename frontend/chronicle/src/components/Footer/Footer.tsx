import { Link } from "react-router-dom";
import { DiscordIcon } from "@/components/icons/DiscordIcon";

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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
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
            </ul>
          </div>

          {/* Community */}
          <div>
            <h4 className="font-semibold mb-3">Community</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <a
                  href={DISCORD_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-foreground transition-colors inline-flex items-center gap-1"
                >
                  <DiscordIcon className="h-4 w-4" />
                  Discord
                </a>
              </li>
              <li className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground/80">
                Contribute Support
              </li>
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
            </ul>
          </div>

          {/* Legal/Build */}
          <div className="text-sm text-muted-foreground">
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
    </footer>
  );
}
