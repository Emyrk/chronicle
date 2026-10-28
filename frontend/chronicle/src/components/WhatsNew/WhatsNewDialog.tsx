import { ArrowRight, Trophy } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { iconUrl } from "@/config/iconUrl";
import { whatsNewLink } from "./trackedLinks";

interface WhatsNewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const HIGHLIGHTS = [
  "Turn on Ranked in Damage Done to see the damage that counts toward rankings.",
  "Overkill and damage to non-ranked targets move to their own Excluded column.",
  "Leaderboards → Rulesets lists every encounter's ranked targets and speedrun rules.",
];

// Widths are percentages of the preview track: ranked damage, then excluded.
const PREVIEW_ROWS = [
  { name: "Nightshade", color: "#fff569", ranked: 84, excluded: 4 },
  { name: "Frostbyte", color: "#69ccf0", ranked: 61, excluded: 39 },
];

const EXCLUDED_HATCH =
  "repeating-linear-gradient(135deg, rgba(148,163,184,0.5) 0 5px, rgba(148,163,184,0.16) 5px 10px)";

// Styled as a rare item tooltip: a meaningful feature, short of a legendary launch.
export function WhatsNewDialog({ open, onOpenChange }: WhatsNewDialogProps) {
  const close = () => onOpenChange(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-[480px] gap-0 overflow-hidden rounded-md border border-[#5c6670] bg-[linear-gradient(180deg,rgba(10,16,28,0.98),rgba(6,8,16,0.98))] p-0 shadow-[0_24px_60px_rgba(0,0,0,0.7)] sm:max-w-[480px]">
        <div className="grid grid-cols-[56px_minmax(0,1fr)] items-center gap-4 px-6 pt-[22px]">
          <img
            src={iconUrl("ability_warrior_decisivestrike")}
            alt=""
            width={56}
            height={56}
            className="h-14 w-14 rounded border-2 border-quality-rare bg-[#08101c]"
          />
          <div className="flex flex-col gap-1">
            <span className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-quality-rare">
              Rare feature
            </span>
            <DialogTitle className="font-wow text-[28px] font-normal leading-tight text-quality-rare">
              Ranked damage
            </DialogTitle>
          </div>
        </div>

        <div className="flex flex-col gap-1 px-6 pb-6 pt-4 text-sm leading-relaxed">
          <p className="text-foreground">Use: Shows the damage that counts toward rankings</p>

          <div aria-hidden className="mt-3 flex flex-col gap-2 rounded border border-quality-rare/30 bg-black/35 p-3 shadow-inner">
            <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <span className="flex items-center gap-1.5 text-[color:var(--tertiary)]">
                <Trophy className="h-3 w-3" />
                Ranked
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-3 rounded-sm" style={{ background: EXCLUDED_HATCH }} />
                Excluded
              </span>
            </div>
            {PREVIEW_ROWS.map((row) => (
              <div key={row.name} className="grid grid-cols-[76px_minmax(0,1fr)] items-center gap-2">
                <span className="truncate text-xs font-semibold" style={{ color: row.color }}>{row.name}</span>
                <div className="flex h-3 overflow-hidden rounded-sm bg-white/5">
                  <div style={{ width: `${row.ranked}%`, background: row.color, opacity: 0.8 }} />
                  <div style={{ width: `${row.excluded}%`, background: EXCLUDED_HATCH }} />
                </div>
              </div>
            ))}
          </div>

          <DialogDescription asChild className="mt-4 max-w-[400px] text-[15px] leading-relaxed text-foreground [text-wrap:pretty]">
            <ul>
              {HIGHLIGHTS.map((text) => (
                <li key={text} className="grid grid-cols-[14px_minmax(0,1fr)] gap-2.5">
                  <span aria-hidden className="text-[10px] leading-6 text-quality-rare">◆</span>
                  <span>{text}</span>
                </li>
              ))}
            </ul>
          </DialogDescription>

          <p className="mt-2 italic text-[#ffd100]">&ldquo;Overkill is just showing off.&rdquo;</p>

          <div className="mt-5 flex flex-wrap items-center gap-5">
            {/* Blog routes mount a separate app entry, so these links must reload the document. */}
            <a
              href={whatsNewLink("/blog/ranked-damage", "whats_new_primary", "ranked-damage")}
              onClick={close}
              className="inline-flex items-center gap-2 rounded border border-quality-rare/80 bg-[linear-gradient(180deg,#1f6fc4,#0f4a8a)] px-[18px] py-2.5 text-sm font-semibold text-white transition-[filter] hover:brightness-110"
            >
              Watch ranked damage
              <ArrowRight className="h-4 w-4" />
            </a>
            <a
              href={whatsNewLink("/blog", "whats_new_archive", "ranked-damage")}
              onClick={close}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              View all Chronicle updates
            </a>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
