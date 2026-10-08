import { useState, useSyncExternalStore } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Link, Navigate, Outlet, Route, Routes, useMatch, useParams } from "react-router-dom";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { iconUrl } from "@/config/iconUrl";
import { serverCapabilities } from "@/config/serverCapabilities";
import { formatPublishedDate, rarityColor, rarityGlow, RARITY_LABELS } from "./blogFormat";
import {
  BLOG_RARITIES,
  blogPostMatchesFlavor,
  blogPostPath,
  blogPostsForFlavor,
  findBlogPost,
  type BlogPostDefinition,
  type BlogRarity,
} from "./blogRegistry";

function requestFlavor(): readonly string[] {
  if (typeof window === "undefined") {
    return serverCapabilities.defaultFlavor;
  }
  return window.__CHRONICLE_BLOG_FLAVOR__ ?? serverCapabilities.defaultFlavor;
}

function BlogLayout() {
  const onPost = useMatch("/blog/:post") !== null;
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="relative flex h-16 items-center border-b border-border bg-card px-4 sm:px-6">
        {onPost ? (
          <Link
            to="/blog"
            className="group inline-flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
            All posts
          </Link>
        ) : (
          <span className="hidden px-2 text-sm font-medium text-muted-foreground sm:inline">Journal</span>
        )}
        {/* Center logo returns to the main site, matching the app NavBar. */}
        <a href="/" aria-label="Back to Chronicle" className="ml-auto flex items-center sm:absolute sm:left-1/2 sm:ml-0 sm:-translate-x-1/2">
          <img src="/c/chronicle/ChronicleLogoCenter.svg" alt="Chronicle" className="-my-2 h-15" />
        </a>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}

const subscribeToRequestFlavor = () => () => {};

function postMatchesSearch(post: BlogPostDefinition, query: string): boolean {
  if (!query) {
    return true;
  }
  return [post.title, post.description, post.tag, RARITY_LABELS[post.rarity]]
    .join(" ")
    .toLowerCase()
    .includes(query);
}

/** The request's flavor, hydration-safe against the prerendered default. */
function useRequestFlavor(): readonly string[] {
  return useSyncExternalStore(
    subscribeToRequestFlavor,
    requestFlavor,
    () => serverCapabilities.defaultFlavor,
  );
}

function BlogIndex() {
  const flavor = useRequestFlavor();
  const [search, setSearch] = useState("");
  const [rarity, setRarity] = useState<BlogRarity | "all">("all");

  const query = search.trim().toLowerCase();
  const searched = blogPostsForFlavor(flavor).filter((post) => postMatchesSearch(post, query));
  const posts = searched.filter((post) => rarity === "all" || post.rarity === rarity);
  const [featured, ...rest] = posts;

  const chips: { key: BlogRarity | "all"; label: string; color: string; count: number }[] = [
    { key: "all", label: "All", color: "var(--color-foreground)", count: searched.length },
    ...BLOG_RARITIES.map((key) => ({
      key,
      label: RARITY_LABELS[key],
      color: rarityColor(key),
      count: searched.filter((post) => post.rarity === key).length,
    })),
  ];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-7 px-4 pb-16 pt-12 sm:px-10">
      <header className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">Chronicle Journal</p>
          <h1 className="font-wow text-4xl leading-none text-foreground sm:text-5xl">What's New</h1>
          <p className="text-base text-muted-foreground">Every update to Chronicle.</p>
        </div>
        <Input
          className="sm:w-[340px]"
          placeholder="Search patch notes…"
          aria-label="Search patch notes"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </header>

      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => {
          const active = rarity === chip.key;
          return (
            <button
              key={chip.key}
              type="button"
              onClick={() => setRarity(chip.key)}
              aria-pressed={active}
              className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium"
              style={{
                color: chip.color,
                borderColor: active ? chip.color : "var(--color-border)",
                background: active ? `color-mix(in srgb, ${chip.color} 13%, transparent)` : "transparent",
              }}
            >
              {chip.label}
              <span className="font-mono text-xs text-muted-foreground">{chip.count}</span>
            </button>
          );
        })}
      </div>

      {featured && <FeaturedPostCard post={featured} />}

      {rest.length > 0 && (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {rest.map((post) => (
            <BlogPostCard key={post.id} post={post} />
          ))}
        </div>
      )}

      {posts.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-14 text-center text-muted-foreground">
          No loot matches that search. Try another rarity.
        </div>
      )}
    </div>
  );
}

function PostMeta({ post, stacked }: { post: BlogPostDefinition; stacked?: boolean }) {
  return (
    <div className={`flex font-mono text-xs uppercase tracking-wide ${stacked ? "flex-col gap-0.5" : "flex-wrap items-center gap-3"}`}>
      <span className="font-semibold" style={{ color: rarityColor(post.rarity) }}>
        {RARITY_LABELS[post.rarity]} · {post.tag}
      </span>
      <span className="text-muted-foreground">{formatPublishedDate(post.publishedAt)}</span>
    </div>
  );
}

