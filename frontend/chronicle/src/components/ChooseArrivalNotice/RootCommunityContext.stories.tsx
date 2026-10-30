import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import {
  BarChart3,
  ChevronRight,
  CircleUserRound,
  Compass,
  Globe2,
  Menu,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Community = {
  name: string;
  slug: string;
  tagline: string;
  players: string;
  logo?: string;
};

const COMMUNITIES: Community[] = [
  {
    name: "Turtle WoW",
    slug: "turtle",
    tagline: "Vanilla, expanded",
    players: "18.4k recent players",
  },
  {
    name: "ChromieCraft",
    slug: "chromie",
    tagline: "Progressive Wrath powered by AzerothCore",
    players: "6.2k recent players",
    logo: "https://icons.chronicleclassic.com/servers/chromiecraft/chromie-square.webp",
  },
  {
    name: "Epoch",
    slug: "epoch",
    tagline: "A new journey through Azeroth",
    players: "3.8k recent players",
  },
  {
    name: "Kronos",
    slug: "kronos",
    tagline: "Classic progression and community",
    players: "1.1k recent players",
  },
];

type RootContextPreviewProps = {
  page: "home" | "account";
  defaultOpen?: boolean;
  defaultDismissed?: boolean;
};

function CommunityMark({ community, large = false }: { community: Community; large?: boolean }) {
  const size = large ? "size-12 rounded-xl text-lg" : "size-9 rounded-lg text-sm";
  if (community.logo) {
    return <img src={community.logo} alt="" className={cn(size, "shrink-0 object-contain")} />;
  }
  return (
    <span
      className={cn(
        size,
        "flex shrink-0 items-center justify-center border border-primary/25 bg-primary/10 font-wow font-semibold text-(--tertiary)",
      )}
    >
      {community.name.charAt(0)}
    </span>
  );
}

function CommunityDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [query, setQuery] = useState("");
  const shown = COMMUNITIES.filter((community) =>
    `${community.name} ${community.tagline}`.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] gap-0 overflow-hidden border-primary/20 p-0 sm:max-w-2xl">
        <DialogHeader className="border-b bg-card/80 px-5 py-5 text-left sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-(--tertiary)">
              <Compass className="size-5" />
            </span>
            <div>
              <DialogTitle className="font-wow text-2xl">Choose your community</DialogTitle>
              <DialogDescription className="mt-1">
                Open Chronicle with the logs, rankings, and game data for where you play.
              </DialogDescription>
            </div>
          </div>
          <label className="mt-4 flex items-center gap-2 rounded-lg border bg-background/70 px-3 py-2.5 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/15">
            <Search className="size-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a community"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </label>
        </DialogHeader>

        <div className="styled-scrollbar grid max-h-[52vh] gap-2 overflow-y-auto bg-background p-3 sm:grid-cols-2 sm:p-4">
          {shown.map((community) => (
            <button
              type="button"
              key={community.slug}
              className="group flex min-w-0 items-center gap-3 rounded-xl border bg-card/55 p-3 text-left transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:bg-card hover:shadow-lg hover:shadow-black/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <CommunityMark community={community} large />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold group-hover:text-(--tertiary)">{community.name}</span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">{community.tagline}</span>
                <span className="mt-1 block font-mono text-[10px] uppercase tracking-wide text-muted-foreground/70">
                  {community.players}
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-(--tertiary)" />
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 border-t bg-card/60 px-5 py-3 text-xs text-muted-foreground">
          <ShieldCheck className="size-4 text-emerald-400" />
          Your account and supporter status work across every community.
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PreviewNav({ compactChooser, onChoose }: { compactChooser: boolean; onChoose: () => void }) {
  return (
    <nav className="flex h-16 items-center border-b bg-background/95 px-4 backdrop-blur md:px-6">
      <button type="button" className="mr-3 rounded-md p-2 text-muted-foreground md:hidden" aria-label="Open menu">
        <Menu className="size-5" />
      </button>
      <img src="/c/chronicle/ChronicleLogoCenter.svg" alt="Chronicle" className="h-11 w-auto" />
      <div className="ml-8 hidden items-center gap-6 text-sm text-muted-foreground md:flex">
        <span>Recent</span>
        <span>Rankings</span>
        <span>Tools</span>
        <span>Supporter</span>
      </div>
      <div className="ml-auto flex items-center gap-2">
        {compactChooser && (
          <Button variant="outline" size="sm" onClick={onChoose} className="gap-2 border-primary/30 bg-primary/5">
            <Globe2 className="size-4 text-(--tertiary)" />
            <span className="hidden sm:inline">Choose community</span>
            <span className="sm:hidden">Community</span>
          </Button>
        )}
        <Button variant="ghost" size="icon" aria-label="Account">
          <CircleUserRound className="size-5" />
        </Button>
      </div>
    </nav>
  );
}

function CommunityStack({ onChoose }: { onChoose: () => void }) {
  const shown = COMMUNITIES.slice(0, 3);
  const extra = COMMUNITIES.length - shown.length;
  return (
    <button
      type="button"
      onClick={onChoose}
      aria-label="Browse communities"
      className="group hidden shrink-0 items-center -space-x-2 rounded-xl sm:flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {shown.map((community, index) => (
        <span
          key={community.slug}
          style={{ zIndex: shown.length - index }}
          className="relative rounded-[0.6rem] bg-background p-0.5 ring-1 ring-primary/30 transition-transform group-hover:-translate-y-0.5"
        >
          <CommunityMark community={community} />
        </span>
      ))}
      {extra > 0 && (
        <span className="relative flex size-10 items-center justify-center rounded-[0.6rem] bg-background font-mono text-[11px] text-muted-foreground ring-1 ring-primary/30 transition-colors group-hover:text-(--tertiary)">
          +{extra}
        </span>
      )}
    </button>
  );
}

function RootContextBar({ onChoose, onDismiss }: { onChoose: () => void; onDismiss: () => void }) {
  return (
    <section className="relative overflow-hidden border-b border-primary/20 bg-[linear-gradient(100deg,color-mix(in_srgb,var(--primary)_16%,var(--background))_0%,color-mix(in_srgb,var(--primary)_5%,var(--background))_45%,var(--background)_80%)]">
      {/* Accent rail, soft glow, and a faint grid so the bar reads as a distinct layer. */}
      <div className="absolute inset-y-0 left-0 w-1 bg-linear-to-b from-(--tertiary) via-primary/60 to-transparent" />
      <div className="absolute -top-16 left-[8%] size-48 rounded-full bg-primary/15 blur-3xl" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,color-mix(in_oklch,var(--foreground)_4%,transparent)_1px,transparent_1px)] mask-[linear-gradient(to_right,black,transparent_55%)] bg-size-[22px_100%]" />
      <div className="absolute inset-x-0 bottom-0 h-px bg-linear-to-r from-transparent via-primary/60 to-transparent" />

      <div className="relative mx-auto flex max-w-7xl flex-col gap-3 py-3.5 pr-12 pl-5 sm:flex-row sm:items-center sm:gap-5 sm:pr-4 sm:pl-6">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <CommunityStack onChoose={onChoose} />
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-(--tertiary)">
              <Globe2 className="size-3" />
              All communities
            </p>
            <p className="mt-0.5 font-wow text-base leading-snug text-foreground sm:text-lg">
              You’re viewing Chronicle across every community
            </p>
            <p className="hidden text-sm text-muted-foreground sm:block">
              Pick where you play for its logs, rankings, and game data.
            </p>
          </div>
        </div>
        <Button size="sm" onClick={onChoose} className="group gap-2 shadow-lg shadow-primary/20 sm:h-9 sm:px-4">
          <Compass className="size-4 transition-transform group-hover:rotate-45" />
          Choose community
          <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onDismiss}
          aria-label="Dismiss for this session"
          className="absolute top-2 right-2 size-8 text-muted-foreground hover:text-foreground sm:static"
        >
          <X className="size-4" />
        </Button>
      </div>
    </section>
  );
}

