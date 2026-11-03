import { useMemo } from "react";
import { useSiteConfig } from "@/api/queries";
import { CLASS_DISPLAY, SPEC_BY_CLASS } from "@/pages/Rankings/classDisplay";
import { subspecRulesForFlavor } from "@/pages/Subspecs/subspecs";

/**
 * A class / spec / sub-spec choice. Empty strings mean "any". Class uses
 * the search API's values (e.g. DEATH_KNIGHT).
 */
export interface ClassSpec {
  class: string;
  spec: string;
  subSpec: string;
}

export const ANY_CLASS_SPEC: ClassSpec = { class: "", spec: "", subSpec: "" };

/** Search API class value -> the key the display helpers use (DEATH_KNIGHT -> DEATHKNIGHT). */
export function displayKey(cls: string): string {
  return cls.replace(/_/g, "");
}

/** Display key -> search API class value. */
function searchClass(key: string): string {
  return key === "DEATHKNIGHT" ? "DEATH_KNIGHT" : key;
}

export function classLabel(cls: string): string {
  return CLASS_DISPLAY[displayKey(cls)] ?? cls;
}

/** Classes offered, in display order, limited to ones the API accepts. */
export function pickerClasses(allowed?: readonly string[]): string[] {
  return Object.keys(SPEC_BY_CLASS)
    .map(searchClass)
    .filter((c) => !allowed || allowed.includes(c));
}

export function classSpecLabel(v: ClassSpec): string {
  if (!v.class && !v.spec && !v.subSpec) return "";
  const cls = v.class ? classLabel(v.class) : "";
  if (v.subSpec) return `${v.subSpec} ${v.spec}${cls ? ` ${cls}` : ""}`.trim();
  if (v.spec) return `${v.spec}${cls ? ` ${cls}` : ""}`;
  return cls;
}

/** Sub-specs the current site records, keyed by "CLASS/Spec" (display key). */
export function useSubSpecs(): Map<string, string[]> {
  const { data } = useSiteConfig();
  return useMemo(() => {
    const out = new Map<string, string[]>();
    for (const rule of subspecRulesForFlavor(data?.dataset_flavor ?? [])) {
      out.set(`${rule.className.toUpperCase()}/${rule.spec}`, rule.subspecs.map((s) => s.name));
    }
    return out;
  }, [data?.dataset_flavor]);
}
