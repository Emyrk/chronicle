import { Suspense, type ReactNode } from "react";
import { useHomeBootstrap } from "./bootstrap";

/**
 * The prerendered homepage is already loaded before hydration. Hydrate it with
 * the shell in one commit, not as a deferred Suspense boundary that live query
 * updates could overtake. Other routes retain their existing loading boundary.
 */
export function HomepageSuspense({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const bootstrap = useHomeBootstrap();
  return bootstrap ? children : <Suspense fallback={fallback}>{children}</Suspense>;
}
