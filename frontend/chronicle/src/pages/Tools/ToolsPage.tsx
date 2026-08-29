import { Link } from "react-router-dom"
import { Swords, FileText, Youtube, Code, Shirt, Users, Timer, BookOpen } from "lucide-react"

const faq = [
  {
    name: "Parsing",
    description: "Learn how Chronicle calculates parse scores and comparison cohorts.",
    to: "/parsing",
    icon: <FileText className="h-6 w-6" />,
  },
  {
    name: "Speedrunning",
    description: "Learn how Chronicle measures boss time, full raid time, and qualification.",
    to: "/speedrunning",
    icon: <Timer className="h-6 w-6" />,
  },
  {
    name: "Class details",
    description: "See how Chronicle handles class-specific combat log mechanics.",
    to: "/class-details",
    icon: <BookOpen className="h-6 w-6" />,
  },
]

const tools = [
  {
    name: "Armory",
    description: "Look up character profiles, gear, and talent builds.",
    to: "/armory",
    icon: <Swords className="h-6 w-6" />,
  },
  {
    name: "Gear Progression Builder",
    description: "Plan gear sets and upgrades across progression stages.",
    to: "/gear/progression",
    icon: <Shirt className="h-6 w-6" />,
  },
  {
    name: "Census",
    description: "Explore character population, classes, races, and levels.",
    to: "/census",
    icon: <Users className="h-6 w-6" />,
  },
  {
    name: "YouTube Sync",
    description: "Synchronize YouTube video playback with your combat logs.",
    to: "/youtube-sync-v3",
    icon: <Youtube className="h-6 w-6" />,
  },
  {
    name: "Developer API",
    description: "Explore and integrate with the Chronicle REST API.",
    to: "/developers/api",
    icon: <Code className="h-6 w-6" />,
  },
]

function LinkGrid({ items }: { items: typeof faq }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {items.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          className="group flex items-start gap-4 rounded-lg border bg-card p-5 transition-colors hover:border-foreground/20 hover:bg-accent/50"
        >
          <div className="mt-0.5 text-muted-foreground transition-colors group-hover:text-foreground">
            {item.icon}
          </div>
          <div>
            <h3 className="font-semibold transition-colors group-hover:text-foreground">
              {item.name}
            </h3>
            <p className="text-sm text-muted-foreground">{item.description}</p>
          </div>
        </Link>
      ))}
    </div>
  )
}

export function ToolsPage() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-2 text-3xl font-bold">FAQ &amp; Tools</h1>
      <p className="mb-10 text-muted-foreground">
        Guides, utilities, and integrations for Chronicle.
      </p>

      <section className="mb-10">
        <h2 className="mb-4 text-xl font-semibold">FAQ</h2>
        <LinkGrid items={faq} />
      </section>

      <section>
        <h2 className="mb-4 text-xl font-semibold">Tools</h2>
        <LinkGrid items={tools} />
      </section>
    </div>
  )
}
