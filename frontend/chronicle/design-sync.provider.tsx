import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useLayoutEffect, useState, type ReactNode } from "react";

// Provider wrapper for the claude.ai/design sync — supplies the same context
// the app's storybook decorators do: a react-query client (retry disabled)
// and the theme class on <html> (the app's tokens are dark-first; the light
// theme is the classless default, dark is `.dark`).
export function DsProvider({
  children,
  theme = "dark",
}: {
  children?: ReactNode;
  theme?: "dark" | "light";
}) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false } },
      }),
  );
  useLayoutEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    // The app's storybook paints the canvas with the theme background
    // (backgrounds addon, value `var(--background)`); mirror that so
    // previews and designs sit on the themed surface, not a white page.
    document.body.style.background = "var(--background)";
    document.body.style.color = "var(--foreground)";
  }, [theme]);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
