import { useState } from "react";
import { Coffee } from "lucide-react";
import { DiscordIcon } from "./DiscordIcon";
import { CryptoCoinIcon, PatreonIcon, SponsorsHeartIcon } from "./BrandIcons";
import { CryptoTipModal } from "./CryptoTipModal";

const DISCORD_URL = "https://discord.gg/gz97ABFVAj";
const PATREON_URL = "https://www.patreon.com/cw/ChronicleClassic";
const BUY_ME_A_COFFEE_URL = "https://buymeacoffee.com/chronicleclassic";
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
                  <SponsorsHeartIcon className="h-4 w-4 text-pink-400" />
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
                  <PatreonIcon className="h-4 w-4 text-[#FF424D]" />
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
                  <Coffee aria-hidden="true" className="h-4 w-4 text-yellow-400" />
                  Buy Me a Coffee
                </a>
              </li>
              <li>
                <button
                  onClick={() => setCryptoModalOpen(true)}
                  className="hover:text-foreground transition-colors inline-flex items-center gap-1"
                >
                  <CryptoCoinIcon className="h-4 w-4" />
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
