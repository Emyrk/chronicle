import { useState } from "react";
import { X } from "lucide-react";

const STORAGE_KEY = "beta-banner-dismissed";

const isTurtleArchived =
  window.location.hostname === "turtle.chronicleclassic.com";

export function BetaBanner() {
  const [dismissed, setDismissed] = useState(() => {
    return localStorage.getItem(STORAGE_KEY) === "true";
  });

  // The archived warning is never dismissible.
  if (isTurtleArchived) {
    return (
      <div className="relative bg-amber-500/10 border-b border-amber-500/30 py-2 px-4 text-center text-sm">
        <span className="font-medium text-amber-600 dark:text-amber-400">
          ⚠️ Archived
        </span>
        <span className="text-muted-foreground ml-2">
          Turtle WoW is archived and should no longer be used. Supported servers
          are listed on{" "}
          <a
            href="https://chronicleclassic.com/"
            className="underline text-amber-600 dark:text-amber-400 hover:text-amber-500"
          >
            chronicleclassic.com
          </a>
          .
        </span>
      </div>
    );
  }

  if (dismissed) {
    return null;
  }

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, "true");
    setDismissed(true);
  };

  return (
    <div className="relative bg-blue-500/10 border-b border-blue-500/30 py-2 px-4 text-center text-sm">
      <span className="font-medium text-blue-600 dark:text-blue-400">
        🧪 Beta
      </span>
      <span className="text-muted-foreground ml-2">
        Chronicle is currently in beta. Bugs and feedback can be reported on{" "}
        <a
          href="https://discord.com/invite/gz97ABFVAj"
          target="_blank"
          rel="noopener noreferrer"
          className="underline text-blue-600 dark:text-blue-400 hover:text-blue-500"
        >
          Discord
        </a>
        .
      </span>
      <button
        onClick={handleDismiss}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-blue-500/20 text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Dismiss banner"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
