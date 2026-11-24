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

export function ModulesPost({ post }: PostProps) {
  return (
    <ShortPost post={post}>
      <p>
        <a href="/modules">Modules</a> are addons for Chronicle. Players write them in Lua. They add panels to your raids.
      </p>

      <h2>Use one</h2>
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

      <h2>Make one</h2>
      <p>
        You can make your own. It&apos;s a <ReveredBadge /> perk.
      </p>
      <AccessCallout />
      <ol>
        <li>Claim an author name. It&apos;s public and permanent.</li>
        <li>Build it in the Module Workshop.</li>
        <li>Tag a release. Now anyone can track it.</li>
      </ol>

      <h2>Build it with Claude Code</h2>
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

      <h2>Share it</h2>
      <p>
        Every module has a link, like <code className={code}>/modules/you/raidradar</code>. Post it in your guild&apos;s
        Discord. Anyone who opens it can track it. Each release you tag reaches them on their next raid.
      </p>
      <p>Need data or a widget that doesn&apos;t exist yet? Ask in the Discord.</p>
    </ShortPost>
  );
}
