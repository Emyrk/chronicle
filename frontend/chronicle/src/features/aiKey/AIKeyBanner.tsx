import { useState } from "react";
import { Link } from "react-router-dom";
import { KeyRound, X } from "lucide-react";
import { useSession } from "@/api/queries";
import { loadStoredAIKey } from "./aiKeyStore";
import { consumeURLAIKey } from "./urlAIKey";
import { aiKeyBannerKind, type AIKeyBannerKind } from "./aiKeyFormat";

// Read once at startup: index.html already removed the key from the address
// bar. Reading it at module load (not in render) keeps StrictMode's double
// render from losing it.
const urlKey = consumeURLAIKey();

export function AIKeyBannerView({ kind, onDismiss }: { kind: AIKeyBannerKind; onDismiss: () => void }) {
  return (
    <div role="status" className="flex items-start gap-3 border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm">
      <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
      <p className="flex-1">
        {kind === "owner" ? (
          <>
            <strong>This link has your private AI key.</strong> It's for your AI chat, so we removed it from the address bar. It doesn't sign
            anyone in. Don't share the original link.{" "}
          </>
        ) : (
          <>
            <strong>This link had a private AI key in it.</strong> We removed it from the address bar and didn't sign you in with it. If the
            key is yours,{" "}
          </>
        )}
        <Link to="/account/ai-access" className="underline">
          {kind === "owner" ? "Manage it in Settings → AI access" : "revoke it in Settings → AI access"}
        </Link>
        .
      </p>
      <button type="button" onClick={onDismiss} aria-label="Dismiss" className="text-muted-foreground hover:text-foreground">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/** AIKeyBanner tells the viewer the page was opened with an AI key link. */
export function AIKeyBanner() {
  const { data: session, isLoading } = useSession({ enabled: urlKey !== null });
  const [dismissed, setDismissed] = useState(false);
  // Wait for the session: "your key" only if this browser saved it for this user.
  if (urlKey === null || dismissed || isLoading) return null;
  const kind = aiKeyBannerKind(urlKey, loadStoredAIKey(session?.user_id)?.secret);
  if (!kind) return null;
  return <AIKeyBannerView kind={kind} onDismiss={() => setDismissed(true)} />;
}
