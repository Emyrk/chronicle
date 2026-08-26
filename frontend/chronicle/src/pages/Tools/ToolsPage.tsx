import { Link } from "react-router-dom"
import { Swords, FileText, Youtube, Code, Shirt, Users } from "lucide-react"

const tools = [
  {
    name: "Armory",
    description: "Look up character profiles, gear, and talent builds.",
    to: "/armory",
    icon: <Swords className="h-6 w-6" />,
  },
  {
    name: "Parsing",
    description: "Upload and parse combat logs from your raids.",
    to: "/parsing",
    icon: <FileText className="h-6 w-6" />,
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

export function ToolsPage() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold mb-2">Tools</h1>
      <p className="text-muted-foreground mb-8">
        Chronicle utilities and integrations.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        {tools.map((tool) => (
          <Link
            key={tool.to}
            to={tool.to}
            className="group flex items-start gap-4 rounded-lg border bg-card p-5 transition-colors hover:border-foreground/20 hover:bg-accent/50"
          >
            <div className="mt-0.5 text-muted-foreground group-hover:text-foreground transition-colors">
              {tool.icon}
            </div>
            <div>
              <h2 className="font-semibold group-hover:text-foreground transition-colors">
                {tool.name}
              </h2>
              <p className="text-sm text-muted-foreground">{tool.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
