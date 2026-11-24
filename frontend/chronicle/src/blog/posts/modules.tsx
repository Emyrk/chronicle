import type { ReactNode } from "react";
import { ArrowDown, ExternalLink, Hammer, Star, type LucideIcon } from "lucide-react";
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

// Creator step heading with a large number hanging in the left margin on wide screens.
function Step({ n, children }: { n: string; children: ReactNode }) {
  return (
    <h3 className="relative">
      <span
        aria-hidden
        className="absolute right-full top-1/2 mr-8 hidden -translate-y-1/2 font-mono text-5xl font-bold text-violet-300/25 xl:block"
      >
        {n}
      </span>
      {children}
    </h3>
  );
}

const AUDIENCES = {
  raiders: { icon: Star, color: "#fcd34d", label: "For raiders", title: "Use modules on your raids" },
  creators: { icon: Hammer, color: "#c4b5fd", label: "For creators", title: "Make your own and share it" },
} satisfies Record<string, { icon: LucideIcon; color: string; label: string; title: string }>;

type Audience = keyof typeof AUDIENCES;

// Two cards under the intro that jump to each audience's part.
function AudienceLinks() {
  return (
    <div className="not-prose my-8 grid gap-3 sm:grid-cols-2">
      {(Object.keys(AUDIENCES) as Audience[]).map((id) => {
        const { icon: Icon, color, label, title } = AUDIENCES[id];
        return (
          <a
            key={id}
            href={`#${id}`}
            className="group flex items-center gap-3 rounded-lg border bg-white/[0.03] p-4 transition-colors hover:bg-white/[0.06]"
            style={{ borderColor: `${color}40` }}
          >
            <Icon className="size-5 shrink-0" style={{ color }} />
            <span className="flex-1">
              <span className="block font-mono text-xs uppercase tracking-wider" style={{ color }}>
                {label}
              </span>
              <span className="block text-sm text-foreground">{title}</span>
            </span>
            <ArrowDown className="size-4 text-muted-foreground transition-transform group-hover:translate-y-0.5" />
          </a>
        );
      })}
    </div>
  );
}

// Banner that opens each audience's part. It is wider than the text column on large screens.
function Part({ id }: { id: Audience }) {
  const { icon: Icon, color, label, title } = AUDIENCES[id];
  return (
    <div
      id={id}
      className="not-prose mb-6 mt-14 scroll-mt-24 rounded-xl border-l-4 px-5 py-5 lg:-mx-10"
      style={{ borderColor: color, background: `linear-gradient(90deg, ${color}1f, transparent 85%)` }}
    >
      <p className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-[0.2em]" style={{ color }}>
        <Icon className="size-4" />
        {label}
      </p>
      <h2 className="mt-1 font-wow text-3xl text-foreground">{title}</h2>
    </div>
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
            <a href="/modules/chronicle/radardurability" className="block break-all text-[#00a8fc] hover:underline">
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
      <AudienceLinks />

      <Part id="raiders" />
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
      <p>Got a module link from your guild? Open it and press Track.</p>

      <Part id="creators" />
      <Step n="01">Get access</Step>
      <p>
        Making modules is a <ReveredBadge /> perk.
      </p>
      <AccessCallout />
      <ol>
        <li>Claim an author name. It&apos;s public and permanent.</li>
        <li>Build it in the Module Workshop.</li>
        <li>Tag a release. Now anyone can track it.</li>
      </ol>

      <Step n="02">Build it with Claude Code</Step>
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

      <Step n="03">Share it</Step>
      <p>
        Every module has a link, like <code className={code}>/modules/you/raidradar</code>. Post it in your guild&apos;s
        Discord. Anyone who opens it can track it. Each release you tag reaches them on their next raid.
      </p>
      <SharedInDiscord />
      <p>Need data or a widget that doesn&apos;t exist yet? Ask in the Discord.</p>
    </ShortPost>
  );
}
