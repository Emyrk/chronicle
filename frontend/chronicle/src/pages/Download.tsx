import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Download as DownloadIcon, Eye, Check, Info, Upload as UploadIcon, PanelTop, Wifi, BatteryFull } from "lucide-react";
import { Stone } from "./Stone";
import s from "./Download.module.css";

type OS = "mac" | "windows" | "linux";

interface Asset {
  os: OS;
  name: string;
  label: string;
  platform: string;
  tray: string;
  install: string;
  note: string;
}

const RELEASES_URL = "https://github.com/Emyrk/chronicle-sidekick/releases";
const API_URL = "https://api.github.com/repos/Emyrk/chronicle-sidekick/releases?per_page=30";
const FONTS_URL =
  "https://fonts.googleapis.com/css2?family=Young+Serif&family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400&display=swap";

// File names are fixed by Chronicle Sidekick's GoReleaser configuration.
const ASSETS: Asset[] = [
  {
    os: "mac",
    name: "Chronicle-Sidekick-macos.zip",
    label: "macOS",
    platform: "Apple silicon and Intel",
    tray: "Your menu bar",
    install:
      "Unzip, drag Chronicle Sidekick into Applications and open it. The stone appears in your menu bar. That is the whole install.",
    note: "macOS will warn you once because this build is not signed yet. Right-click the app, choose Open, then Open again.",
  },
  {
    os: "windows",
    name: "Chronicle-Sidekick-windows-amd64.exe",
    label: "Windows",
    platform: "64-bit, no installer",
    tray: "Your system tray",
    install:
      "Double-click the downloaded .exe. The stone appears in your system tray, near the clock. That is the whole install.",
    note: "Windows will warn you once because this build is not signed yet. On the SmartScreen prompt click More info, then Run anyway.",
  },
  {
    os: "linux",
    name: "Chronicle-Sidekick-linux-amd64.tar.gz",
    label: "Linux",
    platform: "64-bit",
    tray: "Your system tray",
    install:
      "Extract the archive and run Chronicle Sidekick. The stone appears in your system tray. That is the whole install.",
    note: "Some desktops hide tray icons by default. If you don't see the stone, enable tray or AppIndicator icons in your desktop settings.",
  },
];

function detectOS(ua: string = navigator.userAgent): OS {
  if (/Windows/i.test(ua)) return "windows";
  if (/Mac/i.test(ua) && !/iPhone|iPad/i.test(ua)) return "mac";
  if (/Linux/i.test(ua) && !/Android/i.test(ua)) return "linux";
  return "mac";
}

interface GHAsset {
  name: string;
  size: number;
  browser_download_url: string;
}

async function latestUploaderRelease() {
  const res = await fetch(API_URL, { headers: { Accept: "application/vnd.github+json" } });
  if (!res.ok) throw new Error("Could not load releases.");
  const releases = (await res.json()) as {
    tag_name: string;
    draft: boolean;
    prerelease: boolean;
    assets: GHAsset[];
  }[];
  return releases.find((r) => !r.draft && !r.prerelease && r.tag_name.startsWith("v")) ?? null;
}

const STATES = [
  { color: "#8a8f98", text: "Waiting for WoW" },
  { color: "#e5484d", text: "Not logging, type /combatlog" },
  { color: "#f97316", text: "Logging, waiting for a fight" },
  { color: "#22c55e", text: "Recording" },
  { color: "#3b82f6", text: "Uploading" },
  { color: "#f2c12e", text: "Needs reconnect" },
];

const NIGHT = [
  { time: "19:45", color: "#8a8f98", label: "grey spiral", text: "Waiting for WoW to open." },
  { time: "19:58", color: "#e5484d", label: "red spiral", text: "You're in. Not logging yet: type /combatlog." },
  { time: "20:02", color: "#22c55e", label: "green spiral", text: "First pull. Recording every hit, heal and death." },
  { time: "23:10", color: "#3b82f6", label: "blue spiral", text: "You log out. The stone uploads the night by itself." },
];

