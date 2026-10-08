import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { BlogApp } from "./BlogApp";
import { BLOG_POSTS, blogPostPath } from "./blogRegistry";

export interface PrerenderedBlogPage {
  path: string;
  title: string;
  description: string;
  html: string;
}

export interface BlogManifestPost {
  id: string;
  path: string;
  flavor_sets: readonly (readonly string[])[];
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

export function blogManifest(): { posts: BlogManifestPost[] } {
  return {
    posts: BLOG_POSTS.map((post) => ({
      id: post.id,
      path: blogPostPath(post.id),
      flavor_sets: post.flavorSets ?? [],
    })),
  };
}
