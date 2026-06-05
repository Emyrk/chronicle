import { useState } from "react";
import { DiscordIcon } from "./DiscordIcon";
import { CryptoTipModal } from "./CryptoTipModal";

const DISCORD_URL = "https://discord.gg/gz97ABFVAj";
const PATREON_URL = "https://www.patreon.com/cw/ChronicleClassic";
const BUY_ME_A_COFFEE_URL = "https://buymeacoffee.com/chronicleclassic";
const BUY_ME_A_COFFEE_ICON_URL =
  "https://cdn.brandfetch.io/idiZkYjDE2/w/192/h/192/theme/dark/logo.png?c=1bxid64Mup7aczewSAYMX&t=1708787601888";
const PATREON_ICON_URL =
  "https://cdn.brandfetch.io/id5ZYO6A-6/theme/light/symbol.svg?c=1bxid64Mup7aczewSAYMX&t=1697549446035";
const PATREON_TOOLTIP =
  "Financial contributions are greatly appreciated, but never required. Visit the patreon link to learn more!";

const GITHUB_URL = "https://github.com/Emyrk/chronicle";
const GITHUB_SPONSORS_URL = "https://github.com/sponsors/Emyrk";

export function Footer() {
  const [cryptoModalOpen, setCryptoModalOpen] = useState(false);

  return (
    <footer className="border-t border-border bg-muted/30">
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Project */}
          <div>
            <h4 className="font-semibold mb-3">Chronicle</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <a
                  href={GITHUB_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-foreground transition-colors"
                >
                  GitHub
                </a>
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
                  href={GITHUB_SPONSORS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-foreground transition-colors inline-flex items-center gap-1"
                >
                  <svg className="h-4 w-4 text-pink-400" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <path d="M4.25 2.5c-1.336 0-2.75 1.164-2.75 3 0 2.15 1.58 4.144 3.365 5.682A20.565 20.565 0 008 13.393a20.561 20.561 0 003.135-2.211C12.92 9.644 14.5 7.65 14.5 5.5c0-1.836-1.414-3-2.75-3-1.373 0-2.609.986-3.029 2.456a.749.749 0 01-1.442 0C6.859 3.486 5.623 2.5 4.25 2.5zM8 14.25l-.345.666-.002-.001-.006-.003-.018-.01a7.643 7.643 0 01-.31-.17 22.075 22.075 0 01-3.434-2.414C2.045 10.731 0 8.35 0 5.5 0 2.836 2.086 1 4.25 1 5.797 1 7.153 1.802 8 3.02 8.847 1.802 10.203 1 11.75 1 13.914 1 16 2.836 16 5.5c0 2.85-2.045 5.231-3.885 6.818a22.08 22.08 0 01-3.744 2.584l-.018.01-.006.003h-.002L8 14.25z" />
                  </svg>
                  GitHub Sponsors
                </a>
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

          {/* Legal */}
          <div className="text-sm text-muted-foreground">
            <p>© {new Date().getFullYear()} Chronicle</p>
            <p className="text-xs mt-2">
              Open-source raid log analysis for Classic World of Warcraft.
              Per-server privacy and terms are on each server's Chronicle.
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
