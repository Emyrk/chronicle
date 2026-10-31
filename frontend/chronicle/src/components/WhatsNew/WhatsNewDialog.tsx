import { ArrowRight } from "lucide-react";
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
  "Hold Alt (Option on Mac) to outline every player, guild, boss and raid you can inspect.",
  "Alt+click one for a quick menu. On touch screens, press and hold.",
  "Add to compare to line up players' parses on the same fights, then open their full history in a drawer.",
  "Bosses and raids show kill and clear times against your server, realm and guild, free for everyone.",
];

// Outline colors match the real inspector: players, guilds, bosses, raids.
const PREVIEW_NAMES = [
  { name: "Frostbyte", text: "#69ccf0", outline: "#38bdf8" },
  { name: "<Ember Pact>", text: "#fcd34d", outline: "#f59e0b" },
  { name: "Ragnaros", text: "#f1f5f9", outline: "#fb7185" },
  { name: "Molten Core", text: "#f1f5f9", outline: "#a78bfa" },
];

// Kill-time box plots as percentages of the preview track: whiskers, box, median, this pull, parse.
const PREVIEW_PLOTS = [
  { scope: "Server", min: 6, q1: 26, median: 42, q3: 60, max: 92, pull: 22, parse: 81 },
  { scope: "Realm", min: 12, q1: 30, median: 46, q3: 66, max: 94, pull: 22, parse: 79 },
  { scope: "Guild", min: 19, q1: 25, median: 32, q3: 42, max: 52, pull: 22, parse: 92 },
];

// Styled as an epic item tooltip: a big feature that touches every page, short of a legendary launch.
export function WhatsNewDialog({ open, onOpenChange }: WhatsNewDialogProps) {
  const close = () => onOpenChange(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-[480px] gap-0 overflow-hidden rounded-md border border-[#5c6670] bg-[linear-gradient(180deg,rgba(10,16,28,0.98),rgba(6,8,16,0.98))] p-0 shadow-[0_24px_60px_rgba(0,0,0,0.7)] sm:max-w-[480px]">
        <div className="grid grid-cols-[56px_minmax(0,1fr)] items-center gap-4 px-6 pt-[22px]">
          <img
            src={iconUrl("inv_misc_spyglass_02")}
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
              Alt+click to inspect
            </DialogTitle>
          </div>
        </div>

        <div className="flex flex-col gap-1 px-6 pb-6 pt-4 text-sm leading-relaxed">
          <p className="text-foreground">Use: Inspect and compare anyone without leaving the page</p>

          <div aria-hidden className="mt-3 flex flex-col gap-3 rounded border border-quality-epic/30 bg-black/35 p-3 shadow-inner">
            <div className="flex flex-wrap items-center gap-2">
              <kbd className="rounded border border-b-2 border-white/25 bg-white/10 px-1.5 font-mono text-[11px] text-slate-200">Alt</kbd>
              {PREVIEW_NAMES.map((entity) => (
                <span
                  key={entity.name}
                  className="rounded border border-dashed px-1 text-xs font-semibold"
                  style={{ color: entity.text, borderColor: entity.outline }}
                >
                  {entity.name}
                </span>
              ))}
            </div>
            <div className="flex flex-col gap-1.5">
              {PREVIEW_PLOTS.map((plot) => (
                <div key={plot.scope} className="grid grid-cols-[48px_minmax(0,1fr)_20px] items-center gap-2">
                  <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{plot.scope}</span>
                  <div className="relative h-3">
                    <span className="absolute top-1/2 h-px bg-slate-500" style={{ left: `${plot.min}%`, width: `${plot.max - plot.min}%` }} />
                    <span className="absolute inset-y-0.5 rounded-sm border border-slate-400/70 bg-white/10" style={{ left: `${plot.q1}%`, width: `${plot.q3 - plot.q1}%` }} />
                    <span className="absolute inset-y-0 w-0.5 bg-white" style={{ left: `${plot.median}%` }} />
                    <span className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-400" style={{ left: `${plot.pull}%` }} />
                  </div>
                  <span className="text-right font-mono text-xs font-semibold text-quality-epic">{plot.parse}</span>
                </div>
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

          <p className="mt-2 italic text-[#ffd100]">&ldquo;Know thy rivals.&rdquo;</p>

          <div className="mt-5 flex flex-wrap items-center gap-5">
            {/* Blog routes mount a separate app entry, so these links must reload the document. */}
            <a
              href={whatsNewLink("/blog/alt-click-compare", "whats_new_primary", "alt-click-compare")}
              onClick={close}
              className="inline-flex items-center gap-2 rounded border border-quality-epic/80 bg-[linear-gradient(180deg,#8a3fd0,#5a2290)] px-[18px] py-2.5 text-sm font-semibold text-white transition-[filter] hover:brightness-110"
            >
              Watch Alt+click in action
              <ArrowRight className="h-4 w-4" />
            </a>
            <a
              href={whatsNewLink("/blog", "whats_new_archive", "alt-click-compare")}
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
