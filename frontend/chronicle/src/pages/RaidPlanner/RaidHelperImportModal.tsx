import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { CLASS_CSS_VAR } from "@/pages/Rankings/classDisplay";
import type { PlayerEntry } from "./types";
import type { ParsedSignUp, RaidHelperEvent } from "./raidHelper";
import { fetchRaidHelperEvent, parseEventId, parseSignUps } from "./raidHelper";

interface RaidHelperImportModalProps {
  open: boolean;
  onClose: () => void;
  /** Full guild roster (placed or not) for name matching. */
  roster: PlayerEntry[];
  guildName?: string;
  onApply: (parsed: ParsedSignUp[], event: RaidHelperEvent) => void;
}

/** Modal for importing sign-ups from a raid-helper.xyz event link (design 2a). */
export function RaidHelperImportModal({
  open,
  onClose,
  roster,
  guildName,
  onApply,
}: RaidHelperImportModalProps) {
  const [link, setLink] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [event, setEvent] = useState<RaidHelperEvent | null>(null);
  const [parsed, setParsed] = useState<ParsedSignUp[]>([]);

  if (!open) return null;

  const fetchEvent = async () => {
    const eventId = parseEventId(link);
    if (!eventId) {
      setError("Paste a raid-helper event link, e.g. https://raid-helper.xyz/event/123…");
      return;
    }
    setLoading(true);
    setError(null);
    setEvent(null);
    try {
      const fetched = await fetchRaidHelperEvent(eventId);
      setEvent(fetched);
      setParsed(parseSignUps(fetched, roster));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch the event");
    } finally {
      setLoading(false);
    }
  };

  const toBoard = parsed.filter((p) => p.disposition === "board").length;
  const toBench = parsed.length - toBoard;
  const matched = parsed.filter((p) => p.matchedRoster).length;

  return (
    <div
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      className="fixed inset-0 z-[90] bg-black/45 flex items-center justify-center"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[440px] max-w-[calc(100vw-2rem)] border border-border rounded-[10px] bg-popover shadow-xl p-4"
      >
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-foreground">Import from raid-helper.xyz</p>
            <p className="text-[10px] text-muted-foreground mt-px">
              {guildName ? `matching names against ${guildName}` : "paste an event link"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 p-0.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex gap-2 mt-3">
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void fetchEvent();
            }}
            placeholder="https://raid-helper.xyz/event/…"
            autoFocus
            className="flex-1 min-w-0 px-2.5 py-1.5 bg-card border border-border rounded-md text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            onClick={() => void fetchEvent()}
            disabled={loading}
            className="shrink-0 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Fetch"}
          </button>
        </div>

        {error && <p className="mt-2 text-[11px] text-destructive">{error}</p>}

        {event && (
          <>
            <div className="flex items-baseline gap-2 mt-3">
              <p className="text-xs font-medium text-foreground truncate">
                {event.title || "Untitled event"}
              </p>
              {event.date && <span className="text-[10px] text-muted-foreground">{event.date}</span>}
              <span className="ml-auto text-[10px] text-muted-foreground whitespace-nowrap">
                {toBoard} to board · {toBench} to bench · {matched} matched
              </span>
            </div>
            <div className="styled-scrollbar mt-1.5 max-h-56 overflow-y-auto flex flex-col gap-1">
              {parsed.map(({ entry, disposition, matchedRoster, signUp }) => (
                <div
                  key={signUp.id}
                  className="flex items-center gap-2 px-2 py-1 rounded-md border border-border/40 bg-card"
                >
                  <span
                    className="w-[3px] self-stretch rounded-full shrink-0"
                    style={{ backgroundColor: CLASS_CSS_VAR[entry.cls] ?? CLASS_CSS_VAR.UNKNOWN }}
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className="text-[11.5px] font-medium leading-tight truncate"
                      style={{ color: CLASS_CSS_VAR[entry.cls] ?? CLASS_CSS_VAR.UNKNOWN }}
                    >
                      {entry.name}
                    </p>
                    <p className="text-[9.5px] text-muted-foreground leading-tight truncate">
                      {entry.spec || "spec unknown"}
                      {matchedRoster ? " · roster match" : ""}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 text-[9.5px] ${
                      disposition === "bench" ? "text-amber-400" : "text-muted-foreground"
                    }`}
                  >
                    {disposition === "bench" ? (entry.note || "bench") : "board"}
                  </span>
                </div>
              ))}
              {parsed.length === 0 && (
                <p className="py-4 text-center text-[11px] text-muted-foreground">
                  No importable sign-ups on this event.
                </p>
              )}
            </div>
            {parsed.length > 0 && (
              <div className="flex justify-end mt-3">
                <button
                  onClick={() => {
                    onApply(parsed, event);
                    onClose();
                  }}
                  className="px-3.5 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity"
                >
                  Import {parsed.length} sign-up{parsed.length === 1 ? "" : "s"}
                </button>
              </div>
            )}
          </>
        )}

        <p className="text-[10px] text-muted-foreground/80 mt-3 leading-relaxed">
          Sign-ups are matched to the guild roster by name; unmatched names import as standalone
          players. Absences are skipped.
        </p>
      </div>
    </div>
  );
}
