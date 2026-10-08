import { useSyncExternalStore } from "react";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { Link, Navigate, Outlet, Route, Routes, useParams } from "react-router-dom";
import { serverCapabilities } from "@/config/serverCapabilities";
import {
  blogPostMatchesFlavor,
  blogPostPath,
  blogPostsForFlavor,
  findBlogPost,
  type BlogPostDefinition,
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
      <header className="border-b border-border/80 bg-background/95">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6 sm:px-10">
          <a href="/" className="group inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
            Return to Home
          </a>
          <Link to="/blog" className="font-[Libre_Baskerville] text-sm font-bold tracking-tight text-foreground">
            Chronicle Journal
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

function BlogIndex() {
  const flavor = useSyncExternalStore(
    subscribeToRequestFlavor,
    requestFlavor,
    () => serverCapabilities.defaultFlavor,
  );
  const posts = blogPostsForFlavor(flavor);

  return (
    <div className="mx-auto w-full max-w-6xl px-6 pb-24 pt-16 sm:px-10 sm:pt-24">
      <header className="grid gap-8 border-b border-border pb-14 lg:grid-cols-[0.72fr_1.28fr] lg:items-end">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.28em] text-primary">Chronicle Journal</p>
        <div>
          <h1 className="font-[Libre_Baskerville] text-4xl font-bold tracking-[-0.04em] text-foreground sm:text-6xl">What is new, and why it matters.</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
            Feature announcements, detailed tours, and a permanent history of how Chronicle evolves.
          </p>
        </div>
      </header>

      <div className="divide-y divide-border">
        {posts.map((post, index) => (
          <BlogPostCard key={post.id} post={post} index={index} />
        ))}
      </div>
    </div>
  );
}

function BlogPostCard({ post, index }: { post: BlogPostDefinition; index: number }) {
  return (
    <article className="group grid gap-5 py-10 sm:grid-cols-[8rem_1fr_auto] sm:items-start sm:py-14">
      <div>
        <p className="font-mono text-xs text-muted-foreground">{formatPublishedDate(post.publishedAt)}</p>
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.22em] text-primary">Story {String(index + 1).padStart(2, "0")}</p>
      </div>
      <div className="max-w-2xl">
        <h2 className="font-[Libre_Baskerville] text-2xl font-bold tracking-[-0.025em] text-foreground sm:text-3xl">
          <Link to={blogPostPath(post.id)} className="transition-colors group-hover:text-primary">{post.title}</Link>
        </h2>
        <p className="mt-4 text-base leading-7 text-muted-foreground">{post.description}</p>
      </div>
      <Link
        to={blogPostPath(post.id)}
        aria-label={`Read ${post.title}`}
        className="flex h-10 w-10 items-center justify-center rounded-full border border-border text-muted-foreground transition-all group-hover:-translate-y-1 group-hover:border-primary/50 group-hover:text-primary"
      >
        <ArrowUpRight className="h-4 w-4" />
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
