import type { BlogPostDefinition } from "../blogRegistry";
import { SHARE_IMAGE_EXAMPLES, shareImagePath } from "../videos/shareImagesData";
import { ShortPost } from "./ShortPost";

export function ShareImagesPost({ post }: { post: BlogPostDefinition }) {
  return (
    <ShortPost post={post}>
      <p>
        <strong>Note:</strong> These share cards are evolving. Their designs and the information
        they display are subject to change.
      </p>
      <p>
        A raid link should tell a story before anyone opens it. Chronicle now gives shared links
        their own preview images, so your guild chat can see the night, the kill or the build you
        are talking about. No screenshot cropping required.
      </p>
      <p>
        Paste a Chronicle link into a conversation that supports link previews, such as Discord.
        The destination decides the card. These are Open Graph images: a quick introduction to
        the page, not a replacement for the full report.
      </p>
      <h2>Share the night, or just the kill</h2>
      <p>
        A raid report brings together boss progress, duration, top damage and healing, and
        kill-time parses. Those parses compare each boss kill against the server, with their
        average on the card. They are not an average of the players&apos; performance parses.
      </p>
      <p>
        A qualifying speedrun with a server clear-time parse of at least 90 gets a fast-clear
        card instead, putting the clear time and boss splits front and center.
      </p>
      <p>
        Want to celebrate one fight? Create a share link with one boss kill selected. Its card
        shows the kill time, top DPS and top HPS for that fight. Selecting a player does not turn
        it into a personal parse card.
      </p>
      <h2>A face for the rest of your links</h2>
      <ul>
        <li><strong>Guilds:</strong> logged progression gives a guild link its story. Without
          recognized progression kills, the activity fallback shows estimated raid nights.
          These cards do not list players or combine their scores.</li>
        <li><strong>Armory:</strong> character history, including available gear and log-history
          details. This is not a character performance or ranking card.</li>
        <li><strong>Talents:</strong> share the URL with your build in it to show the class,
          inferred spec and points per tree. An empty calculator has a class card too.</li>
      </ul>
      <h2>See the cards</h2>
      <p>These examples come from Chronicle&apos;s actual image renderer with illustrative fixture
        data. They are not live player records. Your card reflects the information available
        for the page you share.</p>
      {SHARE_IMAGE_EXAMPLES.map((example) => (
        <figure key={example.id}>
          <img src={shareImagePath(example.id)} alt={example.alt} width={1200} height={630}
            loading="lazy" className="rounded-lg border border-border" />
          <figcaption><strong>{example.title}</strong> {example.caption}</figcaption>
        </figure>
      ))}
      <h2>Copy the link. Let the preview do the introduction.</h2>
      <p>
        Open a raid, guild, character or talent build and copy its address. For a specific boss
        kill, use the report&apos;s share link. Paste it into your chat with link previews enabled.
        The link still takes everyone to the full page to explore the details.
      </p>
      <p>
        Previews depend on the app receiving the link, and that app may cache an older image.
        Some pages or unavailable data use a general Chronicle image instead. A missing preview
        does not stop the link from working.
      </p>
    </ShortPost>
  );
}
