import { Quote, Plus, X } from "lucide-react";
import type { GuildPanelDefinition, GuildPanelRenderProps } from "./types";

interface GuildQuote {
  text: string;
  who: string;
  context: string;
  when: string;
}

interface QuoteBoardConfig {
  /** Structured quotes; older saves may hold a pipe-separated string. */
  quotes: GuildQuote[] | string;
}

/** Accepts the structured array, or the legacy "Quote | Author | context | date" lines. */
function normalizeQuotes(raw: GuildQuote[] | string | undefined): GuildQuote[] {
  if (Array.isArray(raw)) {
    return raw
      .map((q) => ({
        text: q?.text ?? "",
        who: q?.who ?? "",
        context: q?.context ?? "",
        when: q?.when ?? "",
      }))
      .filter((q) => q.text.length > 0);
  }
  if (typeof raw !== "string") return [];
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

/** Structured editor rendered inside the panel config modal. */
function QuotesEditor({ value, onChange }: { value: unknown; onChange: (value: unknown) => void }) {
  // Keep empty rows while editing; they are dropped at render time.
  const quotes = Array.isArray(value)
    ? (value as GuildQuote[])
    : normalizeQuotes(value as string | undefined);

  const update = (index: number, patch: Partial<GuildQuote>) => {
    onChange(quotes.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  };

  return (
    <div className="space-y-2.5">
      {quotes.length === 0 && (
        <p className="text-xs text-muted-foreground">No quotes yet — add your first one.</p>
      )}
      {quotes.map((quote, i) => (
        <div key={i} className="space-y-1.5 rounded-md border border-border/60 bg-muted/20 p-2.5">
          <div className="flex items-start gap-1.5">
            <textarea
              value={quote.text}
              onChange={(e) => update(i, { text: e.target.value })}
              placeholder="What did they say?"
              rows={2}
              className="flex-1 resize-none rounded-md border border-input bg-background px-2.5 py-1.5 text-sm"
            />
            <button
              type="button"
              onClick={() => onChange(quotes.filter((_, j) => j !== i))}
              className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              title="Remove quote"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-[1fr_1.4fr_72px] gap-1.5">
            <input
              type="text"
              value={quote.who}
              onChange={(e) => update(i, { who: e.target.value })}
              placeholder="Who"
              className="rounded-md border border-input bg-background px-2 py-1 text-xs"
            />
            <input
              type="text"
              value={quote.context}
              onChange={(e) => update(i, { context: e.target.value })}
              placeholder="Context (optional)"
              className="rounded-md border border-input bg-background px-2 py-1 text-xs"
            />
            <input
              type="text"
              value={quote.when}
              onChange={(e) => update(i, { when: e.target.value })}
              placeholder="Date"
              className="rounded-md border border-input bg-background px-2 py-1 text-xs"
            />
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...quotes, { text: "", who: "", context: "", when: "" }])}
        className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
      >
        <Plus className="h-4 w-4" />
        Add quote
      </button>
    </div>
  );
}

function QuoteBoardContent({ config, position, isEditing }: GuildPanelRenderProps<QuoteBoardConfig>) {
  const quotes = normalizeQuotes(config.quotes);

  if (quotes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full min-h-[100px] text-muted-foreground">
        <p className="text-sm text-center px-4">
          {isEditing ? "Open this panel's settings to add quotes." : "No quotes yet"}
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
      label: "Quotes",
      type: "custom",
      render: (value, onChange) => <QuotesEditor value={value} onChange={onChange} />,
    },
  ],
  defaultConfig: {
    quotes: [],
  },
  render: (props) => <QuoteBoardContent {...props} />,
};
