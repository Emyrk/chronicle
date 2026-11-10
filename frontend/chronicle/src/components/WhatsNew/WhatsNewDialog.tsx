import { ArrowRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { iconUrl } from "@/config/iconUrl";
import { METRIC_THEMES } from "@/pages/Leaderboards/Ratings/ratingThemes";
import { ratePlayerBoss, type Band } from "@/pages/Ratings/ratingMath";
import { whatsNewLink } from "./trackedLinks";

interface WhatsNewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const HIGHLIGHTS = [
  "Peak: your best kill against the benchmark, the best DPS or HPS your spec has ever done on that boss.",
  "Mastery: your best, typical and weaker kills blended, so one lucky kill isn't the whole story.",
  "Renown: every boss kill earns that boss's award, however you performed. It only goes up.",
  "How Ratings Work explains it all with an example player, or with your own kills.",
];

// The /ratings example: a Fury Warrior's Nefarian kills against a 1,180 DPS benchmark.
const EXAMPLE_KILLS = [1000, 820, 1120, 1080, 1060, 1150, 1090, 1130, 1070, 1140];
const EXAMPLE_BENCHMARK = 1180;
const EXAMPLE_RENOWN = EXAMPLE_KILLS.length * 9;
const BAND_COLOR: Record<Band, string> = { ignored: "#3f3f46", floor: "#10b981", form: "#38bdf8", peak: "#fbbf24" };

// Styled as an epic item tooltip: a big feature, short of a legendary launch.
export function WhatsNewDialog({ open, onOpenChange }: WhatsNewDialogProps) {
  const close = () => onOpenChange(false);
  const rating = ratePlayerBoss(EXAMPLE_KILLS, EXAMPLE_BENCHMARK);
  const bandByIndex = new Map(rating.bands.map((b) => [b.index, b.band]));
  const scores = [
    { theme: METRIC_THEMES.peak, label: "Peak", value: rating.peak.toFixed(1) },
    { theme: METRIC_THEMES.mastery, label: "Mastery", value: rating.mastery.toFixed(1) },
    { theme: METRIC_THEMES.renown, label: "Renown", value: String(EXAMPLE_RENOWN) },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-[480px] gap-0 overflow-hidden rounded-md border border-[#5c6670] bg-[linear-gradient(180deg,rgba(10,16,28,0.98),rgba(6,8,16,0.98))] p-0 shadow-[0_24px_60px_rgba(0,0,0,0.7)] sm:max-w-[480px]">
        <div className="grid grid-cols-[56px_minmax(0,1fr)] items-center gap-4 px-6 pt-[22px]">
          <img
            src={iconUrl("inv_crown_01")}
            alt=""
            width={56}
            height={56}
            className="h-14 w-14 rounded border-2 border-quality-epic bg-[#08101c]"
          />
          <div className="flex flex-col gap-1">
            <span className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-quality-epic">
              Epic feature
            </span>
            <DialogTitle className="font-wow text-[28px] font-normal leading-tight text-quality-epic">
              How ratings work
            </DialogTitle>
          </div>
        </div>

        <div className="flex flex-col gap-1 px-6 pb-6 pt-4 text-sm leading-relaxed">
          <p className="text-foreground">Use: Rate every player across their whole history</p>

          <div aria-hidden className="mt-3 flex items-end gap-4 rounded border border-quality-epic/30 bg-black/35 p-3 shadow-inner">
            <div className="flex h-14 flex-1 items-end gap-1">
              {EXAMPLE_KILLS.map((value, i) => (
                <span
                  key={i}
                  className="flex-1 rounded-t-sm"
                  style={{ height: `${((value - 600) / (EXAMPLE_BENCHMARK - 600)) * 100}%`, background: BAND_COLOR[bandByIndex.get(i) ?? "form"] }}
                />
              ))}
            </div>
            <div className="flex flex-col gap-0.5">
              {scores.map(({ theme, label, value }) => (
                <span key={label} className="flex items-center gap-1.5 text-xs">
                  <theme.icon className="h-3.5 w-3.5" style={{ color: theme.accent }} />
                  <span className="w-14 text-muted-foreground">{label}</span>
                  <span className="font-mono font-semibold" style={{ color: theme.accent }}>{value}</span>
                </span>
              ))}
            </div>
          </div>

          <DialogDescription asChild className="mt-4 max-w-[400px] text-[15px] leading-relaxed text-foreground [text-wrap:pretty]">
            <ul>
              {HIGHLIGHTS.map((text) => (
                <li key={text} className="grid grid-cols-[14px_minmax(0,1fr)] gap-2.5">
                  <span aria-hidden className="text-[10px] leading-6 text-quality-epic">◆</span>
                  <span>{text}</span>
                </li>
              ))}
            </ul>
          </DialogDescription>

          <p className="mt-2 italic text-[#ffd100]">&ldquo;Measure thyself.&rdquo;</p>

          <div className="mt-5 flex flex-wrap items-center gap-5">
            {/* Blog routes mount a separate app entry, so these links must reload the document. */}
            <a
              href={whatsNewLink("/blog/ratings", "whats_new_primary", "ratings")}
              onClick={close}
              className="inline-flex items-center gap-2 rounded border border-quality-epic/80 bg-[linear-gradient(180deg,#8a3fd0,#5a2290)] px-[18px] py-2.5 text-sm font-semibold text-white transition-[filter] hover:brightness-110"
            >
              Watch how ratings work
              <ArrowRight className="h-4 w-4" />
            </a>
            <a
              href={whatsNewLink("/blog", "whats_new_archive", "ratings")}
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
