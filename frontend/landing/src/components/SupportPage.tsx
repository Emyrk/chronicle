import { useState } from "react";
import { ArrowLeft, Coffee, ExternalLink, Heart, Server, ShieldCheck, Wrench } from "lucide-react";
import { CryptoCoinIcon, PatreonIcon, SponsorsHeartIcon } from "./BrandIcons";
import { CryptoTipModal } from "./CryptoTipModal";

const GITHUB_SPONSORS_URL = "https://github.com/sponsors/Emyrk";
const PATREON_URL = "https://www.patreon.com/cw/ChronicleClassic";
const BUY_ME_A_COFFEE_URL = "https://buymeacoffee.com/chronicleclassic";

const DONATION_LINKS = [
  {
    label: "GitHub Sponsors",
    href: GITHUB_SPONSORS_URL,
    icon: <SponsorsHeartIcon className="h-4 w-4 text-pink-400" />,
  },
  {
    label: "Patreon",
    href: PATREON_URL,
    icon: <PatreonIcon className="h-4 w-4 text-[#FF424D]" />,
  },
  {
    label: "Buy Me a Coffee",
    href: BUY_ME_A_COFFEE_URL,
    icon: <Coffee aria-hidden="true" className="h-4 w-4 text-yellow-400" />,
  },
];

const DONATION_BUTTON_CLASSES =
  "inline-flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-5 py-3 text-base font-semibold text-foreground transition-colors hover:border-pink-300/60 hover:bg-muted";

export function SupportPage() {
  const [cryptoModalOpen, setCryptoModalOpen] = useState(false);

  return (
    <section className="relative mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-16 lg:px-8">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-96 bg-[radial-gradient(ellipse_at_top,_var(--primary-darker)_0%,_transparent_65%)] opacity-50" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <a
          href="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Back to server directory
        </a>
        <div className="inline-flex items-center gap-2 rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-sky-300">
          <span aria-hidden="true">◆</span>
          Hosted by Chronicle
        </div>
      </div>

      <div className="mx-auto mt-6 max-w-3xl text-center">
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-5xl">
          Keeping Chronicle available to WoW communities
        </h1>
      </div>

      <div className="mt-10 rounded-xl border border-pink-400/25 bg-card p-6 text-center shadow-lg shadow-pink-950/10 sm:p-10">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-pink-400/10 text-pink-300">
          <Heart aria-hidden="true" className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-2xl font-semibold text-foreground">Support the project</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
          Contributions help cover hosting for Chronicle-operated deployments
          and support continued development. Support is appreciated, never required.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {DONATION_LINKS.map(({ label, href, icon }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={DONATION_BUTTON_CLASSES}
            >
              {icon}
              {label}
              <ExternalLink aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
            </a>
          ))}
          <button
            type="button"
            onClick={() => setCryptoModalOpen(true)}
            className={DONATION_BUTTON_CLASSES}
          >
            <CryptoCoinIcon className="h-4 w-4 text-amber-400" />
            Tip with Crypto
          </button>
        </div>
      </div>

      <h2 className="mt-12 text-xl font-semibold text-foreground">Why donate?</h2>
      <div className="mt-5 grid gap-5 md:grid-cols-3">
        {[
          {
            icon: Server,
            title: "Servers aren't free",
            body: "Hosting, storage, and infrastructure for Chronicle-operated deployments are paid out of pocket every month. Donations offset those recurring costs.",
          },
          {
            icon: Heart,
            title: "Keep it free for everyone",
            body: "Chronicle is not-for-profit: no ads, no paywalls, no premium tiers. Contributions keep the service free for every community.",
          },
          {
            icon: Wrench,
            title: "Sustain development",
            body: "Chronicle is actively maintained. Support makes it easier to spend time on fixes, new features, and keeping up with the game.",
          },
        ].map(({ icon: Icon, title, body }) => (
          <article key={title} className="rounded-xl border border-border bg-card/70 p-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Icon aria-hidden="true" className="h-5 w-5" />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-foreground">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
          </article>
        ))}
      </div>

      <h2 className="mt-12 text-xl font-semibold text-foreground">Who runs each deployment?</h2>
      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <article className="rounded-xl border border-sky-400/30 bg-card/90 p-6 shadow-lg shadow-sky-950/10">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-400/10 text-sky-300">
            <ShieldCheck aria-hidden="true" className="h-5 w-5" />
          </div>
          <h2 className="mt-4 text-xl font-semibold text-foreground">Hosted by Chronicle</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            I operate the deployment and cover its infrastructure costs. The badge
            identifies communities whose Chronicle service depends directly on the
            project&apos;s hosting budget and maintenance.
          </p>
        </article>

        <article className="rounded-xl border border-border bg-card/70 p-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Server aria-hidden="true" className="h-5 w-5" />
          </div>
          <h2 className="mt-4 text-xl font-semibold text-foreground">Community hosted</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            These communities run Chronicle on their own infrastructure. They still
            use the same open-source project, but their operators handle hosting and
            service costs independently.
          </p>
        </article>
      </div>

      <CryptoTipModal open={cryptoModalOpen} onClose={() => setCryptoModalOpen(false)} />
    </section>
  );
}
