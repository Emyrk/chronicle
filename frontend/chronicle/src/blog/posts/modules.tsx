import type { BlogPostDefinition } from "../blogRegistry";
import { ShortPost } from "./ShortPost";

type PostProps = { post: BlogPostDefinition };

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

      <h2>Build your own</h2>
      <p>Making modules is a Revered perk. Getting started takes three steps:</p>
      <ul>
        <li>
          <strong>Claim your author name.</strong> It is the first part of your module links. It is public, and it
          can&apos;t change later.
        </li>
        <li>
          <strong>Build in the Module Workshop.</strong> Write a sandboxed Lua panel with the assistant&apos;s help, and
          try it on real raid logs as you go.
        </li>
        <li>
          <strong>Tag a release.</strong> Save your work to main while it&apos;s in progress. Tag a release when it&apos;s
          ready, and everyone can track it.
        </li>
      </ul>
      <p>
        The <a href="/modules/api">API reference</a> covers everything a module can read and draw. If your module
        needs data or a widget that isn&apos;t there yet, ask for it.
      </p>
    </ShortPost>
  );
}