function HomeContent() {
  return (
    <main>
      <section className="relative overflow-hidden border-b px-5 py-16 md:py-24">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,color-mix(in_oklch,var(--primary)_16%,transparent),transparent_38%)]" />
        <div className="relative mx-auto max-w-6xl">
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-(--tertiary)">Combat logs, made readable</p>
          <h1 className="mt-4 max-w-3xl font-wow text-4xl leading-tight md:text-6xl">Every raid tells a story.</h1>
          <p className="mt-4 max-w-xl text-lg text-muted-foreground">Logs in, insight out. Easy to read, easy to share.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button size="lg"><Upload className="size-4" />Upload a log</Button>
            <Button size="lg" variant="outline">View a sample</Button>
          </div>
        </div>
      </section>
      <section className="mx-auto grid max-w-6xl gap-4 px-5 py-10 sm:grid-cols-3">
        {[
          [BarChart3, "Readable analysis", "Damage, healing, deaths, and performance in one place."],
          [Sparkles, "Replay the pull", "Understand what happened without digging through raw events."],
          [ShieldCheck, "One Chronicle account", "Your profile and supporter status work everywhere."],
        ].map(([Icon, title, copy]) => (
          <div key={String(title)} className="rounded-xl border bg-card/45 p-5">
            <Icon className="size-5 text-(--tertiary)" />
            <h2 className="mt-4 font-semibold">{String(title)}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{String(copy)}</p>
          </div>
        ))}
      </section>
    </main>
  );
}

