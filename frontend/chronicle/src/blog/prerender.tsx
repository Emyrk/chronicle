import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { BlogApp } from "./BlogApp";
import { BLOG_POSTS, blogPostPath, type BlogPostMetadata } from "./blogRegistry";

export { withBlogMetadata } from "./blogHead";

export interface PrerenderedBlogPage {
  path: string;
  title: string;
  description: string;
  html: string;
}

export interface BlogManifestPost {
  id: string;
  path: string;
  /** Post title and summary used by the server for BlogPosting JSON-LD. */
  title: string;
  description: string;
  published_at: string;
  flavor_sets: readonly (readonly string[])[];
  voting_enabled: boolean;
  feedback_enabled: boolean;
}

function renderRoute(path: string): string {
  return renderToString(
    <MemoryRouter initialEntries={[path]}>
      <BlogApp enforceFlavor={false} />
    </MemoryRouter>,
  );
}

export function prerenderBlogPages(): PrerenderedBlogPage[] {
  return [
    {
      path: "/blog",
      title: "Chronicle Journal",
      description: "Feature announcements, detailed tours, and a permanent history of how Chronicle evolves.",
      html: renderRoute("/blog"),
    },
    ...BLOG_POSTS.map((post) => {
      const path = blogPostPath(post.id);
      return {
        path,
        title: `${post.title} · Chronicle Journal`,
        description: post.description,
        html: renderRoute(path),
      };
    }),
  ];
}

export function blogManifest(posts: readonly BlogPostMetadata[] = BLOG_POSTS): { posts: BlogManifestPost[] } {
  return {
    posts: posts.map((post) => ({
      id: post.id,
      path: blogPostPath(post.id),
      title: post.title,
      description: post.description,
      published_at: post.publishedAt,
      flavor_sets: post.flavorSets ?? [],
      voting_enabled: post.votingEnabled === true,
      feedback_enabled: post.feedbackEnabled === true,
    })),
  };
}