function Rise({ n, className = "", children }: { n: number; className?: string; children: React.ReactNode }) {
  return <div className={`${s.rise} ${s[`d${n}`]} ${className}`}>{children}</div>;
}

export function DownloadPage({ os }: { os?: OS }) {
  const release = useQuery({ queryKey: ["uploader-release"], queryFn: latestUploaderRelease, staleTime: 5 * 60_000 });
  const current = ASSETS.find((a) => a.os === (os ?? detectOS())) ?? ASSETS[0];
  const others = ASSETS.filter((a) => a !== current);
  const found = release.data ?? null;
  const missing = release.isError || (release.isSuccess && !found);
  const asset = (a: Asset) => found?.assets.find((x) => x.name === a.name);
  const primary = asset(current);
  const href = (a: Asset) => asset(a)?.browser_download_url ?? RELEASES_URL;

  const metaParts: string[] = [];
  if (found && primary) {
    metaParts.push(found.tag_name);
    metaParts.push(`${Math.round(primary.size / 1e6)} MB`);
  }
  metaParts.push(current.platform);

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

      <header className={`${s.wrap} ${s.header}`}>
        <Link to="/" className={`${s.brand} ${s.serif}`}>
          <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#e6b450" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19V5l8 7 8-7v14" />
          </svg>
          Chronicle
        </Link>
        <nav className={s.nav}>
          <Link to="/logs">Logs</Link>
          <Link to="/upload">Upload</Link>
          <Link to="/download" className={s.current} aria-current="page">
            Download
          </Link>
        </nav>
      </header>

      <section className={`${s.wrap} ${s.hero}`}>
        <div className={`${s.rise} ${s.d1} ${s.heroStone}`}>
          <Stone size={260} swirl="#22c55e" swirlClassName={s.swirl} label="Chronicle Sidekick icon: a grey stone with a green spiral" />
        </div>
        <div className={s.heroText}>
          <p className={`${s.rise} ${s.d2} ${s.eyebrow}`}>Chronicle Sidekick</p>
          <h1 className={`${s.rise} ${s.d2} ${s.serif} ${s.h1}`}>
            Install once.
            <br />
            Every raid uploads itself.
          </h1>
          <p className={`${s.rise} ${s.d3} ${s.intro}`}>
            A tiny app that sits in your menu bar, watches your combat log while you play, and sends it to Chronicle the
            moment you log out. No dragging files around. Nothing to remember.
          </p>
          <div className={`${s.rise} ${s.d4} ${s.ctaBlock}`}>
            <a href={primary ? href(current) : RELEASES_URL} className={s.cta}>
              <DownloadIcon className={s.arrow} size={22} strokeWidth={2.6} aria-hidden="true" />
              Download for {current.label}
            </a>
            <div className={s.meta}>
              <span>
                {missing ? "No release found yet. Browse them on GitHub." : metaParts.join(" · ")}
              </span>
              <span>
                Also for <a href={href(others[0])}>{others[0].label}</a> and <a href={href(others[1])}>{others[1].label}</a>
              </span>
            </div>
          </div>
        </div>
      </section>

      <Rise n={5} className={`${s.wrap} ${s.how}`}>
        <div className={s.howItem}>
          <PanelTop size={28} color="#e6b450" strokeWidth={1.8} aria-hidden="true" />
          <span><strong>Sits in your menu bar.</strong> Quiet. No window.</span>
        </div>
        <div className={s.howItem}>
          <Eye size={28} color="#e6b450" strokeWidth={1.8} aria-hidden="true" />
          <span><strong>Watches the log while you play.</strong> Uses nothing.</span>
        </div>
        <div className={s.howItem}>
          <UploadIcon size={28} color="#e6b450" strokeWidth={1.8} aria-hidden="true" />
          <span><strong>Uploads when you log out.</strong> Report's ready before you are.</span>
        </div>
      </Rise>

      <Rise n={6} className={`${s.wrap} ${s.steps}`}>
        <h2 className={`${s.serif} ${s.h2}`}>Three steps, then never again</h2>
        <div className={s.stepGrid}>
          <div className={s.card}>
            <div className={s.shot}>
              <div className={s.shotLabel}>{current.tray}</div>
              <div className={s.bar}>
                <Stone size={22} mono swirl="#8a8f98" label="Chronicle stone in the menu bar, grey spiral: waiting for WoW" />
                <Wifi size={16} color="#f3f4f6" aria-hidden="true" />
                <BatteryFull size={18} color="#f3f4f6" aria-hidden="true" />
                <span>Wed 20:41</span>
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
                <div className={s.dim}>Waiting for WoW.</div>
                <div className={s.sep} />
                <div>Upload now</div>
                <div className={s.hot}>Connect to Chronicle…</div>
                <div className={s.sep} />
                <div className={s.dim}>Quit</div>
              </div>
            </div>
            <div className={s.stepHead}>
              <span className={`${s.serif} ${s.num}`}>2</span>
              <h3 className={s.h3}>Connect it to your account</h3>
            </div>
            <p className={s.stepBody}>
              Click the stone and choose <strong>Connect to Chronicle</strong>. Your browser opens on Chronicle, you press{" "}
              <strong>Approve</strong>, and the two are paired for good. No passwords typed into the app, ever.
            </p>
          </div>

          <div className={s.card}>
            <div className={s.shot} style={{ gap: 8 }}>
              <div className={s.shotLabel}>In-game chat</div>
              <div className={s.chat}>
                <div style={{ color: "#40ff40" }}>[Guild] Thrallina: pull in 2</div>
                <div style={{ color: "#ffff00" }}>Combat logging enabled.</div>
                <div className={s.chatInput}>
                  <span style={{ color: "#9a8d7b", marginRight: 6 }}>Say:</span>/combatlog
                  <span aria-hidden="true" className={s.cursor} />
                </div>
              </div>
            </div>
            <div className={s.stepHead}>
              <span className={`${s.serif} ${s.num}`}>3</span>
              <h3 className={s.h3}>Tell WoW to write a log</h3>
            </div>
            <p className={s.stepBody}>
              Inside the game, click the chat box, type <code>/combatlog</code> and press Enter, the same way you'd type{" "}
              <code>/dance</code>. WoW replies "Combat logging enabled." Do it once per session; the stone turns green on
              your first swing.
            </p>
          </div>
        </div>
      </Rise>

      <Rise n={7} className={`${s.wrap} ${s.night}`}>
        <h2 className={`${s.serif} ${s.h2}`}>One raid night, as the stone sees it</h2>
        <div className={s.stations}>
          <div aria-hidden="true" className={s.track} />
          {NIGHT.map((n) => (
            <div key={n.time} className={s.station}>
              <div className={s.dot}>
                <Stone size={36} mono swirl={n.color} label={n.label} />
              </div>
              <div className={s.time}>{n.time}</div>
              <div className={s.what}>{n.text}</div>
            </div>
          ))}
          <div className={s.station}>
            <div className={`${s.dot} ${s.dotHot}`}>
              <svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#1b1714" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19V5l8 7 8-7v14" />
              </svg>
            </div>
            <div className={s.time}>23:11</div>
            <div className={s.what}>A notification with your report. Go argue about parses.</div>
          </div>
        </div>
      </Rise>

      <section className={`${s.wrap} ${s.legend}`}>
        <h2 className={s.h2s}>What the spiral colour means</h2>
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
          <li><Check size={16} color="#e6b450" strokeWidth={2.5} aria-hidden="true" />Uses nothing while you play.</li>
          <li>
            <Check size={16} color="#e6b450" strokeWidth={2.5} aria-hidden="true" />
            <span><a href="https://github.com/Emyrk/chronicle">Open source</a>, like the rest of Chronicle.</span>
          </li>
        </ul>
        <p>
          Prefer to upload by hand? <Link to="/upload">Use the upload page.</Link>
        </p>
      </section>
    </div>
  );
}
