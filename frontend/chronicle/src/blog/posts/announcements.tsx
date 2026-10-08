import { AbsorbAttributionDetails } from "@/pages/ClassDetails/AbsorbAttributionDetails";
import type { BlogPostDefinition } from "../blogRegistry";
import { blogPostLink } from "../trackedLinks";
import { ShortPost } from "./ShortPost";

// Short posts carried over from the Discord announcements channel.

type PostProps = { post: BlogPostDefinition };

export function AbsorbAttributionPost({ post }: PostProps) {
  return (
    <ShortPost post={post}>
      <p>
        Chronicle now <strong>guesses</strong> absorption attribution from the logs. This value is counted as
        "Effective Healing".
      </p>
      <figure>
        <img
          src="/c/images/blog/absorbs.webp"
          alt="Healing Done breakdown with an Absorbed column crediting a shield with 1,104 absorbed healing"
          width={614}
          height={316}
          className="rounded-md border border-border"
        />
        <figcaption>Absorbs appear in their own column of the Healing Done breakdown.</figcaption>
      </figure>
      <div className="not-prose">
        <AbsorbAttributionDetails generic />
      </div>
    </ShortPost>
  );
}

export function ParsingPost({ post }: PostProps) {
  return (
    <ShortPost post={post}>
      <p>
        "Parsing" has arrived. The goal of this metric is to give players a gauge of their performance for their given
        spec on selected encounters. The servers Chronicle serves have much lower populations, so the math might be
        slightly different than you are used to.
      </p>
      <p>
        You can read about how parse scores are calculated on the <a href="/parsing">parsing page</a>.
      </p>
      <p>
        Like many features, this applies to logs going forward. More views for seeing parses and player performance over
        time will be added. Today, parses can only be viewed on an instance page, and only if there is sufficient player
        data.
      </p>
    </ShortPost>
  );
}

export function TalentBuilderRefreshPost({ post }: PostProps) {
  return (
    <ShortPost post={post}>
      <p>
        The <a href="/talents">talent builder</a> page started to gain some traction, so I decided to give it some
        love.
      </p>
      <ul>
        <li>You can now <strong>save builds to your account</strong> and load them back at any time</li>
        <li><strong>Mobile</strong> friendly usage</li>
        <li>View <strong>Top Builds</strong> on your server (desktop only)</li>
        <li>View <strong>Talent Popularity</strong> of the top results for a given spec (desktop only)</li>
        <li>
          Some UX improvements:
          <ul>
            <li><kbd>Ctrl</kbd> + left/right click fills or empties a talent. No need to click 5 times.</li>
            <li>The tree can be "locked".</li>
          </ul>
        </li>
      </ul>
      <h2>Talent Popularity</h2>
      <p>
        This looks at the talents for the top 10 performances of a given spec and overlays them on the talent builder.
        It helps identify the "golden path", and which talents are more personal preference.
      </p>
      <p><strong>Please share your feedback!</strong></p>
    </ShortPost>
  );
}

export function ArmoryRefreshPost({ post }: PostProps) {
  return (
    <ShortPost post={post}>
      <p>
        Player <a href="/armory">armory</a> pages just got a lot more interesting. Take a look!
      </p>
    </ShortPost>
  );
}

export function GuildPagesPost({ post }: PostProps) {
  return (
    <ShortPost post={post}>
      <p>
        If you are a <strong>Guild Leader</strong> or <strong>Raid Leader</strong> and want to start experimenting with
        custom guild pages, send me a message on Discord.
      </p>
      <p>
        It is very early, but guilds can customize what is on their guild page.{" "}
        <a href={blogPostLink(post.id, "https://capy.chronicleclassic.com/g/6e6d906e-b362-41ab-8e60-4579523ce4f9")}>Here is an example</a>.
      </p>
      <p>Happy to take requests to build the pages y'all want to see.</p>
    </ShortPost>
  );
}

export function ConsumablesPost({ post }: PostProps) {
  return (
    <ShortPost post={post}>
      <p>
        Check out the new <strong>Consumables Used</strong> panel. Refer to the explainer for how to use all the
        options!
      </p>
      <p>
        <a href={blogPostLink(post.id, "https://octo.chronicleclassic.com/instances/qwp9bgWbfKPbKHkF?explain=consumables_ledger")}>
          See the explainer on an example raid
        </a>
        .
      </p>
    </ShortPost>
  );
}

export function VehicleSupportPost({ post }: PostProps) {
  return (
    <ShortPost post={post}>
      <p>
        If you are playing on 3.3.5a, please <strong>update your addon to version 0.7 or newer</strong>.
      </p>
      <p>
        <strong>Vehicle support</strong> has been added to the addon to handle raids like Eye of Eternity and Ulduar.
      </p>
      <p>
        A new <a href={blogPostLink(post.id, "https://chromie.chronicleclassic.com/s/qKE68sHB")}>Vehicles</a> panel has been added. All vehicles
        are treated as "pets" in terms of damage credit. Let me know if you see any issues!
      </p>
    </ShortPost>
  );
}

export function YoutubeSyncPost({ post }: PostProps) {
  return (
    <ShortPost post={post}>
      <p>
        If you record VODs of your raids, the YouTube sync feature got a refresh at{" "}
        <a href="/youtube-sync-v3"><code>/youtube-sync-v3</code></a>. I will make this tool more discoverable soon.
      </p>
      <p>
        <a href={blogPostLink(post.id, "https://chromie.chronicleclassic.com/s/WSEWPRTW")}>Here is a live example</a> from one of our community
        raiders.
      </p>
    </ShortPost>
  );
}

