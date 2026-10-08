import { useState, useSyncExternalStore } from "react";
import { ArrowLeft } from "lucide-react";
import { Link, Navigate, Outlet, Route, Routes, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { iconUrl } from "@/config/iconUrl";
import { serverCapabilities } from "@/config/serverCapabilities";
import {
  BLOG_RARITIES,
  blogPostMatchesFlavor,
  blogPostPath,
  blogPostsForFlavor,
  findBlogPost,
  type BlogPostDefinition,
  type BlogRarity,
} from "./blogRegistry";

function formatPublishedDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${months[(month ?? 1) - 1]} ${day}, ${year}`;
}

function requestFlavor(): readonly string[] {
  if (typeof window === "undefined") {
    return serverCapabilities.defaultFlavor;
  }
  return window.__CHRONICLE_BLOG_FLAVOR__ ?? serverCapabilities.defaultFlavor;
}

function BlogLayout() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-10">
          <a href="/" className="group inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
            Return to Home
          </a>
          <Link to="/blog" className="flex items-center gap-2.5 text-foreground">
            <img src={iconUrl("inv_misc_book_09")} alt="" width={28} height={28} className="h-7 w-7 rounded border border-accent" />
            <span className="font-wow text-xl">Chronicle Journal</span>
          </Link>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}

const subscribeToRequestFlavor = () => () => {};

const RARITY_LABELS: Record<BlogRarity, string> = {
  legendary: "Legendary",
  epic: "Epic",
  rare: "Rare",
  uncommon: "Uncommon",
  common: "Common",
};

function rarityColor(rarity: BlogRarity): string {
  return `var(--color-quality-${rarity})`;
}

/** Legendary and epic drops get a soft glow, matching how big the update is. */
function rarityGlow(rarity: BlogRarity): string | undefined {
  if (rarity !== "legendary" && rarity !== "epic") {
    return undefined;
  }
  const color = rarityColor(rarity);
  return `0 0 28px color-mix(in srgb, ${color} 20%, transparent), inset 0 0 40px color-mix(in srgb, ${color} 5%, transparent)`;
}

function postMatchesSearch(post: BlogPostDefinition, query: string): boolean {
  if (!query) {
    return true;
  }
  return [post.title, post.description, post.tag, RARITY_LABELS[post.rarity]]
    .join(" ")
    .toLowerCase()
    .includes(query);
}

function BlogIndex() {
  const flavor = useSyncExternalStore(
    subscribeToRequestFlavor,
    requestFlavor,
    () => serverCapabilities.defaultFlavor,
  );
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
      className="grid gap-6 rounded-lg border bg-card p-6 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-7 sm:p-8"
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
          <Link to={blogPostPath(post.id)}>{post.title}</Link>
        </h2>
        <p className="max-w-3xl text-base leading-7 text-pretty text-foreground sm:text-[17px]">{post.description}</p>
        {post.flavor && <p className="text-[15px] italic text-yellow-400">“{post.flavor}”</p>}
        <div className="mt-1">
          <Button asChild>
            <Link to={blogPostPath(post.id)}>Read the notes</Link>
          </Button>
        </div>
      </div>
    </article>
  );
}

function BlogPostCard({ post }: { post: BlogPostDefinition }) {
  const color = rarityColor(post.rarity);
  return (
    <article
      className="group flex flex-col gap-3.5 rounded-lg border border-t-2 border-border bg-card p-5"
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
        <Link to={blogPostPath(post.id)}>{post.title}</Link>
      </h3>
      <p className="text-sm leading-6 text-pretty text-muted-foreground">{post.description}</p>
      <Link to={blogPostPath(post.id)} className="mt-auto self-end text-xs font-medium text-primary">
        Read →
      </Link>
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
  return <Post />;
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