function AccountContent() {
  return (
    <main className="mx-auto grid max-w-6xl gap-6 px-4 py-8 md:grid-cols-[220px_1fr] md:px-6">
      <aside className="hidden space-y-1 md:block">
        {[
          [Settings, "Settings"],
          [ShieldCheck, "Privacy"],
          [Sparkles, "Appearance"],
        ].map(([Icon, label], index) => (
          <div key={String(label)} className={cn("flex items-center gap-2 rounded-lg px-3 py-2 text-sm", index === 0 ? "bg-muted text-foreground" : "text-muted-foreground")}>
            <Icon className="size-4" />{String(label)}
          </div>
        ))}
      </aside>
      <section className="min-w-0">
        <h1 className="font-wow text-3xl">Account settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">These settings follow you across every Chronicle community.</p>
        <div className="mt-6 space-y-4">
          <div className="rounded-xl border bg-card/50 p-5">
            <h2 className="font-semibold">Profile</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5 text-sm"><span>Display name</span><input value="Emyrk" readOnly className="w-full rounded-md border bg-background px-3 py-2" /></label>
              <label className="space-y-1.5 text-sm"><span>Discord</span><input value="Connected" readOnly className="w-full rounded-md border bg-background px-3 py-2 text-emerald-400" /></label>
            </div>
          </div>
          <div className="rounded-xl border bg-card/50 p-5">
            <h2 className="font-semibold">Shared preferences</h2>
            <p className="mt-1 text-sm text-muted-foreground">Theme, notifications, and accessibility preferences apply on every tenant.</p>
          </div>
        </div>
      </section>
    </main>
  );
}

function RootContextPreview({ page, defaultOpen = false, defaultDismissed = false }: RootContextPreviewProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [dismissed, setDismissed] = useState(defaultDismissed);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PreviewNav compactChooser={dismissed} onChoose={() => setOpen(true)} />
      {!dismissed && <RootContextBar onChoose={() => setOpen(true)} onDismiss={() => setDismissed(true)} />}
      {page === "account" ? <AccountContent /> : <HomeContent />}
      <CommunityDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

const meta = {
  title: "Chooser/Root Context",
  component: RootContextPreview,
  parameters: { layout: "fullscreen" },
  args: { page: "home" },
} satisfies Meta<typeof RootContextPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Root home with the explanatory context bar. Tenant sites would not render it. */
export const Home: Story = {};

/** The selector opens as a focused dialog without replacing the current page. */
export const SelectorOpen: Story = {
  args: { defaultOpen: true },
};

/** Shared pages remain valid and explain that their settings follow the account. */
export const AccountSettings: Story = {
  args: { page: "account" },
};

/** After dismissal, a compact navigation action remains available for the session. */
export const Dismissed: Story = {
  args: { page: "account", defaultDismissed: true },
};

/** Narrow-screen treatment for the root context and community selector. */
export const MobileSelector: Story = {
  args: { defaultOpen: true },
  parameters: {
    viewport: { defaultViewport: "mobile1" },
  },
};
