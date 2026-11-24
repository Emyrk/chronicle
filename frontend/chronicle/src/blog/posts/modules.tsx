import type { ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import { DiscordIcon } from "@/components/icons/DiscordIcon";
import { iconUrl } from "@/config/iconUrl";
import { TIER_COLOR, TIER_ICON } from "@/pages/Settings/billingPricing";
import type { BlogPostDefinition } from "../blogRegistry";
import { ShortPost } from "./ShortPost";

type PostProps = { post: BlogPostDefinition };

const DISCORD_URL = "https://discord.gg/gz97ABFVAj";

function ReveredBadge() {
  const color = TIER_COLOR.revered;
  return (
    <span
      className="not-prose inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 align-middle text-sm font-semibold"
      style={{ borderColor: `${color}80`, backgroundColor: `${color}1f`, color }}
    >
      <img src={iconUrl(TIER_ICON.revered)} alt="" width={16} height={16} className="h-4 w-4 rounded-sm" />
      Revered
    </span>
  );
}

// Module creation is granted by hand too, so non-supporters can ask for it.
function AccessCallout() {
  return (
    <div className="not-prose my-6 flex flex-col gap-3 rounded-lg border border-[#5865F2]/40 bg-[#5865F2]/10 p-4 sm:flex-row sm:items-center">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#5865F2] text-white">
        <DiscordIcon className="size-5" />
      </div>
      <div className="flex-1">
        <p className="text-sm font-semibold text-foreground">Not Revered? Ask me.</p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Message me on Discord. I&apos;ll give you module create access.
        </p>
      </div>
      <a
        href={DISCORD_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-md bg-[#5865F2] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#4752C4] sm:self-auto"
      >
        Join Discord
        <ExternalLink className="size-3.5" />
      </a>
    </div>
  );
}

const code = "before:content-none after:content-none";

// Section heading with a large number hanging in the left margin on wide screens.
function Step({ n, children }: { n: string; children: ReactNode }) {
  return (
    <h2 className="relative">
      <span
        aria-hidden
        className="absolute right-full top-1/2 mr-8 hidden -translate-y-1/2 font-mono text-6xl font-bold text-quality-legendary/25 xl:block"
      >
        {n}
      </span>
      {children}
    </h2>
  );
}

// Breaks out of the text column on wide screens.
function RadarFigure() {
  return (
    <figure className="not-prose relative isolate my-12 lg:-mx-24 xl:-mx-44">
      <div
        aria-hidden
        className="absolute -inset-10 -z-10 rounded-full bg-[radial-gradient(closest-side,rgba(255,128,0,0.18),transparent)] blur-2xl"
      />
      <img
        src="/c/images/blog/modules-radar.webp"
        alt="RadarDurability next to Damage Done on a Nefarian kill, replaying the fight with the playhead"
        width={2108}
        height={1037}
        loading="lazy"
        className="w-full rounded-xl border border-white/10 shadow-[0_30px_80px_rgba(0,0,0,0.55)]"
      />
      <figcaption className="mt-3 text-sm text-muted-foreground lg:px-24 xl:px-44">
        RadarDurability on a Nefarian kill. Closer to the centre means closer to dying.
      </figcaption>
    </figure>
  );
}

// A guild Discord post sharing a module, offset to the right on wide screens.
function SharedInDiscord() {
  return (
    <div className="not-prose my-10 rounded-xl border border-white/10 bg-[#313338] p-4 shadow-[0_20px_50px_rgba(0,0,0,0.45)] xl:-mr-44 xl:ml-24 xl:rotate-[0.6deg]">
      <div className="flex gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-quality-legendary/80 font-semibold text-black">
          R
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm">
            <span className="font-semibold text-[#f0b232]">Raid Leader</span>
            <span className="ml-2 text-xs text-[#949ba4]">Today at 7:42 PM</span>
          </p>
          <p className="mt-0.5 text-[15px] text-[#dbdee1]">
            Track this before tonight. It shows who nearly died on every pull.{" "}
            <a href="/modules/chronicle/radardurability" className="break-all text-[#00a8fc] hover:underline">
              chronicleclassic.com/modules/chronicle/radardurability
            </a>
          </p>
          <div className="mt-2 max-w-md rounded border-l-4 border-[#5865F2] bg-[#2b2d31] p-3">
            <p className="text-xs text-[#949ba4]">Chronicle module · by chronicle</p>
            <p className="mt-1 font-semibold text-[#00a8fc]">RadarDurability</p>
            <p className="mt-1 text-sm text-[#dbdee1]">
              The raid as a radar, replayed from the log: who was close to dying, and when.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ModulesPost({ post }: PostProps) {
  return (
    <ShortPost post={post}>
      <p>
        <a href="/modules">Modules</a> are addons for Chronicle. Players write them in Lua. They add panels to your raids.
      </p>

      <Step n="01">Use one</Step>
      <ol>
        <li>
          Open <a href="/modules">/modules</a>.
        </li>
        <li>
          Pick a module. Press <strong>Track</strong>.
        </li>
        <li>
          Open a raid. Add it from <strong>Modules</strong> in the panel picker.
        </li>
      </ol>
      <p>
        Example: <a href="/modules/chronicle/radardurability">RadarDurability</a> shows who was close to dying, and
        when. It plays along with the replay.
      </p>
      <RadarFigure />

      <Step n="02">Make one</Step>
      <p>
        You can make your own. It&apos;s a <ReveredBadge /> perk.
      </p>
      <AccessCallout />
      <ol>
        <li>Claim an author name. It&apos;s public and permanent.</li>
        <li>Build it in the Module Workshop.</li>
        <li>Tag a release. Now anyone can track it.</li>
      </ol>

      <Step n="03">Build it with Claude Code</Step>
      <p>Claude Code is the officially supported way to build. It connects through Chronicle&apos;s MCP. Linux and macOS.</p>
      <pre>
        <code>{"claude plugin marketplace add Emyrk/chronicle-mcp\nclaude plugin install chronicle@chronicle-plugins"}</code>
      </pre>
      <ol>
        <li>
          Run <code className={code}>/chronicle:setup</code> once.
        </li>
        <li>
          In the Workshop, click <strong>Connect agent</strong>.
        </li>
        <li>
          Run <code className={code}>/chronicle:connect</code>. Tell Claude what to build.
        </li>
      </ol>
      <p>
        Claude saves to main. You tag releases. Other MCP clients work too. See the{" "}
        <a href="/modules/api">API reference</a>.
      </p>

      <Step n="04">Share it</Step>
      <p>
        Every module has a link, like <code className={code}>/modules/you/raidradar</code>. Post it in your guild&apos;s
        Discord. Anyone who opens it can track it. Each release you tag reaches them on their next raid.
      </p>
      <SharedInDiscord />
      <p>Need data or a widget that doesn&apos;t exist yet? Ask in the Discord.</p>
    </ShortPost>
  );
}
