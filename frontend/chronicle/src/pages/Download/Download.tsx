import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { BatteryFull, Check, Download as DownloadIcon, ExternalLink, Eye, Info, PanelTop, Upload as UploadIcon, Wifi } from "lucide-react";
import { useSiteConfig } from "@/api/queries";
import { MagicLogo } from "@/components/MagicLogo";
import { tenantClients, type ClientMod, type ClientOption, type CompanionAddon } from "./formatAddons";
import { PLATFORMS, REPO, assetUrl, detectOS, type OS } from "./platforms";
import s from "./Download.module.css";

const FONTS_URL =
  "https://fonts.googleapis.com/css2?family=Young+Serif&family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400&display=swap";

const SIDEKICK_LOGO = "/c/chronicle/SidekickLogo.webp";
const CHRONICLE_ICON = "/c/chronicle/ChronicleIconSquare.webp";

// Sidekick's tray state colors (chronicle-sidekick icons.go).
const STATES = [
  { color: "#8a8f98", text: "Waiting for WoW" },
  { color: "#e5484d", text: "Not logging" },
  { color: "#f97316", text: "Combat logging started, waiting for data" },
  { color: "#22c55e", text: "Combat log receiving data" },
  { color: "#3b82f6", text: "Uploading or retrying" },
  { color: "#f2c12e", text: "Chronicle sign-in required" },
];

const NIGHT = [
  { time: "19:45", color: "#8a8f98", text: "Waiting for WoW to open." },
  { time: "19:58", color: "#f97316", text: "You're in. The addon has already turned logging on." },
  { time: "20:02", color: "#22c55e", text: "First pull. Recording every hit, heal and death." },
  { time: "23:10", color: "#3b82f6", text: "Last boss down. Click Upload now and it sends the night." },
];

/** The Sidekick icon with its tray state dot. */
function Mark({ color, size = 18 }: { color: string; size?: number }) {
  return (
    <span className={s.mark} style={{ width: size, height: size }}>
      <img src={SIDEKICK_LOGO} alt="" />
      <span className={s.state} style={{ background: color }} />
    </span>
  );
}

function Rise({ n, className = "", children }: { n: number; className?: string; children: React.ReactNode }) {
  return <div className={`${s.rise} ${s[`d${n}`]} ${className}`}>{children}</div>;
}

/** Step 3: the client's companion addon, which turns on combat logging by itself. */
function AddonStep({ addon: primary }: { addon: CompanionAddon | null }) {
  if (!primary) {
    return (
      <div className={s.card}>
        <div className={s.shot} style={{ gap: 8 }}>
          <div className={s.shotLabel}>In-game chat</div>
          <div className={s.chat}>
            <div style={{ color: "#ffff00" }}>Combat logging enabled.</div>
            <div className={s.chatInput}>
              <span style={{ color: "#9a8d7b", marginRight: 6 }}>Say:</span>/combatlog
              <span aria-hidden="true" className={s.cursor} />
            </div>
          </div>
        </div>
        <div className={s.stepHead}>
          <span className={`${s.serif} ${s.num}`}>3</span>
          <h3 className={s.h3}>Turn on combat logging</h3>
        </div>
        <p className={s.stepBody}>
          No addon needed. Check <strong>Options › System › Network › Advanced Combat Logging</strong>, then type{" "}
          <code>/combatlog</code> before the raid.
        </p>
      </div>
    );
  }
  return (
    <div className={s.card}>
      <div className={s.shot} style={{ gap: 8 }}>
        <div className={s.shotLabel}>In game</div>
        <div className={s.chat}>
          <div className={s.addonRow}>
            <span className={s.addonBox}>
              <Check size={11} strokeWidth={3} aria-hidden="true" />
            </span>
            {primary.name}
          </div>
          <div style={{ color: "#40ff40" }}>[Guild] Thrallina: pull in 2</div>
          <div style={{ color: "#ffff00" }}>Combat logging enabled.</div>
        </div>
      </div>
      <div className={s.stepHead}>
        <span className={`${s.serif} ${s.num}`}>3</span>
        <h3 className={s.h3}>Install the addon</h3>
      </div>
      <p className={s.stepBody}>
        Install{" "}
        <a href={primary.url} target="_blank" rel="noopener noreferrer">
          <strong>{primary.name}</strong>
        </a>{" "}
        for the {primary.client} client. It turns on combat logging every time you log in, so there's nothing to type
        and nothing to forget.
      </p>
      <a href={primary.url} target="_blank" rel="noopener noreferrer" className={s.addonCta}>
        Get the addon
        <ExternalLink size={16} strokeWidth={2.5} aria-hidden="true" />
      </a>
    </div>
  );
}

function ModLink({ mod }: { mod: ClientMod }) {
  return (
    <a href={mod.url} target="_blank" rel="noopener noreferrer">
      <strong>{mod.name}</strong>
    </a>
  );
}

