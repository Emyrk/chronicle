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
        <p className="text-sm font-semibold text-foreground">Not Revered? You can still build one.</p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Message me on Discord with what you want to make, and I&apos;ll turn on module access for you.
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

export function ModulesPost({ post }: PostProps) {
  return (
    <ShortPost post={post}>
      <p>
        <a href="/modules">Modules</a> are raid panels for Chronicle, written in Lua by the community. Find one you like,
        track it, and it sits beside Damage Done and the rest of your panels on every raid.
      </p>

      <h2>Track a module</h2>
      <ul>
        <li>
          Browse the gallery at <a href="/modules">/modules</a>. Each module has its own page with a README, the data it
          reads, how it handles the replay, and its releases.
        </li>
        <li>
          Press <strong>Track</strong>. The module shows up under <strong>Modules</strong> in the instance panel
          picker, so you can add it to any raid.
        </li>
        <li>
          When the author tags a new release, panels running the module pick it up on their next load.
        </li>
      </ul>

      <h2>An example: RadarDurability</h2>
      <p>
        <a href="/modules/chronicle/radardurability">RadarDurability</a> draws the raid as a radar, replayed from the
        log: who was close to dying, and when. Every player sits round the circle, and their distance from the centre is
        how many seconds of safety they had left. Mobs sit on the outer ring with a line to whoever they are hitting,
        heals are green lines from the healer, and a red cross marks a death. Turn on <strong>Replay</strong> and it
        plays along with the playhead, or press <strong>Worst moment</strong> to jump to where the raid came closest to
        wiping.
      </p>

      <h2>Now make your own</h2>
      <p>
        Ever finished a wipe wishing Chronicle had a panel for that? Who stood in the fire. Who forgot their Greater
        Fire Protection. Whose Tranquilizing Shot missed the frenzy. You can build it, and your whole guild can use it.
      </p>
      <p>
        Making modules is a <ReveredBadge /> perk, and it&apos;s also yours if you ask.
      </p>
      <AccessCallout />
      <p>Getting started takes three steps:</p>
      <ul>
        <li>
          <strong>Claim your author name.</strong> It is the first part of your module links. It is public, and it
          can&apos;t change later.
        </li>
        <li>
          <strong>Build in the Module Workshop.</strong> Connect your AI agent, or use the in-browser assistant, and try
          your panel on real raid logs as you go.
        </li>
        <li>
          <strong>Tag a release.</strong> Save your work to main while it&apos;s in progress. Tag a release when it&apos;s
          ready, and it&apos;s live for everyone.
        </li>
      </ul>

      <h2>Build with Claude Code</h2>
      <p>
        The officially supported way to build a module is <strong>Claude Code</strong>, through Chronicle&apos;s MCP
        server. Claude edits the module in your open Workshop tab, previews it on real raids and saves it to main.
        Releases stay with you. Install the plugin from Chronicle&apos;s marketplace (Linux and macOS):
      </p>
      <pre>
        <code>{"claude plugin marketplace add Emyrk/chronicle-mcp\nclaude plugin install chronicle@chronicle-plugins"}</code>
      </pre>
      <ol>
        <li>
          In Claude Code, run <code className="before:content-none after:content-none">/chronicle:setup</code> once to start the local relay.
        </li>
        <li>
          Open your module in the Workshop and click <strong>Connect agent</strong>.
        </li>
        <li>
          Run <code className="before:content-none after:content-none">/chronicle:connect</code>, pick the tab, and tell Claude what the panel should do.
        </li>
      </ol>
      <p>
        Claude is the first client we support officially, but other MCP clients that support Streamable HTTP can
        connect too. The <a href="/modules/api">API reference</a> has the full setup, other clients and
        troubleshooting.
      </p>

      <h2>Share it</h2>
      <p>
        Every module has its own page, like <code className="before:content-none after:content-none">/modules/you/raidradar</code>.
        Drop the link in your guild&apos;s Discord. Anyone who opens it can read the README and press{" "}
        <strong>Track</strong>, and every release you tag reaches them on their next raid. Want help building it? Add
        your guildmates as contributors.
      </p>
      <p>
        Built something you&apos;re proud of? Show it off in the Discord. If your module needs data or a widget that
        isn&apos;t there yet, ask for it there too.
      </p>
    </ShortPost>
  );
}
