import { Link } from "react-router-dom";
import { ArrowLeft, BookOpen, Braces, Clock, FileCode, FileType2, FlaskConical, Globe2, Images, Map, PawPrint, ShieldAlert, ShieldCheck, Sparkles, Swords, TimerReset } from "lucide-react";
import { useDatasets, useSiteConfig } from "@/api/queries";
import { Card } from "@/components/ui/Card/Card";
import { useDatasetId, useIconBaseUrl } from "@/hooks/useDatasetId";

interface TechnicalLink {
  title: string;
  description: string;
  href: string;
  icon: React.ReactNode;
}

const TECHNICAL_LINKS: TechnicalLink[] = [
  {
    title: "Extra Attack Spells",
    description: "Generated list of spells that grant extra attacks",
    href: "/technical/extra-attack-spells",
    icon: <Swords className="h-4 w-4" />,
  },
  {
    title: "Vulnerability Spells",
    description: "Generated list of spells that modify damage percent taken by school",
    href: "/technical/vulnerability-spells",
    icon: <ShieldAlert className="h-4 w-4" />,
  },
  {
    title: "Periodic Spells",
    description: "List of all spells with periodic effects (DoTs, HoTs, channeled, etc.)",
    href: "/technical/periodic-spells",
    icon: <Sparkles className="h-4 w-4" />,
  },
  {
    title: "Class Spells",
    description: "All spells grouped by player class (SpellClassSet from DBC)",
    href: "/technical/class-spells",
    icon: <BookOpen className="h-4 w-4" />,
  },
  {
    title: "Friendly Class Buffs",
    description: "Castable class spells that apply an aura to friendly players, grouped by class",
    href: "/technical/class-buffs",
    icon: <ShieldCheck className="h-4 w-4" />,
  },
  {
    title: "Pet Targeting Abilities",
    description: "Spells with pet-targeting attributes from DBC (ImplicitTarget, Effect, Attrs)",
    href: "/technical/pet-targeting-abilities",
    icon: <PawPrint className="h-4 w-4" />,
  },
  {
    title: "Consumables",
    description: "Consumable items and the buffs linked through their spell chains",
    href: "/technical/consumables",
    icon: <FlaskConical className="h-4 w-4" />,
  },
  {
    title: "Cooldowns",
    description: "Player cooldowns generated per dataset and grouped by class",
    href: "/technical/cooldowns",
    icon: <TimerReset className="h-4 w-4" />,
  },
  {
    title: "Aura Duration Modifiers",
    description: "Dataset-generated spell durations and all applicable passive modifiers",
    href: "/technical/aura-duration-modifiers",
    icon: <Clock className="h-4 w-4" />,
  },
  {
    title: "Spec/Class Icons",
    description: "Reference sheet for every class and specialization icon",
    href: "/technical/spec-class-icons",
    icon: <Images className="h-4 w-4" />,
  },
  {
    title: "Map Atlas",
    description: "UI map artwork and coordinate metadata published for the active dataset",
    href: "/technical/maps",
    icon: <Map className="h-4 w-4" />,
  },
  {
    title: "Talent Trees",
    description: "Visual talent tree viewer for all classes (from Talent.dbc)",
    href: "/technical/talent-trees",
    icon: <Sparkles className="h-4 w-4" />,
  },
];

function ConfigValue({ values, emptyLabel }: { values: readonly string[]; emptyLabel: string }) {
  if (values.length === 0) {
    return <span className="text-sm text-muted-foreground">{emptyLabel}</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((value) => (
        <code
          key={value}
          className="rounded-md border border-border/70 bg-background/60 px-2 py-1 text-xs text-foreground"
        >
          {value}
        </code>
      ))}
    </div>
  );
}

export function TechnicalDetailsPage() {
  const { data: siteConfig } = useSiteConfig();
  const { data: datasets } = useDatasets();
  const datasetId = useDatasetId();
  const scopedIconBaseUrl = useIconBaseUrl();
  const dataset = datasets?.find((candidate) => candidate.id === datasetId);
  const formats = siteConfig?.tenant?.available_formats?.length
    ? siteConfig.tenant.available_formats
    : siteConfig?.available_formats ?? [];
  const defaultFormat = siteConfig?.tenant?.default_format ?? siteConfig?.default_format;
  const iconBaseUrl = scopedIconBaseUrl ?? dataset?.icon_base_url;

  return (
    <div className="container mx-auto px-4 py-4 max-w-3xl">
      <Link
        to="/"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3"
      >
        <ArrowLeft className="h-3 w-3" />
        Back to Home
      </Link>

      <div className="flex items-center gap-2 mb-1">
        <FileCode className="h-5 w-5" />
        <h1 className="text-xl font-bold">Technical Details</h1>
      </div>

      <p className="text-sm text-muted-foreground mb-4">
        Data dumps from Chronicle's game database.
      </p>

      <Card className="mb-5 gap-0 overflow-hidden border-primary/20 bg-gradient-to-br from-card via-card to-primary/5 p-0">
        <div className="border-b border-border/70 px-4 py-3">
          <div className="flex items-center gap-2">
            <Braces className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Public configuration</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Game-data settings currently advertised by this Chronicle installation.
          </p>
        </div>

        <div className="divide-y divide-border/70">
          <div className="grid gap-2 px-4 py-3 sm:grid-cols-[8rem_1fr] sm:items-start">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" />
              Flavors
            </div>
            <ConfigValue values={siteConfig?.dataset_flavor ?? []} emptyLabel="No flavor tags advertised" />
          </div>

          <div className="grid gap-2 px-4 py-3 sm:grid-cols-[8rem_1fr] sm:items-start">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <FileType2 className="h-3.5 w-3.5" />
              Formats
            </div>
            <div className="space-y-2">
              <ConfigValue values={formats} emptyLabel="All server-supported formats" />
              {defaultFormat && (
                <p className="text-xs text-muted-foreground">
                  Default: <code className="text-foreground">{defaultFormat}</code>
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-2 px-4 py-3 sm:grid-cols-[8rem_1fr] sm:items-start">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Globe2 className="h-3.5 w-3.5" />
              Icon CDN
            </div>
            {iconBaseUrl ? (
              <a
                href={iconBaseUrl}
                target="_blank"
                rel="noreferrer"
                className="break-all font-mono text-xs text-primary hover:underline"
              >
                {iconBaseUrl}
              </a>
            ) : (
              <span className="text-sm text-muted-foreground">No external icon CDN configured</span>
            )}
          </div>
        </div>
      </Card>

      <div className="space-y-1">
        {TECHNICAL_LINKS.map((link) => (
          <Link key={link.href} to={link.href} className="block">
            <Card className="p-4 hover:bg-muted/50 transition-colors">
              <div className="flex items-center gap-3">
                <div className="text-primary">{link.icon}</div>
                <div>
                  <h2 className="text-sm font-medium">{link.title}</h2>
                  <p className="text-xs text-muted-foreground">{link.description}</p>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