function FeaturedPostCard({ post }: { post: BlogPostDefinition }) {
  const color = rarityColor(post.rarity);
  return (
    <article
      className="group relative transition-[translate,background-color] hover:-translate-y-0.5 hover:bg-muted/40 has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring grid gap-6 rounded-lg border bg-card p-6 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-7 sm:p-8"
      style={{ borderColor: color, boxShadow: rarityGlow(post.rarity) }}
    >
      <img
        src={iconUrl(post.icon)}
        alt=""
        width={88}
        height={88}
        className="h-[88px] w-[88px] rounded-md border-2"
        style={{ borderColor: color }}
      />
      <div className="flex min-w-0 flex-col gap-3">
        <PostMeta post={post} />
        <h2 className="font-wow text-3xl leading-tight sm:text-4xl" style={{ color }}>
          {/* The title link stretches over the whole card so the entire box is clickable. */}
          <Link to={blogPostPath(post.id)} className="after:absolute after:inset-0 focus-visible:outline-none">{post.title}</Link>
        </h2>
        <p className="max-w-3xl text-base leading-7 text-pretty text-foreground sm:text-[17px]">{post.description}</p>
        {post.flavor && <p className="text-[15px] italic text-yellow-400">“{post.flavor}”</p>}
        <div className="mt-1">
          <span aria-hidden className={buttonVariants()}>Read the notes</span>
        </div>
      </div>
    </article>
  );
}

function BlogPostCard({ post }: { post: BlogPostDefinition }) {
  const color = rarityColor(post.rarity);
  return (
    <article
      className="group relative transition-[translate,background-color] hover:-translate-y-0.5 hover:bg-muted/40 has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring flex flex-col gap-3.5 rounded-lg border border-t-2 border-border bg-card p-5"
      style={{ borderTopColor: color, boxShadow: rarityGlow(post.rarity) }}
    >
      <div className="flex items-center gap-3">
        <img
          src={iconUrl(post.icon)}
          alt=""
          width={40}
          height={40}
          className="h-10 w-10 rounded border-2"
          style={{ borderColor: color }}
        />
        <PostMeta post={post} stacked />
      </div>
      <h3 className="font-wow text-xl leading-tight" style={{ color }}>
        <Link to={blogPostPath(post.id)} className="after:absolute after:inset-0 focus-visible:outline-none">{post.title}</Link>
      </h3>
      <p className="text-sm leading-6 text-pretty text-muted-foreground">{post.description}</p>
      <span aria-hidden className="mt-auto self-end text-xs font-medium text-primary group-hover:underline">
        Read →
      </span>
    </article>
  );
}

function BlogPostRoute({ enforceFlavor }: { enforceFlavor: boolean }) {
  const { post: postID } = useParams();
  const post = findBlogPost(postID);
  if (!post || (enforceFlavor && !blogPostMatchesFlavor(post, requestFlavor()))) {
    return <Navigate to="/blog" replace />;
  }

  const Post = post.component;
  return (
    <>
      <Post post={post} />
      <PostNavigation post={post} />
    </>
  );
}

/** Previous (older) and next (newer) links, in the same order as the index. */
function PostNavigation({ post }: { post: BlogPostDefinition }) {
  const posts = blogPostsForFlavor(useRequestFlavor());
  const index = posts.findIndex((candidate) => candidate.id === post.id);
  const newer = index > 0 ? posts[index - 1] : undefined;
  const older = index >= 0 ? posts[index + 1] : undefined;

  return (
    <nav aria-label="More posts" className="mx-auto w-full max-w-3xl px-4 pb-20 sm:px-10">
      <div className="grid gap-3 border-t border-border pt-8 sm:grid-cols-2">
        {older ? <PostNavigationLink post={older} direction="previous" /> : <div className="hidden sm:block" />}
        {newer && <PostNavigationLink post={newer} direction="next" />}
      </div>
      <div className="mt-6 text-center">
        <Link to="/blog" className="text-sm font-medium text-muted-foreground hover:text-foreground">
          All posts
        </Link>
      </div>
    </nav>
  );
}

function PostNavigationLink({ post, direction }: { post: BlogPostDefinition; direction: "previous" | "next" }) {
  const next = direction === "next";
  return (
    <Link
      to={blogPostPath(post.id)}
      rel={next ? "next" : "prev"}
      className={`group flex items-center gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted/40 ${next ? "flex-row-reverse text-right" : ""}`}
    >
      {next ? (
        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      ) : (
        <ArrowLeft className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-x-0.5" />
      )}
      <img
        src={iconUrl(post.icon)}
        alt=""
        width={36}
        height={36}
        className="h-9 w-9 shrink-0 rounded border-2"
        style={{ borderColor: rarityColor(post.rarity) }}
      />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="font-mono text-xs uppercase tracking-wide text-muted-foreground">{next ? "Next" : "Previous"}</span>
        <span className="truncate font-wow text-base" style={{ color: rarityColor(post.rarity) }}>{post.title}</span>
      </span>
    </Link>
  );
}

export function BlogApp({ enforceFlavor = true }: { enforceFlavor?: boolean }) {
  return (
    <Routes>
      <Route element={<BlogLayout />}>
        <Route path="/blog" element={<BlogIndex />} />
        <Route path="/blog/:post" element={<BlogPostRoute enforceFlavor={enforceFlavor} />} />
        <Route path="*" element={<Navigate to="/blog" replace />} />
      </Route>
    </Routes>
  );
}
