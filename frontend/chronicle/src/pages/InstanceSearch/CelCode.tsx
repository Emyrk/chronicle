import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { CEL_TOKEN_CLASS, highlightCEL } from "./celHighlight";

/**
 * Coloured CEL-style query text. With errorOffset, the token at that offset
 * (or the last one, for an error at the end) gets a red wavy underline.
 */
export function CelCode({ code, errorOffset }: { code: string; errorOffset?: number | null }) {
  const tokens = useMemo(() => highlightCEL(code), [code]);
  const errorAt = useMemo(() => {
    if (errorOffset == null) return -1;
    const hit = tokens.findIndex((t) => t.kind !== "space" && errorOffset >= t.at && errorOffset < t.at + t.text.length);
    if (hit >= 0) return hit;
    // Past the end (e.g. "missing )"): mark the last real token.
    for (let i = tokens.length - 1; i >= 0; i--) if (tokens[i].kind !== "space") return i;
    return -1;
  }, [tokens, errorOffset]);
  return (
    <>
      {tokens.map((t, i) => (
        <span key={t.at} className={cn(CEL_TOKEN_CLASS[t.kind], i === errorAt && "underline decoration-red-400 decoration-wavy underline-offset-4")}>
          {t.text}
        </span>
      ))}
    </>
  );
}
