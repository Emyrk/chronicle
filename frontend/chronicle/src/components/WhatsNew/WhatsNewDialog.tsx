import { ArrowRight, Radar, Sparkles, Star, Tag } from "lucide-react";
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
  "Browse raid panels the community built in Lua, like RadarDurability: the raid as a radar of who was close to dying.",
  "Track a module and it shows up under Modules in your instance panel picker.",
  "Build your own in the Module Workshop, with an assistant and real raid logs to try it on.",
  "Tag a release when it's ready, and everyone tracking it gets the update.",
];

// The three things to do with a module, in the colours /modules uses for them.
const STEPS = [
  { icon: Star, label: "Track", color: "#fcd34d" },
  { icon: Sparkles, label: "Build", color: "#c4b5fd" },
  { icon: Tag, label: "Release", color: "#6ee7b7" },
];

// Styled as an epic item tooltip: a big feature, short of a legendary launch.
export function WhatsNewDialog({ open, onOpenChange }: WhatsNewDialogProps) {
  const close = () => onOpenChange(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-[480px] gap-0 overflow-hidden rounded-md border border-[#5c6670] bg-[linear-gradient(180deg,rgba(10,16,28,0.98),rgba(6,8,16,0.98))] p-0 shadow-[0_24px_60px_rgba(0,0,0,0.7)] sm:max-w-[480px]">
        <div className="grid grid-cols-[56px_minmax(0,1fr)] items-center gap-4 px-6 pt-[22px]">
          <img
            src={iconUrl("inv_gizmo_02")}
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
              Community modules
            </DialogTitle>
          </div>
        </div>

        <div className="flex flex-col gap-1 px-6 pb-6 pt-4 text-sm leading-relaxed">
          <p className="text-foreground">Use: Add panels built by other raiders to your raids</p>

          <div aria-hidden className="mt-3 flex items-center gap-3 rounded border border-quality-epic/30 bg-black/35 p-3 shadow-inner">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-white/10 bg-white/5">
              <Radar className="h-5 w-5 text-sky-300" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sky-400">
                chronicle / <span className="font-semibold">RadarDurability</span>
              </p>
              <p className="text-xs text-muted-foreground">Panel · v4</p>
            </div>
            <div className="flex flex-col gap-0.5">
              {STEPS.map(({ icon: Icon, label, color }) => (
                <span key={label} className="flex items-center gap-1.5 text-xs" style={{ color }}>
                  <Icon className="h-3.5 w-3.5" />
                  {label}
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

          <p className="mt-2 italic text-[#ffd100]">&ldquo;Tinkered by raiders, for raiders.&rdquo;</p>

          <div className="mt-5 flex flex-wrap items-center gap-5">
            {/* Blog routes mount a separate app entry, so these links must reload the document. */}
            <a
              href={whatsNewLink("/blog/modules", "whats_new_primary", "modules")}
              onClick={close}
              className="inline-flex items-center gap-2 rounded border border-quality-epic/80 bg-[linear-gradient(180deg,#8a3fd0,#5a2290)] px-[18px] py-2.5 text-sm font-semibold text-white transition-[filter] hover:brightness-110"
            >
              Watch how modules work
              <ArrowRight className="h-4 w-4" />
            </a>
            <a
              href={whatsNewLink("/blog", "whats_new_archive", "modules")}
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
