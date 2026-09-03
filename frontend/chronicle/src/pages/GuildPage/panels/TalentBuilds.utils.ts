export interface GuildTalentBuild {
  name: string;
  owner: string;
  specialization: string;
  url: string;
}

export interface TalentBuildLinkDetails {
  href: string;
  classSlug: string;
  build: string;
  points: number[];
}

const TALENT_BUILDER_BASE = "https://chronicle.invalid";

export function normalizeTalentBuilds(value: unknown): GuildTalentBuild[] {
  if (!Array.isArray(value)) return [];

  return value.map((entry) => {
    const build = entry && typeof entry === "object" ? entry as Partial<GuildTalentBuild> : {};
    return {
      name: typeof build.name === "string" ? build.name : "",
      owner: typeof build.owner === "string" ? build.owner : "",
      specialization: typeof build.specialization === "string" ? build.specialization : "",
      url: typeof build.url === "string" ? build.url : "",
    };
  });
}

export function talentBuildLinkDetails(value: string): TalentBuildLinkDetails | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const candidate = !trimmed.includes("://") && !trimmed.startsWith("/")
    ? `/${trimmed}`
    : trimmed;

  let url: URL;
  try {
    url = new URL(candidate, TALENT_BUILDER_BASE);
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!/^\/talents(?:\/|$)/.test(url.pathname)) return null;

  const classSlug = url.pathname.split("/").filter(Boolean)[1] ?? "";
  const build = url.searchParams.get("build") ?? "";
  const points = build
    ? build.split("-").map((section) =>
        section.split("").reduce((sum, digit) => sum + (Number.parseInt(digit, 10) || 0), 0),
      )
    : [];

  return {
    href: url.origin === TALENT_BUILDER_BASE ? `${url.pathname}${url.search}${url.hash}` : url.toString(),
    classSlug,
    build,
    points,
  };
}

export function talentClassLabel(classSlug: string): string {
  if (!classSlug) return "Talent build";
  if (classSlug === "deathknight") return "Death Knight";
  return classSlug.charAt(0).toUpperCase() + classSlug.slice(1);
}