/** Step 4: what the addon needs, plus optional extras for replay map positions. */
function ModsStep({ addon }: { addon: CompanionAddon }) {
  const { requires, optional } = addon;
  const title = requires.length > 0 ? `Add ${requires.map((m) => m.name).join(" and ")}` : "Optional: unit positions";
  const kinds = new Set([...requires, ...optional].map((m) => m.kind));
  const kindLabel = kinds.size > 1 ? "Mods and addons" : kinds.has("addon") ? "Addons" : "Client mods";
  return (
    <div className={s.card}>
      <div className={s.shot} style={{ gap: 5 }}>
        <div className={s.shotLabel}>
          {kindLabel} for {addon.client}
        </div>
        {[...requires.map((m) => ({ m, tag: "Required" })), ...optional.map((m) => ({ m, tag: "Optional" }))].map(
          ({ m, tag }) => (
            <div key={m.name} className={s.modRow}>
              <span>{m.name}</span>
              <span className={tag === "Required" ? s.tagReq : s.tagOpt}>{tag}</span>
            </div>
          ),
        )}
      </div>
      <div className={s.stepHead}>
        <span className={`${s.serif} ${s.num}`}>4</span>
        <h3 className={s.h3}>{title}</h3>
      </div>
      {requires.map((m) => (
        <p key={m.name} className={s.stepBody}>
          <ModLink mod={m} /> is required. {m.note}
        </p>
      ))}
      {optional.length > 0 && (
        <>
          <p className={s.stepBody}>
            {optional.length > 1 ? "Optionally add one of these" : "Optionally add this"} for unit positions on the
            replay map:
          </p>
          <ul className={s.modList}>
            {optional.map((m) => (
              <li key={m.name}>
                <ModLink mod={m} />: {m.note}
              </li>
            ))}
          </ul>
        </>
      )}
      {[...requires, ...optional]
        .filter((m) => m.warning)
        .map((m) => (
          <p key={m.name} className={s.note}>
            <Info size={16} color="#e6b450" aria-hidden="true" />
            <span>{m.warning}</span>
          </p>
        ))}
    </div>
  );
}

