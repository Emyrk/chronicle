import { Loader2 } from "lucide-react";
import { TechnicalHintCard } from "./TechnicalHintCard";
import { useTechnicalHints } from "./useTechnicalHints";
import type { TechnicalHintKind } from "./types";

const SECTIONS: Array<{ kind: TechnicalHintKind; title: string; description: string }> = [
  { kind: "community_fact", title: "Community activity", description: "A recent snapshot of public Chronicle activity." },
  { kind: "tip", title: "Chronicle tips", description: "Useful features and analysis techniques you may have missed." },
  { kind: "panel", title: "Panel insights", description: "Distinctive ways to get more value from individual analysis panels." },
  { kind: "blog", title: "Chronicle articles", description: "Feature announcements, guides, and technical explanations." },
];

export function TechnicalHintsCatalog() {
  const { data, isLoading } = useTechnicalHints();

  if (!data && isLoading) {
    return (
      <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading Chronicle tips…
      </div>
    );
  }

  if (!data?.payloads.length) return null;

  return (
    <div className="space-y-8">
      {SECTIONS.map((section) => {
        const hints = data.payloads.filter((hint) => hint.kind === section.kind);
        if (hints.length === 0) return null;

        return (
          <section
            key={section.kind}
            id={section.kind === "tip" ? "chronicle-tips" : section.kind === "panel" ? "panel-insights" : undefined}
          >
            <h2 className="text-lg font-semibold">{section.title}</h2>
            <p className="mb-3 text-sm text-muted-foreground">{section.description}</p>
            <div className="grid gap-3 md:grid-cols-2">
              {hints.map((hint) => <TechnicalHintCard key={hint.id} hint={hint} />)}
            </div>
          </section>
        );
      })}
    </div>
  );
}
