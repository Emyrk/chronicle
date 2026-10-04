function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isSubsequence(needle: string, haystack: string): boolean {
  let needleIndex = 0;
  for (let index = 0; index < haystack.length && needleIndex < needle.length; index++) {
    if (haystack[index] === needle[needleIndex]) needleIndex++;
  }
  return needleIndex === needle.length;
}

export function fuzzyAuraNameMatch(query: string, auraName: string): boolean {
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;

  const normalizedName = normalize(auraName);
  return terms.every((term) => normalizedName.includes(term) || isSubsequence(term, normalizedName));
}
