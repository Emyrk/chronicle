import { useState } from "react";
import { CheckCircle2, ChevronDown, ChevronRight, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { lineCol } from "./celParser";

export interface CodeParseState {
  error: { message: string; offset: number } | null;
}

const CHEATSHEET: [string, string][] = [
  [`instance.name.contains("molten")`, "partial, case-insensitive"],
  [`instance.name == "Molten Core"`, "exact (case-insensitive)"],
  [`instance.clear_parse({"parse_scope": "realm"}) >= 95`, "options go in ({...})"],
  [`instance.kill_time_parse({"bosses": ["Ragnaros", "Nefarian"], "match": "each"}) >= 90`, "any / each of a boss list"],
  [`encounters.exists(e, e.name == "Ragnaros" && e.killed == true)`, "a pull where…"],
  [`encounters.filter(e, e.outcome == "wipe").size() >= 5`, "count pulls"],
  [`players.exists(p, p.sub_spec == "Bear" && p.sub_spec == "Cat")`, "same player"],
  [`players.filter(p, p.class == "PRIEST").size() >= 3`, "count players"],
  [`p.spec({"on": "trash"}) == "Feral"`, "on: bosses (default), trash, any"],
  [`"unit-position" in instance.capabilities`, "log capability"],
  [`instance.started_at >= timestamp("2026-10-01T00:00:00Z")`, "dates"],
  [`!(…)  a && b  a || b  x in ["a", "b"]`, "not, and, or, lists"],
];

/**
 * Text editor for the query in CEL-style syntax (what "Query text" shows).
 * Syntax is checked as you type; the server validates fields and values.
 */
export function CodeEditor({
  value,
  onChange,
  onSubmit,
  parse,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  parse: CodeParseState;
  disabled?: boolean;
}) {
  const [showHelp, setShowHelp] = useState(false);
  const rows = Math.min(20, Math.max(6, value.split("\n").length + 1));
  const pos = parse.error ? lineCol(value, parse.error.offset) : null;

  return (
    <div className="space-y-2">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !parse.error) {
            e.preventDefault();
            onSubmit();
          }
        }}
        disabled={disabled}
        rows={rows}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        placeholder={`players.filter(p, p.class == "PRIEST").size() >= 3\n&& instance.name.contains("molten")`}
        aria-label="Search query"
        aria-invalid={parse.error ? true : undefined}
        className={cn(
          "w-full rounded-md border bg-zinc-950/60 px-3 py-2 font-mono text-xs leading-relaxed text-zinc-100 outline-none styled-scrollbar resize-y",
          parse.error ? "border-red-500/50 focus:border-red-400" : "border-border focus:border-zinc-500",
          disabled && "opacity-60",
        )}
      />
      <div className="flex items-center justify-between gap-2 flex-wrap text-2xs">
        {parse.error && pos ? (
          <span className="inline-flex items-center gap-1 text-red-300">
            <XCircle className="h-3.5 w-3.5" />
            Line {pos.line}, column {pos.col}: {parse.error.message}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400/80" />
            Syntax OK · Ctrl/⌘+Enter to search
          </span>
        )}
        <button type="button" onClick={() => setShowHelp((v) => !v)} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
          {showHelp ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          Syntax
        </button>
      </div>
      {showHelp && (
        <div className="rounded-md border border-border/60 bg-zinc-900/40 p-2 overflow-x-auto styled-scrollbar">
          <table className="text-2xs">
            <tbody>
              {CHEATSHEET.map(([code, note]) => (
                <tr key={code}>
                  <td className="pr-4 py-0.5 font-mono text-zinc-200 whitespace-nowrap">{code}</td>
                  <td className="py-0.5 text-muted-foreground whitespace-nowrap">{note}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-2xs text-muted-foreground mt-1.5">
            Switch to Blocks to see the field list, or load an Example to see more.
          </p>
        </div>
      )}
    </div>
  );
}
