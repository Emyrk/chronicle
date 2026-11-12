package frontend

import (
	"io/fs"
	"sort"
)

// BlogPost is one pre-rendered blog post from the build's blog manifest.
type BlogPost struct {
	// Path is the post's URL path, e.g. /blog/ratings.
	Path string
	// PublishedAt is the post's publish date (YYYY-MM-DD), or empty.
	PublishedAt string
	post        blogManifestPost
}

// AllowedFor reports whether a site with these flavor tags serves the post,
// by the same rule the blog route enforces.
func (p BlogPost) AllowedFor(flavor []string) bool {
	h := &handler{blogPosts: map[string]blogManifestPost{p.Path: p.post}}
	return h.blogPathAllowed(p.Path, flavor)
}

// BlogPosts lists the posts in the site's blog manifest, newest first. A build
// without a manifest has none.
func BlogPosts(siteFS fs.FS) ([]BlogPost, error) {
	manifest, err := loadBlogManifest(siteFS)
	if err != nil {
		return nil, err
	}
	posts := make([]BlogPost, 0, len(manifest))
	for postPath, post := range manifest {
		posts = append(posts, BlogPost{Path: postPath, PublishedAt: post.PublishedAt, post: post})
	}
	sort.Slice(posts, func(i, j int) bool {
		if posts[i].PublishedAt != posts[j].PublishedAt {
			return posts[i].PublishedAt > posts[j].PublishedAt
		}
		return posts[i].Path < posts[j].Path
	})
	return posts, nil
}
