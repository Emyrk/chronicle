import { ArrowLeft, Images } from "lucide-react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/Card/Card";
import { specializationIconUrl } from "@/config/specializationIcon";
import {
  CLASS_CSS_VAR,
  CLASS_DISPLAY,
  SPEC_BY_CLASS,
} from "@/pages/Rankings/classDisplay";

const CLASSES = [
  "WARRIOR",
  "PALADIN",
  "HUNTER",
  "ROGUE",
  "PRIEST",
  "DEATHKNIGHT",
  "SHAMAN",
  "MAGE",
  "WARLOCK",
  "DRUID",
] as const;

function classIconUrl(className: string): string {
  return `/c/icons/class_${className.toLowerCase()}.png`;
}

export function SpecClassIconsPage() {
  return (
    <div className="container mx-auto max-w-5xl px-4 py-4">
      <Link
        to="/technical"
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" />
        Back to Technical
      </Link>

      <div className="mb-1 flex items-center gap-2">
        <Images className="h-5 w-5" />
        <h1 className="text-xl font-bold">Spec/Class Icons</h1>
      </div>
      <p className="mb-5 text-sm text-muted-foreground">
        Reference sheet for the class and specialization icons used throughout Chronicle.
      </p>

      <div className="space-y-0.5">
        {CLASSES.map((className) => {
          const displayName = CLASS_DISPLAY[className];
          return (
            <Card key={className} className="overflow-hidden">
              <div className="grid gap-px bg-border/70 sm:grid-cols-[minmax(170px,0.8fr)_repeat(3,minmax(0,1fr))]">
                <div className="flex items-center gap-3 bg-card p-3">
                  <img
                    src={classIconUrl(className)}
                    alt={`${displayName} class icon`}
                    className="h-12 w-12 rounded-md border border-white/10 object-cover shadow-sm"
                  />
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      Class
                    </p>
                    <h2 className="truncate font-semibold" style={{ color: CLASS_CSS_VAR[className] }}>
                      {displayName}
                    </h2>
                  </div>
                </div>

                {SPEC_BY_CLASS[className].map((spec) => (
                  <div key={spec} className="flex items-center gap-3 bg-card p-3">
                    <img
                      src={specializationIconUrl(displayName, spec)}
                      alt={`${spec} ${displayName} specialization icon`}
                      className="h-12 w-12 rounded-md border border-white/10 object-cover shadow-sm"
                    />
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        Specialization
                      </p>
                      <p className="truncate text-sm font-medium">{spec}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
