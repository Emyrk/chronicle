import { useMemo } from "react";
import { useSiteConfig } from "@/api/queries";
import { blogPostMatchesFlavor, findBlogPost } from "@/blog/blogRegistry";
import { STATIC_TECHNICAL_HINTS_RESPONSE } from "./staticTechnicalHints";

export function useTechnicalHints() {
  const { data: siteConfig } = useSiteConfig();
  const data = useMemo(() => {
    const flavor = siteConfig?.dataset_flavor ?? [];
    return {
      ...STATIC_TECHNICAL_HINTS_RESPONSE,
      payloads: STATIC_TECHNICAL_HINTS_RESPONSE.payloads.filter((hint) => {
        if (hint.kind !== "blog" || !hint.blog_id) return true;
        const post = findBlogPost(hint.blog_id);
        return Boolean(post && blogPostMatchesFlavor(post, flavor));
      }),
    };
  }, [siteConfig?.dataset_flavor]);

  return { data, isLoading: false };
}