export function DownloadView({ os, clients }: { os: OS; clients: ClientOption[] }) {
  const current = PLATFORMS.find((p) => p.os === os) ?? PLATFORMS[0];
  const [primary, ...alternates] = current.files;
  const others = PLATFORMS.filter((p) => p !== current);
  // The tenant's default format is first, so it's selected until the player picks another.
  const [picked, setPicked] = useState<string>();
  const addon = (clients.find((c) => c.label === picked) ?? clients[0])?.addon ?? null;
  // Step 4 only exists when the addon has client mods to go with it.
  const modsAddon = addon && addon.requires.length + addon.optional.length > 0 ? addon : undefined;

  return (
    <div className={s.page}>
      <link rel="stylesheet" href={FONTS_URL} />
      <svg aria-hidden="true" className={s.grain}>
        <filter id="grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain)" />
      </svg>
      <div aria-hidden="true" className={s.glow} />

      <section className={`${s.wrap} ${s.hero}`}>
        <div className={`${s.rise} ${s.d1} ${s.logo}`}>
          <MagicLogo src={SIDEKICK_LOGO} alt="Chronicle Sidekick" className={s.logoImg} />
        </div>
        <div className={s.heroText}>
          <p className={`${s.rise} ${s.d2} ${s.eyebrow}`}>Chronicle Sidekick</p>
          <h1 className={`${s.rise} ${s.d2} ${s.serif} ${s.h1}`}>
            Install once.
            <br />
            Never hunt for a log again.
          </h1>
          <p className={`${s.rise} ${s.d3} ${s.intro}`}>
            A tiny app that sits in your {current.tray}, finds WoW, and watches your combat log while you play. When the
            raid's over, one click sends it to Chronicle. No dragging files around.
          </p>
          <div className={`${s.rise} ${s.d4} ${s.ctaBlock}`}>
            <a href={assetUrl(primary.file)} className={s.cta}>
              <DownloadIcon className={s.arrow} size={22} strokeWidth={2.6} aria-hidden="true" />
              Download for {current.label}
            </a>
            <div className={s.meta}>
              <span>
                {primary.label}
                {alternates.map((a) => (
                  <span key={a.file}>
                    {" · "}
                    <a href={assetUrl(a.file)}>{a.label}</a>
                  </span>
                ))}
              </span>
              <span>
                Also for <a href={assetUrl(others[0].files[0].file)}>{others[0].label}</a> and{" "}
                <a href={assetUrl(others[1].files[0].file)}>{others[1].label}</a>
              </span>
            </div>
          </div>
        </div>
      </section>

      <Rise n={5} className={`${s.wrap} ${s.how}`}>
        <div className={s.howItem}>
          <PanelTop size={28} color="#e6b450" strokeWidth={1.8} aria-hidden="true" />
          <span><strong>Sits in your {current.tray}.</strong> Quiet. No window.</span>
        </div>
        <div className={s.howItem}>
          <Eye size={28} color="#e6b450" strokeWidth={1.8} aria-hidden="true" />
          <span><strong>Watches the log while you play.</strong> Uses nothing.</span>
        </div>
        <div className={s.howItem}>
          <UploadIcon size={28} color="#e6b450" strokeWidth={1.8} aria-hidden="true" />
          <span><strong>One click to upload.</strong> Report's ready before you are.</span>
        </div>
      </Rise>

      <Rise n={6} className={`${s.wrap} ${s.steps}`}>
        <h2 className={`${s.serif} ${s.h2}`}>{modsAddon ? "Four" : "Three"} steps, then never again</h2>
        {clients.length > 1 && (
          <div className={s.clientPick} role="group" aria-label="Your game client">
            <span>Your client</span>
            {clients.map((c, i) => (
              <button
                key={c.label}
                type="button"
                aria-pressed={c.addon === addon}
                onClick={() => setPicked(c.label)}
              >
                {c.label}
                {i === 0 && <span className={s.pickDefault}> · default</span>}
              </button>
            ))}
          </div>
        )}
        <div className={`${s.stepGrid} ${modsAddon ? s.stepGrid4 : ""}`}>
          <div className={s.card}>
            <div className={s.shot}>
              <div className={s.shotLabel}>Your {current.tray}</div>
              <div className={s.bar}>
                <Mark color="#8a8f98" />
                <Wifi size={16} color="#f3f4f6" aria-hidden="true" />
                <BatteryFull size={18} color="#f3f4f6" aria-hidden="true" />
                <span>Wed 19:41</span>
              </div>
            </div>
            <div className={s.stepHead}>
              <span className={`${s.serif} ${s.num}`}>1</span>
              <h3 className={s.h3}>Open it</h3>
            </div>
            <p className={s.stepBody}>{current.install}</p>
            <p className={s.note}>
              <Info size={16} color="#e6b450" aria-hidden="true" />
              <span>{current.note}</span>
            </p>
          </div>

          <div className={s.card}>
            <div className={s.shot} style={{ flexDirection: "row", alignItems: "center", justifyContent: "center" }}>
              <div className={s.menu}>
                <div className={s.dim}>Not connected.</div>
                <div className={s.sep} />
                <div>Upload now</div>
                <div className={s.hot}>Connect to Chronicle…</div>
                <div className={s.sep} />
                <div className={s.dim}>Quit</div>
              </div>
            </div>
            <div className={s.stepHead}>
              <span className={`${s.serif} ${s.num}`}>2</span>
              <h3 className={s.h3}>Pair it</h3>
            </div>
            <p className={s.stepBody}>
              Click <strong>Connect to Chronicle</strong> and approve in the browser. That's your account. New to
              Chronicle? Signing in with Discord there creates it. No passwords typed into the app, ever.
            </p>
          </div>

          <AddonStep addon={addon} />
          {modsAddon && <ModsStep addon={modsAddon} />}
        </div>
      </Rise>

      <Rise n={7} className={`${s.wrap} ${s.night}`}>
        <h2 className={`${s.serif} ${s.h2}`}>One raid night, as Sidekick sees it</h2>
        <div className={s.stations}>
          <div aria-hidden="true" className={s.track} />
          {NIGHT.map((n) => (
            <div key={n.time} className={s.station}>
              <div className={s.dot}>
                <Mark color={n.color} size={28} />
              </div>
              <div className={s.time}>{n.time}</div>
              <div className={s.what}>{n.text}</div>
            </div>
          ))}
          <div className={s.station}>
            <div className={`${s.dot} ${s.dotHot}`}>
              <img src={CHRONICLE_ICON} alt="" className={s.dotLogo} />
            </div>
            <div className={s.time}>23:11</div>
            <div className={s.what}>Your report is up. Go argue about parses.</div>
          </div>
        </div>
      </Rise>

      <section className={`${s.wrap} ${s.legend}`}>
        <h2 className={s.h2s}>What the dot colour means</h2>
        <div className={s.legendGrid}>
          {STATES.map((st) => (
            <div key={st.text} className={s.legendItem}>
              <span className={s.swatch} style={{ background: st.color }} />
              <span>{st.text}</span>
            </div>
          ))}
        </div>
      </section>

      <section className={`${s.wrap} ${s.foot}`}>
        <ul className={s.checks}>
          <li><Check size={16} color="#e6b450" strokeWidth={2.5} aria-hidden="true" />Only reads your combat log. Never touches the game.</li>
          <li><Check size={16} color="#e6b450" strokeWidth={2.5} aria-hidden="true" />Updates itself.</li>
          <li>
            <Check size={16} color="#e6b450" strokeWidth={2.5} aria-hidden="true" />
            <span><a href={REPO}>Open source</a>, like the rest of Chronicle.</span>
          </li>
        </ul>
        <p>
          Prefer to upload by hand? <Link to="/upload">Use the upload page.</Link> Already set up?{" "}
          <Link to="/account/sidekick">See your computers.</Link>
        </p>
      </section>
    </div>
  );
}

export function DownloadPage() {
  const { data: siteConfig } = useSiteConfig();
  // ?os= lets a link pick the platform, e.g. "Download for Windows".
  const requested = new URLSearchParams(useLocation().search).get("os");
  const os = PLATFORMS.some((p) => p.os === requested) ? (requested as OS) : detectOS();
  return <DownloadView os={os} clients={tenantClients(siteConfig)} />;
}
