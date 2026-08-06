import { Quote } from "lucide-react";
import type { GuildPanelDefinition, GuildPanelRenderProps } from "./types";

interface QuoteBoardConfig {
  quotes: string;
}

interface GuildQuote {
  text: string;
  who: string;
  context: string;
  when: string;
}

/**
 * One quote per line: "Quote | Author | context | date" — everything after
 * the quote is optional.
 */
function parseQuotes(raw: string): GuildQuote[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [text = "", who = "", context = "", when = ""] = line.split("|").map((p) => p.trim());
      return { text, who, context, when };
    })
    .filter((quote) => quote.text.length > 0);
}

function QuoteBoardContent({ config, position, isEditing }: GuildPanelRenderProps<QuoteBoardConfig>) {
  const quotes = parseQuotes(config.quotes || "");

  if (quotes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full min-h-[100px] text-muted-foreground">
        <p className="text-sm text-center px-4">
          {isEditing
            ? "Open this panel's settings to add quotes (one per line: “Quote | Author | context | date”)."
            : "No quotes yet"}
        </p>
      </div>
    );
  }

  // Two columns of quotes when the panel is wide enough.
  const cols = position.w >= 8 ? 2 : 1;

  return (
    <div
      className="grid gap-2.5 content-start p-1"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {quotes.map((quote, i) => (
        <figure
          key={`${quote.text}-${i}`}
          className="rounded-md border border-border/50 border-l-2 border-l-primary/60 bg-muted/20 px-3.5 py-3"
        >
          <blockquote className="font-wow text-[15px] leading-snug text-foreground/90">
            “{quote.text}”
          </blockquote>
          {(quote.who || quote.context || quote.when) && (
            <figcaption className="mt-2 flex items-baseline gap-2 text-[11.5px] text-muted-foreground/80">
              {quote.who && <span className="font-semibold text-muted-foreground">{quote.who}</span>}
              <span className="min-w-0 flex-1 truncate">{quote.context}</span>
              {quote.when && <span className="shrink-0">{quote.when}</span>}
            </figcaption>
          )}
        </figure>
      ))}
    </div>
  );
}

export const QuoteBoardPanel: GuildPanelDefinition<QuoteBoardConfig> = {
  type: "quote_board",
  label: "Quote Board",
  icon: <Quote className="h-4 w-4" />,
  description: "Memorable things said in raid chat",
  defaultSize: { w: 6, h: 4 },
  minSize: { w: 3, h: 2 },
  maxSize: { w: 12, h: 10 },
  configSchema: [
    {
      name: "quotes",
      label: "Quotes (one per line: “Quote | Author | context | date”)",
      type: "textarea",
      placeholder:
        "I have never stood in fire in my life | Thumbly | after the third Living Bomb | Jul 24\nJust pull it, I have a flask running | Grubnak | 12 seconds before the wipe | Jul 24",
    },
  ],
  defaultConfig: {
    quotes: "",
  },
  render: (props) => <QuoteBoardContent {...props} />,
};
