import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { iconUrl } from "@/config/iconUrl";
import { formatPublishedDate, rarityColor, RARITY_LABELS } from "../blogFormat";
import type { BlogPostDefinition } from "../blogRegistry";

/** Shared layout for short announcement-style posts. */
export function ShortPost({ post, children }: { post: BlogPostDefinition; children: ReactNode }) {
  const color = rarityColor(post.rarity);
  return (
    <article className="mx-auto w-full max-w-3xl px-4 pb-20 pt-12 sm:px-10">
      <header className="flex items-start gap-5 border-b border-border pb-8">
        <img
          src={iconUrl(post.icon)}
          alt=""
          width={64}
          height={64}
          className="h-16 w-16 shrink-0 rounded-md border-2"
          style={{ borderColor: color }}
        />
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3 font-mono text-xs uppercase tracking-wide">
            <span className="font-semibold" style={{ color }}>
              {RARITY_LABELS[post.rarity]} · {post.tag}
            </span>
            <span className="text-muted-foreground">{formatPublishedDate(post.publishedAt)}</span>
          </div>
          <h1 className="font-wow text-3xl leading-tight sm:text-4xl" style={{ color }}>{post.title}</h1>
        </div>
      </header>

      <div className="prose prose-invert mt-8 max-w-none prose-a:text-primary prose-a:no-underline hover:prose-a:underline">
        {children}
      </div>

      <div className="mt-12 border-t border-border pt-6">
        <Link to="/blog" className="text-sm font-medium text-muted-foreground hover:text-foreground">
          ← All posts
        </Link>
      </div>
    </article>
  );
}