export function PhaseSelectionsPost({ post }: PostProps) {
  return (
    <ShortPost post={post}>
      <p>
        Bosses with multiple phases now have those phases explicitly marked, so you can jump straight to the part of
        the fight you care about.
      </p>
    </ShortPost>
  );
}

export function GearProgressionPost({ post }: PostProps) {
  return (
    <ShortPost post={post}>
      <p>
        First release of a way to share gear lists via Chronicle. Browse and build lists on the{" "}
        <a href="/gear">gear page</a>.
      </p>
      <p>
        <a href={blogPostLink(post.id, "https://chromie.chronicleclassic.com/gear/progression/1842f136-7e45-4609-87b7-4d2f8ebb573b?profile=c7b747cf-e5b9-4ecb-97db-1b57e45cdb9e&char=ChromieCraft%3APeepovanish")}>
          Here is an example
        </a>{" "}
        with a player loaded from the Armory to view their progression against the list.
      </p>
      <h2>Why build this?</h2>
      <p>
        Chronicle serves many WoW communities. Many of these have custom content (gear, bosses, quests, etc.), which
        prevents them from using many of the existing tools built for the common expansions.
      </p>
    </ShortPost>
  );
}

export function ConsumablePricingPost({ post }: PostProps) {
  return (
    <ShortPost post={post}>
      <p>
        The creator of <a href="https://www.wowauctions.net/">WoWAuctions.net</a> has generously given Chronicle API
        access to pricing data for the Capy and ChromieCraft servers.
      </p>
      <p>The consumables panels now show pricing data for these servers!</p>
      <p><em>That pull was expensive!</em></p>
    </ShortPost>
  );
}

export function CommunitySupportPost({ post }: PostProps) {
  return (
    <ShortPost post={post}>
      <p>
        With Chronicle's growing success has come more usage, and with more usage, higher server costs. Those costs are
        starting to outpace what I can reasonably cover on my own.
      </p>
      <p>
        Chronicle is <strong>free to use, ad-free, and paywall-free</strong>. It is a not-for-profit project with a goal
        of breaking even on the costs of running it.
      </p>
      <p>
        If you have found Chronicle useful, please take a minute to check out the{" "}
        <a href={blogPostLink(post.id, "https://chronicleclassic.com/support")}>support page</a>. There is no expectation to contribute, but I
        would appreciate <strong>everyone at least giving it a look</strong>.
      </p>
      <p>
        No pressure. Using Chronicle, sharing it with your guild, reporting bugs, and sending feedback all benefit the
        project.
      </p>
      <p>
        There are currently no features, flair, or other benefits locked behind supporting Chronicle, and I would like to
        keep it that way. I would much rather spend development time building features that everyone can enjoy.
      </p>
      <p>
        <em>
          You may see a support banner on the site occasionally. It is there as a reminder that Chronicle depends on
          community support, but feel free to dismiss it and carry on.
        </em>
      </p>
    </ShortPost>
  );
}

export function FavoritesPost({ post }: PostProps) {
  return (
    <ShortPost post={post}>
      <p>
        Armory pages for players and guilds now have a "Favorite" button. Your favorite players and guilds are listed in
        the site settings menu for quick navigation.
      </p>
      <p>Shout out to the community member who came up with the idea and essentially the design ❤️</p>
    </ShortPost>
  );
}

export function HistoricalPerformancePost({ post }: PostProps) {
  return (
    <ShortPost post={post}>
      <p>
        Work towards comparing historical performance between players is here, and will evolve over time. Compare your
        DPS/HPS growth to yourself, or to your friends, guildies, and rivals.
      </p>
      <p>
        Find this at <strong>Explore &gt; Performance</strong>.{" "}
        <a href={blogPostLink(post.id, "https://capy.chronicleclassic.com/performance-history?realm=Eversong+Wilds&player=0x000000000000D272&player=0x00000000001889C1&spec=&spec=&subspec=&subspec=&instance=Molten+Core")}>
          See an example
        </a>
        .
      </p>
      <p><em>This page is subject to change based on feedback.</em></p>
    </ShortPost>
  );
}

export function CooldownUsagePost({ post }: PostProps) {
  return (
    <ShortPost post={post}>
      <p>
        I am still working on more features behind the scenes, ultimately working towards a consumable and class cooldown
        view of your raids. <strong>Cooldown Usage</strong> is the latest panel in that direction.
      </p>
      <p>
        Please let me know if you see any issues or bugs. All spells are <em>manually</em> curated, so let me know if I
        am missing something or should omit anything.
      </p>
    </ShortPost>
  );
}

export function CustomPanelsPost({ post }: PostProps) {
  return (
    <ShortPost post={post}>
      <p>
        This opens Chronicle up to community-built tools and entirely new ways to explore combat logs, without waiting
        for every idea to become part of the core site.
      </p>
      <ul>
        <li>Class or encounter-specific analysis</li>
        <li>Custom damage, healing, buff, and mechanic breakdowns</li>
        <li>Raid assignments and performance checks</li>
        <li>New charts, tables, timelines, and floating detail windows</li>
        <li>Experimental tools tailored to your guild or playstyle</li>
        <li>Community-created ideas that can be shared through GitHub and installed directly in Chronicle</li>
      </ul>
      <p>
        🎥 <a href="https://www.youtube.com/watch?v=XQZ6K3rGTrU">Introduction video</a>
        <br />
        🛠️ <a href="https://github.com/Emyrk/chronicle-panel">Example panels and authoring guide</a>
      </p>
      <p>
        This is meant to be a highly collaborative feature. If there is data, an API, or another capability your panel
        needs, send me a request. I can keep iterating on the platform based on what people want to build!
      </p>
    </ShortPost>
  );
}
