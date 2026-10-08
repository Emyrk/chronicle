import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { iconUrl } from "@/config/iconUrl";
import { LessonPlayer } from "@/pages/Instance/PanelExplainer/LessonPlayer";
import { formatPublishedDate, rarityColor, RARITY_LABELS } from "../blogFormat";
import type { BlogPostDefinition } from "../blogRegistry";

/** Shared layout for short announcement-style posts. */
export function ShortPost({ post, children }: { post: BlogPostDefinition; children: ReactNode }) {
  const color = rarityColor(post.rarity);
  const [queryClient] = useState(() => new QueryClient());
  return (
    <article className="mx-auto w-full max-w-3xl px-4 pb-12 pt-12 sm:px-10">
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

      {post.video && (
        <div className="mt-8">
          {/* Some compositions render real panels that call React Query hooks. */}
          <QueryClientProvider client={queryClient}>
            <LessonPlayer video={post.video} lessonId={post.id} />
          </QueryClientProvider>
        </div>
      )}

      <div className="prose prose-invert mt-8 max-w-none prose-a:text-primary prose-a:no-underline [&_a:hover]:underline">
        {children}
      </div>
    </article>
  );
}
